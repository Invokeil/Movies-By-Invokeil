/* ── Movies by invokeil — Cloudflare Worker API Gateway ───────────────────
   Production edge gateway (mirrors the sandbox Next.js /api/* routes and
   serves the exported SPA).

   Layers:  Browser → this Worker [Cache API · CORS · security headers]
                     ├─ /api/media   → unified catalog gateway (live TMDB):
                     │    lists      trending | popular-movies | popular-tv |
                     │               anime | top-rated | new-releases | genre
                     │    actions    search | detail | similar | mood
                     │    → UnifiedMedia JSON, edge-cached (x-cache HIT|MISS)
                     │    (see src/media-gateway.ts)
                     ├─ /api/img     → image.tmdb.org artwork proxied + stored
                     │                in R2 (invokeil-images) & edge cache —
                     │                p=<tmdb path>, s=<w92..original>
                     ├─ /api/tmdb/*  → api.themoviedb.org  (Bearer token;
                     │                  falls back to the public demo key)
                     ├─ /api/omdb    → www.omdbapi.com     (apikey)
                     ├─ /api/ai      → Gemini → Groq → graceful fallback
                     ├─ /health
                     └─ any other path → static assets (../out, SPA fallback)

   Secrets (wrangler secret put …): TMDB_API_TOKEN, OMDB_API_KEY,
   GEMINI_API_KEY, GROQ_API_KEY.  The browser NEVER holds any key.
   If TMDB_API_TOKEN is unset, TMDB requests fall back to a provisioned
   TMDB_DEMO_KEY api_key secret (optional) instead of failing.              */

import { handleMedia, nlCandidates } from './media-gateway'
import { handleSEO } from './seo'
import { DuoRoom } from './duo'

export { DuoRoom } // Durable Object entrypoint (wrangler scans exports)

/* Minimal R2 surface used by the image proxy (avoids workers-types dep) */
interface R2ObjectLite {
  body: ReadableStream
  httpEtag: string
  writeHttpMetadata(headers: Headers): void
}
interface R2BucketLite {
  get(key: string): Promise<R2ObjectLite | null>
  put(key: string, value: ArrayBuffer | ReadableStream | string): Promise<unknown>
}

export interface Env {
  TMDB_API_TOKEN?: string
  TMDB_DEMO_KEY?: string // optional v3 api_key fallback (provision via `wrangler secret put`)
  OMDB_API_KEY?: string
  GEMINI_API_KEY?: string
  GROQ_API_KEY?: string
  GOOGLE_SITE_VERIFICATION?: string // Search Console meta token — provision via `wrangler secret put`; the VALUE never lives in git
  ALLOWED_ORIGIN?: string // default "*"
  CACHE?: KVNamespace // persistent metadata cache (KV namespace CACHE)
  IMAGES?: R2BucketLite // image store (R2 bucket invokeil-images)
  AI?: { run(model: string, input: Record<string, unknown>): Promise<unknown> } // Workers AI binding
  ASSETS?: { fetch: (req: Request) => Promise<Response> } // static assets binding (wrangler "assets")
  DUO?: {
    idFromName(name: string): { toString(): string }
    get(id: { toString(): string }): { fetch(req: Request): Promise<Response> }
  } // Duo Watch Party rooms (Durable Object binding)
}

const AI_TIMEOUT_MS = 8_000

/* ── helpers ─────────────────────────────────────────────────────────── */

function cors(env: Env): Record<string, string> {
  return {
    'access-control-allow-origin': env.ALLOWED_ORIGIN ?? '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'Content-Type, Authorization',
    'access-control-max-age': '86400',
  }
}

function json(env: Env, body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...cors(env),
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'x-frame-options': 'DENY',
      ...extra,
    },
  })
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

/* ── TMDB proxy (edge-cached via Cache API) ──────────────────────────── */

async function tmdb(req: Request, env: Env, path: string, search: string): Promise<Response> {
  let upstream = `https://api.themoviedb.org/3${path}${search}`
  const headers: Record<string, string> = { accept: 'application/json' }
  if (env.TMDB_API_TOKEN) {
    headers.authorization = `Bearer ${env.TMDB_API_TOKEN}`
  } else if (env.TMDB_DEMO_KEY) {
    /* No token configured → fall back to a provisioned v3 api_key secret so
       the raw proxy keeps working (key is never logged or cached). */
    const params = new URLSearchParams(search)
    params.set('api_key', env.TMDB_DEMO_KEY)
    upstream = `https://api.themoviedb.org/3${path}?${params.toString()}`
  }
  const cacheKey = new Request(upstream)

  const hit = await caches.default.match(cacheKey)
  if (hit) return json(env, await hit.json(), 200, { 'x-cache': 'HIT' })

  const res = await fetchWithTimeout(upstream, { headers }, 12_000)
  if (!res.ok) {
    return json(env, { ok: false, error: `TMDB upstream ${res.status}` }, 502)
  }
  const body = (await res.json()) as unknown

  /* re-populate edge cache — 5 min default TTL */
  const cacheRes = new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=300' },
  })
  const ctx = { waitUntil: (p: Promise<unknown>) => p } as ExecutionContext
  ctx.waitUntil(caches.default.put(cacheKey, cacheRes))

  return json(env, body, 200, { 'x-cache': 'MISS' })
}

/* ── image proxy: /api/img?p=/abc.jpg&s=w500 ───────────────────────────
   Serves TMDB artwork from OUR domain. Lookup order:
     1. R2 (persistent store — every image is saved on first fetch)
     2. edge Cache API (per-colo hot cache)
     3. image.tmdb.org upstream → persisted to R2 + edge, then returned.
   Client never touches image.tmdb.org → artwork always resolves, and
   after first load everything is served from Cloudflare storage.       */

const IMG_SIZES = new Set(['w92', 'w154', 'w185', 'w300', 'w342', 'w500', 'w780', 'w1280', 'original'])
const IMG_PATH_RE = /^\/[A-Za-z0-9._\-/]+\.(jpg|jpeg|png|webp|svg)$/i
const IMG_ORIGIN = 'https://img.invokeil.internal/'

async function imgProxy(env: Env, search: string): Promise<Response> {
  const params = new URLSearchParams(search)
  const p = params.get('p') ?? ''
  const s = params.get('s') ?? 'w500'

  if (!IMG_SIZES.has(s) || !IMG_PATH_RE.test(p) || p.includes('..')) {
    return json(env, { ok: false, error: 'bad image params' }, 400)
  }

  const contentType = p.toLowerCase().endsWith('.png')
    ? 'image/png'
    : p.toLowerCase().endsWith('.webp')
      ? 'image/webp'
      : p.toLowerCase().endsWith('.svg')
        ? 'image/svg+xml'
        : 'image/jpeg'

  const baseHeaders: Record<string, string> = {
    'content-type': contentType,
    'access-control-allow-origin': env.ALLOWED_ORIGIN ?? '*',
    'access-control-allow-methods': 'GET, OPTIONS',
    'cache-control': 'public, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
  }
  const r2Key = `${s}${p}`

  /* 1 — R2 persistent store */
  if (env.IMAGES) {
    try {
      const obj = await env.IMAGES.get(r2Key)
      if (obj) {
        const h = new Headers(baseHeaders)
        obj.writeHttpMetadata(h)
        h.set('etag', obj.httpEtag)
        h.set('x-img-cache', 'R2')
        return new Response(obj.body, { headers: h })
      }
    } catch {
      /* R2 unavailable → continue down the chain */
    }
  }

  /* 2 — edge cache */
  const cacheKey = new Request(IMG_ORIGIN + r2Key)
  try {
    const hit = await caches.default.match(cacheKey)
    if (hit) {
      const res = new Response(hit.body, hit)
      res.headers.set('x-img-cache', 'EDGE')
      return res
    }
  } catch {
    /* Cache API unavailable → direct upstream */
  }

  /* 3 — upstream fetch + persist */
  let buf: ArrayBuffer
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 10_000)
    const res = await fetch(`https://image.tmdb.org/t/p/${s}${p}`, { signal: ctrl.signal })
    clearTimeout(timer)
    if (!res.ok) {
      return json(env, { ok: false, error: `image upstream ${res.status}` }, res.status === 404 ? 404 : 502)
    }
    buf = await res.arrayBuffer()
  } catch {
    return json(env, { ok: false, error: 'image upstream timeout' }, 504)
  }

  const out = new Response(buf, { headers: { ...baseHeaders, 'x-img-cache': 'MISS' } })

  /* persist to R2 (awaited — durability is the point) + edge (best-effort) */
  if (env.IMAGES) {
    try {
      await env.IMAGES.put(r2Key, buf)
    } catch {
      /* best-effort */
    }
  }
  try {
    await caches.default.put(
      cacheKey,
      new Response(buf, {
        headers: { 'content-type': contentType, 'cache-control': 'public, max-age=31536000, immutable' },
      }),
    )
  } catch {
    /* best-effort */
  }

  return out
}

/* ── OMDb proxy (KV-cached — one upstream hit per query, ever) ────────── */

async function omdb(req: Request, env: Env, search: string): Promise<Response> {
  if (!env.OMDB_API_KEY) {
    return json(env, { ok: false, error: 'OMDB_API_KEY not configured — run: wrangler secret put OMDB_API_KEY' }, 503)
  }
  /* cache key strips the apikey; params normalized so i=/t=&s= lookups of
     the same title share one KV entry. 7-day TTL — OMDb data is static. */
  const params = new URLSearchParams(search)
  params.delete('apikey')
  params.sort()
  const cacheKey = env.CACHE ? `omdb:${params.toString()}` : null
  if (cacheKey) {
    try {
      const stored = await env.CACHE.get<string>(cacheKey)
      if (stored) {
        return new Response(stored, {
          status: 200,
          headers: {
            'content-type': 'application/json; charset=utf-8',
            ...cors(env),
            'x-cache': 'HIT',
            'x-content-type-options': 'nosniff',
          },
        })
      }
    } catch {
      /* KV unavailable → live fetch */
    }
  }

  params.set('apikey', env.OMDB_API_KEY)
  const upstream = `https://www.omdbapi.com/?${params.toString()}`

  const res = await fetchWithTimeout(upstream, {}, 10_000)
  if (!res.ok) return json(env, { ok: false, error: `OMDb upstream ${res.status}` }, 502)
  const body = JSON.stringify(await res.json())

  /* only cache successful lookups (Response false/error payloads stay live) */
  try {
    const parsed = JSON.parse(body) as { Response?: string }
    if (parsed.Response === 'True' && cacheKey && env.CACHE) {
      await env.CACHE.put(cacheKey, body, { expirationTtl: 604_800 })
    }
  } catch {
    /* best-effort */
  }

  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...cors(env),
      'x-cache': 'MISS',
      'x-content-type-options': 'nosniff',
    },
  })
}

/* ── AI router: Gemini → Groq → graceful fallback ────────────────────── */

interface AIBody {
  mode?: 'recommend' | 'nlsearch' | 'mood' | 'explain'
  query?: string
  profile?: Record<string, unknown>
  candidates?: unknown[]
  reasonFor?: { title?: string; year?: number; genres?: string[] }
}

const SYSTEM =
  'You are the ranking engine of a movie discovery app called "Movies by invokeil". ' +
  'You never ask for user history, PII, or credentials. Respond with STRICT JSON only — no markdown fences, no commentary.'

const aiCache = new Map<string, { at: number; body: unknown }>()
const AI_TTL = 10 * 60_000

function extractJson(text: string): unknown | null {
  try {
    const cleaned = text.replace(/```json/gi, '```').split('```').join('\n')

    /* 1 — direct parse of the whole output */
    try {
      return JSON.parse(cleaned)
    } catch {
      /* keep trying */
    }

    /* 2 — slice to the outermost object */
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1))
      } catch {
        /* keep trying */
      }
    }

    /* 3 — slice to the outermost ARRAY (bare [...] roots) */
    const a = cleaned.indexOf('[')
    const aEnd = cleaned.lastIndexOf(']')
    if (a !== -1 && aEnd > a) {
      try {
        return JSON.parse(cleaned.slice(a, aEnd + 1))
      } catch {
        /* keep trying */
      }
    }

    /* 4 — regex salvage: pull i/reason pairs even from truncated or
       quote-broken JSON — downstream title-resolver + pool-fill fix the rest */
    const items: { i: string; reason?: string }[] = []
    const re = /"i"\s*:\s*"([^"]{1,120})"(?:\s*,\s*"reason"\s*:\s*"([^"]{0,200})")?/g
    let m: RegExpExecArray | null
    while ((m = re.exec(cleaned)) !== null) items.push({ i: m[1], reason: m[2] })
    if (items.length > 0) return { results: items }

    return null
  } catch {
    return null
  }
}

/* Current Gemini model walk — 2.0/2.5 flash are retired for new keys */
const GEMINI_MODELS = ['gemini-flash-latest', 'gemini-3.6-flash', 'gemini-2.5-flash-latest', 'gemini-2.0-flash']

async function callGemini(system: string, user: string, env: Env): Promise<string> {
  if (!env.GEMINI_API_KEY) throw new Error('no gemini key')
  let lastErr = 'gemini failed'
  for (const model of GEMINI_MODELS) {
    try {
      const res = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${system}\n\n${user}` }] }],
            generationConfig: { temperature: 0.7 },
          }),
        },
        AI_TIMEOUT_MS,
      )
      if (!res.ok) { lastErr = `gemini ${model} ${res.status}`; continue }
      const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text
      if (!text) { lastErr = `gemini ${model} empty`; continue }
      return text
    } catch (e) {
      lastErr = `gemini ${model} ${e instanceof Error ? e.message : 'error'}`
    }
  }
  throw new Error(lastErr)
}

async function callGroq(system: string, user: string, env: Env): Promise<string> {
  if (!env.GROQ_API_KEY) throw new Error('no groq key')
  const res = await fetchWithTimeout(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.7,
        max_tokens: 1024,
      }),
    },
    AI_TIMEOUT_MS,
  )
  if (!res.ok) throw new Error(`groq ${res.status}`)
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const text = data.choices?.[0]?.message?.content
  if (!text) throw new Error('groq empty')
  return text
}

/* Tier 3: Cloudflare Workers AI — runs on our own edge, no external key,
   no datacenter-IP blocking. Primary workhorse until Gemini/Groq return.
   Model walk inside the tier (catalog-verified live, 2026-09).            */
const WORKERS_AI_MODELS = [
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  '@cf/meta/llama-3.1-8b-instruct-fp8',
]

async function callWorkersAI(system: string, user: string, env: Env): Promise<string> {
  if (!env.AI) throw new Error('no workers ai binding')
  let lastErr = 'workers ai failed'
  for (const model of WORKERS_AI_MODELS) {
    try {
      const res = (await env.AI.run(model, {
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        max_tokens: 2048,
        temperature: 0.7,
      })) as {
        response?: unknown // string on classic models; object (chat.completion) on newer ones
        choices?: { message?: { content?: string } }[]
      }

      /* Shape A: chat.completion object → choices[0].message.content
         Shape B: plain string response (classic /-instruct models)        */
      let text: string | undefined
      if (typeof res?.response === 'string') {
        text = res.response
      } else if (res?.response && typeof res.response === 'object') {
        const obj = res.response as { choices?: { message?: { content?: string } }[] }
        text = obj.choices?.[0]?.message?.content
      } else {
        text = res?.choices?.[0]?.message?.content
      }

      if (!text) { lastErr = `${model} empty`; continue }
      return text
    } catch (e) {
      lastErr = `${model}: ${e instanceof Error ? e.message : 'error'}`
    }
  }
  throw new Error(lastErr)
}

async function ai(req: Request, env: Env): Promise<Response> {
  let body: AIBody
  try {
    body = (await req.json()) as AIBody
  } catch {
    return json(env, { ok: false, error: 'bad payload' }, 400)
  }

  const mode = body.mode ?? 'recommend'
  const query = (body.query ?? '').slice(0, 400)
  const key = JSON.stringify([mode, query, body.profile, body.candidates, body.reasonFor])
  const cached = aiCache.get(key)
  if (cached && Date.now() - cached.at < AI_TTL) {
    return json(env, { ...(cached.body as Record<string, unknown>), cached: true })
  }

  let user: string
  if (mode === 'explain') {
    const t = body.reasonFor ?? {}
    user =
      `Taste profile: ${JSON.stringify(body.profile ?? {})}. ` +
      `Why would "${t.title ?? 'this'}" (${t.year ?? ''}, genres: ${(t.genres ?? []).join('/')}) ` +
      `fit this viewer? 2 sentences, JSON: {"answer":"..."}`
  } else {
    const instructions = {
      recommend: `Viewer taste profile: ${JSON.stringify(body.profile ?? {})}. From CANDIDATES pick the 12 best personal recommendations.`,
      nlsearch: `The viewer searches: "${query}". Interpret intent (genre, mood, era, style) and pick the 12 best matches from CANDIDATES.`,
      mood: `Viewer mood: "${query}". Pick the 12 best matches from CANDIDATES.`,
    }[mode]
    user =
      `${instructions} CANDIDATES: ${JSON.stringify(body.candidates ?? [])}. ` +
      `ONLY pick items whose "i" value appears verbatim in CANDIDATES — never invent ids or titles. ` +
      `Reply with ONLY this JSON (no prose, no fences): {"results":[{"i":"<copy the candidate's i field EXACTLY>","reason":"<max 12 words>"}]}`
  }

  /* nlsearch/mood with no candidates supplied → fetch live TMDB candidates
     here (title search + genre-keyword discovery) so the LLM has a real
     catalog to rank. Without this the model is asked to pick from [].      */
  if (
    (mode === 'nlsearch' || mode === 'mood') &&
    !(Array.isArray(body.candidates) && body.candidates.length > 0)
  ) {
    try {
      body.candidates = await nlCandidates(env, query)
    } catch {
      /* leave empty → tiers will likely fail → client local engine */
    }
  }

  /* Tier walk: Gemini → Groq → Workers AI → graceful degradation.
     Per-tier errors surface in the fallback payload (diagnosability).    */
  const tierErrors: string[] = []
  for (const [provider, fn] of [
    ['gemini', () => callGemini(SYSTEM, user, env)],
    ['groq', () => callGroq(SYSTEM, user, env)],
    ['workers-ai', () => callWorkersAI(SYSTEM, user, env)],
  ] as const) {
    let text: string | null = null
    try {
      text = await fn()
      const raw = extractJson(text) as unknown
      /* accept: {results:[...]} | bare [...] | [{results:[...]}] (nested) */
      const unwrapped =
        Array.isArray(raw) &&
        raw.length === 1 &&
        raw[0] !== null && typeof raw[0] === 'object' &&
        (('results' in (raw[0] as object)) || ('answer' in (raw[0] as object)))
          ? raw[0]
          : raw
      const parsed = (Array.isArray(unwrapped) ? { results: unwrapped } : unwrapped) as {
        results?: { i?: unknown; id?: unknown; movie?: unknown; reason?: unknown; why?: unknown }[]
        answer?: string
      } | null
      if (!parsed) throw new Error(`${provider} parse`)

      let out: Record<string, unknown>
      if (mode === 'explain') {
        if (typeof parsed.answer !== 'string') throw new Error(`${provider} no answer`)
        out = { answer: parsed.answer }
      } else {
        /* Tolerate id-key drift AND title-as-id hallucination: models
           sometimes answer with "2001: A Space Odyssey (1968)" instead of
           the candidate's i field. Resolve by exact id first, then by
           normalized title match against the candidate pool we sent.       */
        type Cand = { i?: unknown; id?: unknown; t?: unknown; title?: unknown }
        const cands = (Array.isArray(body.candidates) ? body.candidates : []) as Cand[]
        const norm = (s: unknown) =>
          String(s ?? '').toLowerCase().replace(/\(\d{4}\)/g, '').replace(/[^a-z0-9]/g, '')
        const byId = new Map<string, string>()
        const byTitle = new Map<string, string>()
        for (const c of cands) {
          const ci = typeof (c.i ?? c.id) === 'string' ? String(c.i ?? c.id) : ''
          if (!ci) continue
          byId.set(ci.toLowerCase(), ci)
          const ct = c.t ?? c.title
          if (typeof ct === 'string' && ct) byTitle.set(norm(ct), ci)
        }
        const resolve = (rawId: string): string => {
          if (!rawId) return ''
          const exact = byId.get(rawId.toLowerCase())
          if (exact) return exact
          const n = norm(rawId)
          const nNoYear = n.replace(/\d{4}/g, '')
          const direct = byTitle.get(n) ?? byTitle.get(nNoYear)
          if (direct) return direct
          /* fuzzy containment — models invent "inception_2010" style ids;
             match against candidate titles (min length 4 to avoid noise)  */
          let best: { id: string; len: number } | null = null
          for (const [key, id] of byTitle) {
            if (key.length < 4) continue
            if (n.includes(key) || key.includes(nNoYear)) {
              if (!best || key.length > best.len) best = { id, len: key.length }
            }
          }
          return best?.id ?? ''
        }

        const results = (parsed.results ?? [])
          .map((r) => {
            const idv = r.i ?? r.id ?? r.movie
            const rawId = typeof idv === 'number' ? String(idv) : String(idv ?? '')
            return { id: resolve(rawId), reason: String(r.reason ?? r.why ?? '') }
          })
          .filter((r) => r.id.length > 0)
          .slice(0, 12)

        /* Guarantee a full result set: if the model hallucinated (unmappable
           ids) or returned few picks, fill the remainder from the candidate
           pool itself — already genre/query-matched, popularity-sorted.      */
        if (results.length < 12) {
          const have = new Set(results.map((r) => r.id))
          for (const c of cands) {
            if (results.length >= 12) break
            const ci = typeof (c.i ?? c.id) === 'string' ? String(c.i ?? c.id) : ''
            if (ci && !have.has(ci)) {
              have.add(ci)
              results.push({ id: ci, reason: 'Trending pick matching your search' })
            }
          }
        }

        if (results.length === 0) throw new Error(`${provider} no results`)
        out = { results: results.map((r) => ({ id: r.id, reason: r.reason.slice(0, 120) })) }
      }

      const payload = { ok: true, provider, ...out }
      aiCache.set(key, { at: Date.now(), body: payload })
      return json(env, payload)
    } catch (e) {
      /* advance to next tier */
      const msg = e instanceof Error ? e.message : 'error'
      tierErrors.push(`${provider}: ${msg}`)
      if ((msg.endsWith('parse') || msg.endsWith('no results')) && typeof text === 'string') {
        tierErrors.push(`${provider} raw: ${text.slice(0, 220).replace(/\s+/g, ' ')}`)
      }
    }
  }

  /* All tiers failed → client falls back to its local deterministic engine */
  return json(env, {
    ok: false,
    fallback: true,
    error: 'ai unavailable — local engine takes over',
    ...(tierErrors.length ? { tiers: tierErrors } : {}),
  })
}

/* ── SPA route hygiene (soft-404 guard + robots directives) ───────── */

/* Routes the SPA owns — served as the app shell instead of a junk 404. */
const SPA_PREFIXES = ['/watch', '/library', '/search', '/settings', '/ai', '/privacy', '/movies', '/tv', '/anime', '/movie', '/genre', '/duo']
/* Utility/private routes that must stay out of the index (X-Robots-Tag on
   the raw shell). Indexable hubs (/movies · /tv · /anime) and SEO-rendered
   pages (/movie/{id} · /tv/{id} · /genre/{slug} · /) never reach here.    */
const UTILITY_EXACT = ['/search', '/settings', '/ai', '/privacy']
const UTILITY_SUBPATHS = ['/watch', '/library', '/movie/', '/tv/', '/genre/', '/movies/', '/anime/', '/duo/']

function isKnownSpaPath(p: string): boolean {
  if (p === '/') return true
  return SPA_PREFIXES.some((x) => p === x || p.startsWith(`${x}/`))
}

function isUtilityPath(p: string): boolean {
  if (UTILITY_EXACT.includes(p)) return true
  return UTILITY_SUBPATHS.some((x) => p.startsWith(x))
}

/* ── entrypoint ──────────────────────────────────────────────────────── */

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    const { pathname, search } = url

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env) })

    try {
      if (pathname === '/health') {
        return json(env, { ok: true, service: 'invokeil-movies-api', time: new Date().toISOString() })
      }

      if (pathname.startsWith('/api/tmdb/')) {
        if (req.method !== 'GET') return json(env, { ok: false, error: 'GET only' }, 405)
        return await tmdb(req, env, pathname.replace('/api/tmdb', '') || '/', search)
      }

      if (pathname === '/api/omdb') {
        if (req.method !== 'GET') return json(env, { ok: false, error: 'GET only' }, 405)
        return await omdb(req, env, search)
      }

      if (pathname === '/api/ai') {
        if (req.method !== 'POST') return json(env, { ok: false, error: 'POST only' }, 405)
        return await ai(req, env)
      }

      if (pathname === '/api/img') {
        if (req.method !== 'GET') return json(env, { ok: false, error: 'GET only' }, 405)
        return await imgProxy(env, search)
      }

      /* Duo Watch Party — WebSocket relay into the room's Durable Object.
         The DO is a blind signaling/presence relay: chat, voice and video
         travel P2P (WebRTC DTLS-SRTP) and never touch this server.      */
      if (pathname === '/api/duo/ws') {
        if (!env.DUO) return json(env, { ok: false, error: 'Duo not configured' }, 501)
        const room = url.searchParams.get('room') ?? ''
        if (!/^[a-zA-Z0-9_-]{8,64}$/.test(room)) {
          return json(env, { ok: false, error: 'bad room' }, 400)
        }
        const stub = env.DUO.get(env.DUO.idFromName(room))
        return stub.fetch(new Request(req, { url: req.url }))
      }

      if (pathname === '/api/media') {
        if (req.method !== 'GET') return json(env, { ok: false, error: 'GET only' }, 405)
        return await handleMedia(new URL(req.url), env)
      }

      /* Static assets (exported SPA) + SEO/AEO layer.
         SEO renders crawler-facing pages & per-URL head patches; the SPA
         itself is untouched. Unknown paths get a REAL 404 (no soft-404). */
      if (env.ASSETS && !pathname.startsWith('/api') && pathname !== '/health') {
        if (req.method !== 'GET') return env.ASSETS.fetch(req)

        /* 1 — SEO layer: sitemap, bot pages, head-injected shells, 404s */
        try {
          const seoRes = await handleSEO(req, env)
          if (seoRes) return seoRes
        } catch (e) {
          /* the SEO layer must never take the site down → SPA flow.
             Failures are logged so regressions stay diagnosable. */
          console.error(`[seo] layer failed for ${pathname}`, e instanceof Error ? `${e.message}\n${e.stack}` : e)
        }

        /* /index.html duplicates / → permanent redirect */
        if (pathname === '/index.html') {
          return Response.redirect(new URL('/', req.url).toString(), 301)
        }

        /* 2 — real static files pass straight through (never SEO/SPA-rewritten).
           Extensions + /_next/ cover JS/CSS/fonts/images/manifest/etc.;
           extension-less app routes continue to the SPA/404 logic below.   */
        const isStaticFile = pathname.startsWith('/_next/') || /\.[a-zA-Z0-9]{1,8}$/.test(pathname)
        if (isStaticFile) {
          const asset = await env.ASSETS.fetch(req)
          /* SPA fallback for a file-shaped URL would be a soft-404 (200 HTML
             at a bogus asset path) → convert to a real 404 instead.        */
          const ct = asset.headers.get('content-type') ?? ''
          if (asset.ok && !ct.includes('text/html')) {
            /* Content-hashed build output can be cached forever: every HTML
               view revalidates (max-age=0), so a deploy can never make HTML
               reference a hash the current deployment does not ship.        */
            if (pathname.startsWith('/_next/static/')) {
              const h = new Headers(asset.headers)
              h.set('cache-control', 'public, max-age=31536000, immutable')
              return new Response(asset.body, { status: asset.status, headers: h })
            }
            return asset
          }
          const nf = await env.ASSETS.fetch(
            new Request(new URL('/404.html', req.url), { headers: req.headers }),
          )
          if (nf.ok && (nf.headers.get('content-type') ?? '').includes('text/html')) {
            return new Response(nf.body, {
              status: 404,
              headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex, nofollow', 'cache-control': 'no-store', 'cdn-cache-control': 'no-store' },
            })
          }
          return new Response('Not found', {
            status: 404,
            headers: { 'content-type': 'text/plain; charset=utf-8', 'x-robots-tag': 'noindex, nofollow', 'cache-control': 'no-store', 'cdn-cache-control': 'no-store' },
          })
        }

        /* 3 — junk paths → real 404 + noindex (SPA still boots for users) */
        if (!isKnownSpaPath(pathname)) {
          const nf = await env.ASSETS.fetch(new Request(new URL('/', req.url), { headers: req.headers }))
          const html = nf.ok ? await nf.text() : ''
          if (html) {
            return new Response(html, {
              status: 404,
              headers: {
                'content-type': 'text/html; charset=utf-8',
                'x-robots-tag': 'noindex, nofollow',
                'cache-control': 'no-store',
                'cdn-cache-control': 'no-store',
              },
            })
          }
          return new Response('Not found', {
            status: 404,
            headers: { 'content-type': 'text/plain; charset=utf-8', 'x-robots-tag': 'noindex, nofollow', 'cache-control': 'no-store', 'cdn-cache-control': 'no-store' },
          })
        }

        /* 3 — SPA shell; utility routes (search/library/watch/browse)
           stay out of the index via X-Robots-Tag. HTML always revalidates
           (max-age=0) so a fresh deploy can never meet a stale cached
           shell referencing deleted chunk hashes.                        */
        const assetsRes = await env.ASSETS.fetch(req)
        const ct = assetsRes.headers.get('content-type') ?? ''
        if (ct.includes('text/html')) {
          const h = new Headers(assetsRes.headers)
          h.set('cache-control', 'public, max-age=0, must-revalidate')
          /* zone-level caches must never hold HTML — the worker is the only
             HTML authority (deploy-safety invariant: fresh HTML ↔ live chunks) */
          h.set('cdn-cache-control', 'no-store')
          if (isUtilityPath(pathname)) h.set('x-robots-tag', 'noindex, follow')
          /* Search Console verification — token resolved from a Worker secret
             at runtime, so the value is never present in source control.    */
          const gv = env.GOOGLE_SITE_VERIFICATION
          if (gv && assetsRes.status === 200) {
            try {
              let html = await assetsRes.text()
              if (!html.includes('google-site-verification')) {
                html = html.replace(
                  /<head[^>]*>/i,
                  (m) => `${m}\n<meta name="google-site-verification" content="${gv.replace(/["&<>]/g, '')}">`,
                )
              }
              h.set('content-length', new TextEncoder().encode(html).length.toString())
              return new Response(html, { status: assetsRes.status, headers: h })
            } catch {
              /* body read failed → fall through to streaming response */
            }
          }
          return new Response(assetsRes.body, { status: assetsRes.status, headers: h })
        }
        return assetsRes
      }

      return json(env, { ok: false, error: 'not found' }, 404)
    } catch {
      return json(env, { ok: false, error: 'upstream failure' }, 502)
    }
  },
}
