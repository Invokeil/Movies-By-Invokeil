import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'
import { CATALOG, moodPool } from '@/lib/data/catalog'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/* ── AI Router (Worker /api/ai equivalent) ────────────────────────────
   Privacy model: NEVER receives raw watch history. The client sends a
   minimal taste profile + candidate pool; the model only ranks.

   Provider fallback chain (tried in order, 8s timeout each):
     Tier 1  gemini → Gemini 2.0 Flash        (GEMINI_API_KEY)
     Tier 2  groq   → llama-3.3-70b-versatile (GROQ_API_KEY)
     Tier 3  zai    → built-in z-ai-web-dev-sdk
   Keys are read from process.env at request time, server-side only —
   never hardcoded, never logged, never exposed to the client.          */

const aiCache = new Map<string, { at: number; body: unknown }>()
const AI_TTL = 10 * 60_000
const PROVIDER_TIMEOUT_MS = 8_000

interface Profile {
  genres?: string[]
  languages?: string[]
  preferredDecades?: number[]
  likedPeople?: string[]
  ratingPreference?: number
}

type Mode = 'recommend' | 'nlsearch' | 'mood' | 'explain'
type ProviderLabel = 'gemini' | 'groq' | 'zai'

function compactPool(ids?: string[]) {
  const pool = ids
    ? CATALOG.filter((m) => ids.includes(m.id))
    : CATALOG
  return pool.map((m) => ({
    i: m.id,
    t: m.title,
    g: m.genres,
    y: m.year,
    r: m.voteAverage,
    mt: m.mediaType,
    d: m.director,
  }))
}

function extractJson(text: string): unknown | null {
  try {
    const cleaned = text.replace(/```json/gi, '```').split('```').join('\n')
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start === -1 || end === -1) return null
    return JSON.parse(cleaned.slice(start, end + 1))
  } catch {
    return null
  }
}

/* fetch + hard 8s timeout via AbortController */
async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), PROVIDER_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: ac.signal })
  } finally {
    clearTimeout(timer)
  }
}

/* Race a promise against the shared provider timeout (for SDK calls
   that do not expose an AbortSignal). */
async function withTimeout<T>(p: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timeout`)), PROVIDER_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/* Tier 1 — Gemini 2.0 Flash */
async function callGemini(system: string, user: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('no key')
  const res = await fetchWithTimeout(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${system}\n\n${user}` }] }],
        generationConfig: { temperature: 0.7 },
      }),
    },
  )
  if (!res.ok) throw new Error(`http ${res.status}`)
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (typeof text !== 'string' || !text.trim()) throw new Error('empty response')
  return text
}

/* Tier 2 — Groq llama-3.3-70b-versatile (OpenAI-compatible endpoint) */
async function callGroq(system: string, user: string): Promise<string> {
  const key = process.env.GROQ_API_KEY
  if (!key) throw new Error('no key')
  const res = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.7,
      max_tokens: 1024,
    }),
  })
  if (!res.ok) throw new Error(`http ${res.status}`)
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const text = data.choices?.[0]?.message?.content
  if (typeof text !== 'string' || !text.trim()) throw new Error('empty response')
  return text
}

/* Tier 3 — built-in z-ai-web-dev-sdk (existing call, kept as-is) */
async function callZai(system: string, user: string): Promise<string> {
  const zai = await ZAI.create()
  const completion = await withTimeout(
    zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: system },
        { role: 'user', content: user },
      ],
      thinking: { type: 'disabled' },
    }),
    'zai',
  )
  const text = completion.choices?.[0]?.message?.content ?? ''
  if (!text.trim()) throw new Error('empty response')
  return text
}

/* Walk the provider chain in order; advance to the next provider on
   ANY error or timeout. Resolves with the first provider that returns
   usable text; throws with a per-provider error summary if all fail.  */
async function callAI(
  system: string,
  user: string,
): Promise<{ text: string; provider: ProviderLabel }> {
  const tiers: { provider: ProviderLabel; run: () => Promise<string> }[] = [
    { provider: 'gemini', run: () => callGemini(system, user) },
    { provider: 'groq', run: () => callGroq(system, user) },
    { provider: 'zai', run: () => callZai(system, user) },
  ]
  const errors: string[] = []
  for (const tier of tiers) {
    try {
      const text = await tier.run()
      return { text, provider: tier.provider }
    } catch (e) {
      errors.push(`${tier.provider}: ${e instanceof Error ? e.message : 'failed'}`)
    }
  }
  throw new Error(errors.join(' | ') || 'all providers failed')
}

export async function POST(req: NextRequest) {
  let payload: {
    mode?: Mode
    query?: string
    profile?: Profile
    candidateIds?: string[]
    reasonFor?: string
  }
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'bad payload' }, { status: 400 })
  }

  const mode = payload.mode ?? 'recommend'
  const query = (payload.query ?? '').slice(0, 400)
  const profile = payload.profile ?? {}

  const cacheKey = JSON.stringify([mode, query, profile, payload.candidateIds, payload.reasonFor])
  const cached = aiCache.get(cacheKey)
  if (cached && Date.now() - cached.at < AI_TTL) {
    return NextResponse.json({ ...(cached.body as object), cached: true })
  }

  const system =
    'You are the ranking engine of a movie discovery app called "Movies by InvokeIL". ' +
    'You never ask for user history,PII, or credentials. Respond with STRICT JSON only — no markdown fences, no commentary.'

  try {
    let out: Record<string, unknown> = {}

    if (mode === 'explain') {
      const target = CATALOG.find((m) => m.id === payload.reasonFor)
      if (!target) throw new Error('unknown media')
      const user = `Taste profile: ${JSON.stringify(profile)}. Why would "${target.title}" (${target.year}, genres: ${target.genres.join('/')}) fit this viewer? 2 sentences, JSON: {"answer":"..."}`
      const { text, provider } = await callAI(system, user)
      const parsed = extractJson(text)
      if (!parsed || typeof (parsed as { answer?: unknown }).answer !== 'string') throw new Error('parse')
      out = { ...(parsed as Record<string, unknown>), provider }
    } else {
      const pool = compactPool(payload.candidateIds)
      const instructions: Record<Mode, string> = {
        recommend:
          `Viewer taste profile: ${JSON.stringify(profile)}. ` +
          `From CANDIDATES pick the 12 best personal recommendations.`,
        nlsearch:
          `The viewer searches: "${query}". Interpret intent (genre, mood, era, style) ` +
          `and pick the 12 best matches from CANDIDATES.`,
        mood: `Viewer mood: "${query}". Pick the 12 best matches from CANDIDATES.`,
        explain: '',
      }
      const user =
        instructions[mode] +
        ` CANDIDATES: ${JSON.stringify(pool)}. ` +
        `Reply JSON: {"results":[{"i":"<id>","reason":"<max 12 words>"}]}`
      const { text, provider } = await callAI(system, user)
      const parsed = extractJson(text) as { results?: { i?: string; reason?: string }[] } | null
      const results = (parsed?.results ?? [])
        .filter((r) => typeof r.i === 'string')
        .slice(0, 12)
        .map((r) => ({ id: r.i, reason: (r.reason ?? '').slice(0, 120) }))
      if (results.length === 0) throw new Error('no results')
      out = { provider, results }
    }

    aiCache.set(cacheKey, { at: Date.now(), body: out })
    return NextResponse.json({ ok: true, ...out })
  } catch (e) {
    /* Graceful degradation → client falls back to local engine */
    return NextResponse.json({
      ok: false,
      fallback: true,
      error: e instanceof Error ? e.message : 'ai unavailable',
    })
  }
}

/* Local deterministic pre-filter for mood mode (kept server-side as a
   demonstration of the "local recommender" tier in the fallback chain) */
export async function GET() {
  return NextResponse.json({ ok: true, providers: ['gemini', 'groq', 'zai'], cacheEntries: aiCache.size })
}
