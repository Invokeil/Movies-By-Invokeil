/* ── Movies by invokeil — /api/media unified catalog gateway ──────────────
   Live-TMDB replacement for the sandbox Next.js /api/media route.
   Data contract (all responses JSON):

     ?list=trending              → { results: UnifiedMedia[] }
     ?list=popular-movies        → { results: UnifiedMedia[] }
     ?list=popular-tv            → { results: UnifiedMedia[] }
     ?list=anime                 → { results: UnifiedMedia[] }
     ?list=top-rated             → { results: UnifiedMedia[] }
     ?list=new-releases          → { results: UnifiedMedia[] }
     ?list=genre&genre=<Name|id> → { results: UnifiedMedia[] }
     ?action=search&q=<query>    → { results: UnifiedMedia[] }
     ?action=detail&id=movie-27205|tv-94605
                                 → { result: UnifiedMedia }
                                 |  404 { error: 'not found' }
     ?action=similar&id=<id>     → { results: UnifiedMedia[] }
     ?action=mood&moods=a,b,c    → { results: UnifiedMedia[] }

   Resilience: upstream failures NEVER hard-500 the client — every
   list-shaped action answers 200 { results: [] }; only detail can 404.

   Edge cache: caches.default keyed by
     https://cache.invokeil.internal/<tmdb-url-without-api-key>
   (synthetic origin so the Cache API always works). TTLs — lists 5 min,
   detail 10 min, search/mood 60 s. Every response carries x-cache: HIT|MISS.

   Auth: TMDB_API_TOKEN secret (Bearer) when set; otherwise the public TMDB
   demo key is appended as api_key=. Keys are never logged.                 */

import type { Env } from './worker'

/* ── UnifiedMedia — mirrors src/lib/types.ts EXACTLY ─────────────────── */

export type MediaType = 'movie' | 'tv' | 'anime'

export interface CastMember {
  name: string
  character: string
  profilePath?: string // TMDB profile image path — served via /api/img (R2 + edge)
}

export interface SeasonInfo {
  season: number
  episodes: number
  title?: string
}

export interface UnifiedMedia {
  id: string // e.g. "movie-27205" — tmdbId + type
  mediaType: MediaType
  tmdbId: number
  malId?: number // anime MAL identity layer (not resolved by TMDB gateway)
  title: string
  originalTitle?: string
  overview: string
  tagline?: string
  releaseDate: string
  year: number
  runtime?: number // minutes (movies, detail only)
  genres: string[]
  voteAverage: number
  voteCount: number
  popularity: number
  originalLanguage: string
  posterPath?: string // TMDB poster path e.g. "/9n2eJB.jpg" — served via /api/img
  backdropPath?: string // TMDB backdrop path — wide art
  cast: CastMember[]
  director?: string // movie director / show creator (detail only)
  seasons?: SeasonInfo[]
  episodeRuntime?: number
  /* OMDb enrichment fields — optional, applied by other layers */
  imdbRating?: number
  metascore?: number
  rated?: string
  awards?: string
  boxOffice?: string
}

/* ── constants ───────────────────────────────────────────────────────── */

/* No hardcoded keys in source. Auth resolution order:
   1. TMDB_API_TOKEN secret  → Bearer header (recommended, v4 read token)
   2. TMDB_DEMO_KEY secret   → api_key= query param (v3 fallback, optional) */
const TMDB_BASE = 'https://api.themoviedb.org/3'
const CACHE_ORIGIN = 'https://cache.invokeil.internal/'

const TTL_LIST = 300 // 5 min
const TTL_DETAIL = 600 // 10 min
const TTL_SEARCH = 60 // 60 s
const TTL_MOOD = 60 // 60 s (mirrors the Next route's short mood TTL)
const UPSTREAM_TIMEOUT_MS = 12_000

/* Genre name → id maps. Keys are normalised (lowercase, non-alphanumerics
   stripped) so "Sci-Fi", "sci fi" and "SciFi" all resolve.                */

const MOVIE_GENRES: Record<string, number> = {
  action: 28,
  adventure: 12,
  animation: 16,
  comedy: 35,
  crime: 80,
  documentary: 99,
  drama: 18,
  family: 10751,
  fantasy: 14,
  history: 36,
  horror: 27,
  music: 10402,
  mystery: 9648,
  romance: 10749,
  scifi: 878,
  thriller: 53,
  war: 10752,
  western: 37,
}

const TV_GENRES: Record<string, number> = {
  drama: 18,
  comedy: 35,
  animation: 16,
  scififantasy: 10765,
  mystery: 9648,
  crime: 80,
  reality: 10764,
  documentary: 99,
  talk: 10767,
  war: 10768,
  family: 10751,
  kids: 10762,
}

/* Combined movie+tv id → name map (list items carry only genre_ids) */
const GENRE_NAMES: Record<number, string> = {
  28: 'Action',
  12: 'Adventure',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Drama',
  10751: 'Family',
  14: 'Fantasy',
  36: 'History',
  27: 'Horror',
  10402: 'Music',
  9648: 'Mystery',
  10749: 'Romance',
  878: 'Sci-Fi',
  53: 'Thriller',
  10752: 'War',
  37: 'Western',
  /* tv-only ids */
  10765: 'Sci-Fi & Fantasy',
  10764: 'Reality',
  10767: 'Talk',
  10768: 'War',
  10762: 'Kids',
}

/* Moods → genre ids (deduped in arrival order; unknown/empty → drama) */
const MOOD_GENRES: Record<string, number> = {
  feelgood: 35,
  happy: 35,
  funny: 35,
  romance: 10749,
  romantic: 10749,
  scary: 27,
  horror: 27,
  dark: 80,
  crime: 80,
  thriller: 53,
  mindbending: 878,
  scifi: 878,
  sci: 878,
  action: 28,
  adventure: 12,
  sad: 18,
  drama: 18,
  inspiring: 99,
  documentary: 99,
  fantasy: 14,
  cozy: 10751,
  family: 10751,
  anime: 16,
  mystery: 9648,
  war: 10752,
  western: 37,
  history: 36,
  music: 10402,
}
const MOOD_DEFAULT_GENRE = 18

/* ── TMDB raw shapes (only the fields we consume; all optional/nullable) ─ */

interface TMDBRaw {
  id?: number
  media_type?: string
  title?: string | null
  name?: string | null
  original_title?: string | null
  original_name?: string | null
  overview?: string | null
  tagline?: string | null
  release_date?: string | null
  first_air_date?: string | null
  runtime?: number | null
  genre_ids?: number[] | null
  genres?: { id?: number; name?: string | null }[] | null
  vote_average?: number | null
  vote_count?: number | null
  popularity?: number | null
  original_language?: string | null
  poster_path?: string | null
  backdrop_path?: string | null
  credits?: {
    cast?: { name?: string | null; character?: string | null; profile_path?: string | null }[] | null
    crew?: { name?: string | null; job?: string | null }[] | null
  } | null
  created_by?: { name?: string | null }[] | null
  seasons?: { season_number?: number | null; episode_count?: number | null; name?: string | null }[] | null
  episode_run_time?: number[] | null
  success?: boolean
}

interface CastRaw {
  name?: string | null
  character?: string | null
  profile_path?: string | null
}

/* ── small helpers ───────────────────────────────────────────────────── */

function normKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function corsHeaders(env: Env): Record<string, string> {
  return {
    'access-control-allow-origin': env.ALLOWED_ORIGIN ?? '*',
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': 'Content-Type, Authorization',
  }
}

function respond(env: Env, body: unknown, status: number, cache: 'HIT' | 'MISS'): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'x-cache': cache,
      'x-kv': env.CACHE ? 'on' : 'off',
      ...corsHeaders(env),
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'x-frame-options': 'DENY',
    },
  })
}

function authHeaders(env: Env): Record<string, string> {
  return env.TMDB_API_TOKEN
    ? { accept: 'application/json', authorization: `Bearer ${env.TMDB_API_TOKEN}` }
    : { accept: 'application/json' }
}

/* Build a TMDB v3 upstream URL. Bearer token path adds nothing to the URL;
   fallback path embeds the provisioned api_key secret (never logged).      */
function buildUpstream(env: Env, path: string, params: Record<string, string>): string {
  const sp = new URLSearchParams(params)
  if (!env.TMDB_API_TOKEN && env.TMDB_DEMO_KEY) sp.set('api_key', env.TMDB_DEMO_KEY)
  const qs = sp.toString()
  return `${TMDB_BASE}${path}${qs ? `?${qs}` : ''}`
}

/* Cache-key hygiene: strip the demo key from URLs used as cache keys. */
function stripApiKey(url: string): string {
  try {
    const u = new URL(url)
    u.searchParams.delete('api_key')
    return u.toString()
  } catch {
    return url
  }
}

/* ── edge-cached upstream fetch (never throws; data:null on any failure) ─ */

async function cachedUpstream(
  env: Env,
  upstreamUrl: string,
  ttl: number,
): Promise<{ data: unknown; cache: 'HIT' | 'MISS' }> {
  let key: Request | null = null
  try {
    key = new Request(CACHE_ORIGIN + stripApiKey(upstreamUrl))
  } catch {
    key = null
  }

  if (key) {
    try {
      const hit = await caches.default.match(key)
      if (hit) return { data: await hit.json(), cache: 'HIT' }
    } catch {
      /* Cache API unavailable in this runtime → direct fetch */
    }
  }

  /* L2: persistent KV layer — global storage, "loaded once" semantics.
     Engaged only for reusable payloads (ttl ≥ TTL_LIST): lists 6 h,
     detail 7 d; search/mood skip KV by design.                          */
  const kv = env.CACHE
  const kvKey = kv && ttl >= TTL_LIST ? `media:${stripApiKey(upstreamUrl)}` : null
  if (kvKey) {
    try {
      const stored = await kv.get<string>(kvKey)
      if (stored) {
        const kvData = JSON.parse(stored) as unknown
        if (kvData !== null && key) {
          try {
            await caches.default.put(
              key,
              new Response(JSON.stringify(kvData), {
                headers: {
                  'content-type': 'application/json; charset=utf-8',
                  'cache-control': `public, max-age=${ttl}`,
                },
              }),
            )
          } catch {
            /* best-effort edge repopulation */
          }
        }
        return { data: kvData, cache: 'HIT' }
      }
    } catch {
      /* KV unavailable/failed → fall through to upstream */
    }
  }

  let data: unknown = null
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT_MS)
    const res = await fetch(upstreamUrl, { headers: authHeaders(env), signal: ctrl.signal })
    clearTimeout(timer)
    if (res.ok) data = await res.json()
  } catch {
    /* network error / timeout / bad JSON → data stays null */
  }

  if (data !== null && key) {
    try {
      await caches.default.put(
        key,
        new Response(JSON.stringify(data), {
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': `public, max-age=${ttl}`,
          },
        }),
      )
    } catch {
      /* best-effort caching */
    }
  }

  /* persist to KV: lists 6 h, detail 7 d */
  if (data !== null && kvKey && kv) {
    try {
      await kv.put(kvKey, JSON.stringify(data), {
        expirationTtl: ttl === TTL_DETAIL ? 604_800 : 21_600,
      })
    } catch {
      /* best-effort */
    }
  }

  return { data, cache: 'MISS' }
}

async function fetchResults(
  env: Env,
  upstreamUrl: string,
  ttl: number,
): Promise<{ items: TMDBRaw[]; cache: 'HIT' | 'MISS' }> {
  const { data, cache } = await cachedUpstream(env, upstreamUrl, ttl)
  const results = (data as { results?: unknown } | null)?.results
  return { items: Array.isArray(results) ? (results as TMDBRaw[]) : [], cache }
}

/* ── UnifiedMedia mapping ────────────────────────────────────────────── */

function mapUnified(raw: TMDBRaw, tmdbType: 'movie' | 'tv', detail: boolean): UnifiedMedia {
  const fromIds = Array.isArray(raw.genre_ids) ? raw.genre_ids : []
  const fromGenres = Array.isArray(raw.genres)
    ? raw.genres.map((g) => g.id ?? 0).filter((n) => n > 0)
    : []
  const genreIds = fromIds.length > 0 ? fromIds : fromGenres

  const releaseDate = raw.release_date || raw.first_air_date || ''
  const mediaType: MediaType =
    tmdbType === 'movie'
      ? 'movie'
      : raw.original_language === 'ja' && genreIds.includes(16)
        ? 'anime'
        : 'tv'

  const castRaw = (raw.credits?.cast ?? null) as CastRaw[] | null
  const cast: CastMember[] =
    detail && Array.isArray(castRaw)
      ? castRaw
          .slice(0, 12)
          .map((c) => ({
            name: c.name ?? '',
            character: c.character ?? '',
            ...(c.profile_path ? { profilePath: c.profile_path } : {}),
          }))
      : []

  const director = detail
    ? tmdbType === 'movie'
      ? raw.credits?.crew?.find((c) => c.job === 'Director')?.name
      : raw.created_by?.[0]?.name
    : undefined

  const seasonsRaw = raw.seasons
  const seasons =
    detail && tmdbType === 'tv' && Array.isArray(seasonsRaw) && seasonsRaw.length > 0
      ? seasonsRaw.map((s) => ({
          season: s.season_number ?? 0,
          episodes: s.episode_count ?? 0,
          ...(s.name ? { title: s.name } : {}),
        }))
      : undefined

  const episodeRuntime =
    detail && tmdbType === 'tv' && Array.isArray(raw.episode_run_time) && raw.episode_run_time[0] > 0
      ? raw.episode_run_time[0]
      : undefined

  const runtime =
    detail && tmdbType === 'movie' && typeof raw.runtime === 'number' && raw.runtime > 0
      ? raw.runtime
      : undefined

  const originalTitle = raw.original_title || raw.original_name || undefined
  const tagline = detail && raw.tagline ? raw.tagline : undefined

  return {
    id: `${tmdbType}-${typeof raw.id === 'number' ? raw.id : 0}`,
    mediaType,
    tmdbId: typeof raw.id === 'number' ? raw.id : 0,
    title: raw.title || raw.name || 'Untitled',
    ...(originalTitle ? { originalTitle } : {}),
    overview: raw.overview ?? '',
    ...(tagline ? { tagline } : {}),
    releaseDate,
    year: parseInt(releaseDate.slice(0, 4), 10) || 0,
    ...(runtime ? { runtime } : {}),
    genres:
      detail && Array.isArray(raw.genres) && raw.genres.length > 0
        ? raw.genres.map((g) => g.name ?? '').filter((n) => n !== '')
        : genreIds.map((g) => GENRE_NAMES[g] ?? '').filter((n) => n !== ''),
    voteAverage: round1(typeof raw.vote_average === 'number' ? raw.vote_average : 0),
    voteCount: typeof raw.vote_count === 'number' ? raw.vote_count : 0,
    popularity: typeof raw.popularity === 'number' ? raw.popularity : 0,
    originalLanguage: raw.original_language ?? '',
    ...(raw.poster_path ? { posterPath: raw.poster_path } : {}),
    ...(raw.backdrop_path ? { backdropPath: raw.backdrop_path } : {}),
    cast,
    ...(director ? { director } : {}),
    ...(seasons ? { seasons } : {}),
    ...(episodeRuntime ? { episodeRuntime } : {}),
  }
}

/* list responses carry slim payloads: cast capped at 6 */
function slim(m: UnifiedMedia): UnifiedMedia {
  return m.cast.length > 6 ? { ...m, cast: m.cast.slice(0, 6) } : m
}

function listResponse(
  env: Env,
  items: TMDBRaw[],
  type: 'movie' | 'tv' | 'mixed',
  cache: 'HIT' | 'MISS',
): Response {
  const results: UnifiedMedia[] = []
  for (const it of items) {
    const t = type === 'mixed' ? (it.media_type === 'movie' || it.media_type === 'tv' ? it.media_type : null) : type
    if (!t) continue
    results.push(slim(mapUnified(it, t, false)))
  }
  return respond(env, { results }, 200, cache)
}

/* ── id parsing: "movie-27205" | "tv-94605" ──────────────────────────── */

function parseMediaId(id: string): { type: 'movie' | 'tv'; num: string } | null {
  const m = /^(movie|tv)-(\d+)$/.exec(id.trim())
  return m ? { type: m[1] as 'movie' | 'tv', num: m[2] } : null
}

/* ── action handlers ─────────────────────────────────────────────────── */

function resolveGenre(genre: string): { id: number; tvFirst: boolean } | null {
  if (!genre) return null
  if (/^\d+$/.test(genre)) return { id: parseInt(genre, 10), tvFirst: false }
  const key = normKey(genre)
  if (MOVIE_GENRES[key] !== undefined) return { id: MOVIE_GENRES[key], tvFirst: false }
  if (TV_GENRES[key] !== undefined) return { id: TV_GENRES[key], tvFirst: true }
  return null
}

async function handleGenre(env: Env, sp: URLSearchParams): Promise<Response> {
  const resolved = resolveGenre((sp.get('genre') ?? '').trim())
  if (!resolved) return respond(env, { results: [] }, 200, 'MISS')

  const discover = (kind: 'movie' | 'tv') =>
    fetchResults(
      env,
      buildUpstream(env, `/discover/${kind}`, {
        with_genres: String(resolved.id),
        sort_by: 'popularity.desc',
      }),
      TTL_LIST,
    )

  /* movie-first by default; TV-only names (Reality, Talk, Kids,
     Sci-Fi & Fantasy) go TV-first. Zero results falls back across. */
  if (resolved.tvFirst) {
    const tv = await discover('tv')
    if (tv.items.length > 0) return listResponse(env, tv.items, 'tv', tv.cache)
    const mv = await discover('movie')
    return listResponse(env, mv.items, 'movie', mv.cache)
  }
  const mv = await discover('movie')
  if (mv.items.length > 0) return listResponse(env, mv.items, 'movie', mv.cache)
  const tv = await discover('tv')
  return listResponse(env, tv.items, 'tv', tv.cache)
}

async function handleSearch(env: Env, sp: URLSearchParams): Promise<Response> {
  const q = (sp.get('q') ?? '').trim()
  if (!q) return respond(env, { results: [] }, 200, 'MISS')

  const { items, cache } = await fetchResults(
    env,
    buildUpstream(env, '/search/multi', { query: q.slice(0, 200), include_adult: 'false' }),
    TTL_SEARCH,
  )

  const results: UnifiedMedia[] = []
  for (const it of items) {
    if (it.media_type !== 'movie' && it.media_type !== 'tv') continue // drop persons
    results.push(slim(mapUnified(it, it.media_type, false)))
  }
  return respond(env, { results }, 200, cache)
}

async function handleDetail(env: Env, sp: URLSearchParams): Promise<Response> {
  const parsed = parseMediaId(sp.get('id') ?? '')
  if (!parsed) return respond(env, { error: 'not found' }, 404, 'MISS')

  const { data, cache } = await cachedUpstream(
    env,
    buildUpstream(env, `/${parsed.type}/${parsed.num}`, { append_to_response: 'credits' }),
    TTL_DETAIL,
  )
  const raw = data as TMDBRaw | null
  if (!raw || typeof raw.id !== 'number' || raw.success === false) {
    return respond(env, { error: 'not found' }, 404, cache)
  }
  return respond(env, { result: mapUnified(raw, parsed.type, true) }, 200, cache)
}

async function handleSimilar(env: Env, sp: URLSearchParams): Promise<Response> {
  const parsed = parseMediaId(sp.get('id') ?? '')
  if (!parsed) return respond(env, { results: [] }, 200, 'MISS')

  const { items, cache } = await fetchResults(
    env,
    buildUpstream(env, `/${parsed.type}/${parsed.num}/similar`, {}),
    TTL_LIST,
  )
  return listResponse(env, items, parsed.type, cache)
}

async function handleMood(env: Env, sp: URLSearchParams): Promise<Response> {
  const ids: number[] = []
  for (const part of (sp.get('moods') ?? '').split(',')) {
    const key = normKey(part)
    if (!key) continue
    const id = MOOD_GENRES[key]
    if (id !== undefined && !ids.includes(id)) ids.push(id)
  }
  if (ids.length === 0) ids.push(MOOD_DEFAULT_GENRE) // default → drama

  const { items, cache } = await fetchResults(
    env,
    buildUpstream(env, '/discover/movie', {
      with_genres: ids.join(','),
      sort_by: 'popularity.desc',
      'vote_count.gte': '100',
    }),
    TTL_MOOD,
  )
  return listResponse(env, items, 'movie', cache)
}

async function handleList(env: Env, list: string, sp: URLSearchParams): Promise<Response> {
  switch (list) {
    case 'trending': {
      const { items, cache } = await fetchResults(env, buildUpstream(env, '/trending/all/week', {}), TTL_LIST)
      return listResponse(env, items, 'mixed', cache)
    }
    case 'popular-movies': {
      const { items, cache } = await fetchResults(env, buildUpstream(env, '/movie/popular', {}), TTL_LIST)
      return listResponse(env, items, 'movie', cache)
    }
    case 'popular-tv': {
      const { items, cache } = await fetchResults(env, buildUpstream(env, '/tv/popular', {}), TTL_LIST)
      return listResponse(env, items, 'tv', cache)
    }
    case 'anime': {
      const { items, cache } = await fetchResults(
        env,
        buildUpstream(env, '/discover/tv', {
          with_genres: '16',
          with_original_language: 'ja',
          sort_by: 'popularity.desc',
        }),
        TTL_LIST,
      )
      return listResponse(env, items, 'tv', cache) // mapping flags ja+16 items as 'anime'
    }
    case 'top-rated': {
      const { items, cache } = await fetchResults(env, buildUpstream(env, '/movie/top_rated', {}), TTL_LIST)
      return listResponse(env, items, 'movie', cache)
    }
    case 'new-releases': {
      const { items, cache } = await fetchResults(env, buildUpstream(env, '/movie/now_playing', {}), TTL_LIST)
      return listResponse(env, items, 'movie', cache)
    }
    case 'genre':
      return handleGenre(env, sp)
    default:
      return respond(env, { results: [] }, 200, 'MISS')
  }
}

/* ── entrypoint: GET /api/media ──────────────────────────────────────── */

export async function handleMedia(url: URL, env: Env): Promise<Response> {
  const sp = url.searchParams
  const list = sp.get('list')
  const action = sp.get('action')
  try {
    if (list) return await handleList(env, list, sp)
    if (action === 'search') return await handleSearch(env, sp)
    if (action === 'detail') return await handleDetail(env, sp)
    if (action === 'similar') return await handleSimilar(env, sp)
    if (action === 'mood') return await handleMood(env, sp)
    return respond(env, { error: 'bad request' }, 400, 'MISS')
  } catch {
    /* absolute resilience: never hard-500 the client */
    return respond(env, { results: [] }, 200, 'MISS')
  }
}

/* ── nlsearch/mood candidate fetch (server-side) ─────────────────────────
   Used when the client sends no candidate pool (e.g. AI Mode search): the
   worker itself pulls live TMDB candidates so the LLM ranks a REAL catalog
   instead of an empty array. Recipe: /search/multi on the raw query, then
   genre keywords detected inside the query → /discover/movie by popularity
   (vote_count ≥ 100). Returns ≤ 40 slim candidates.                       */

export interface NLCandidate {
  i: string // "movie-27205"
  t: string // title
  y: number // year
  g: string[] // genre names
}

export async function nlCandidates(env: Env, query: string): Promise<NLCandidate[]> {
  const out: NLCandidate[] = []
  const seen = new Set<number>()

  const push = (raw: TMDBRaw, type: 'movie' | 'tv') => {
    const id = typeof raw.id === 'number' ? raw.id : 0
    if (!id || seen.has(id)) return
    const title = raw.title || raw.name || ''
    if (!title) return
    seen.add(id)
    out.push({
      i: `${type}-${id}`,
      t: title,
      y: parseInt((raw.release_date || raw.first_air_date || '').slice(0, 4), 10) || 0,
      g: (Array.isArray(raw.genre_ids) ? raw.genre_ids : [])
        .map((g) => GENRE_NAMES[g] ?? '')
        .filter((n) => n !== ''),
    })
  }

  const q = (query ?? '').trim()
  if (q) {
    const { items } = await fetchResults(
      env,
      buildUpstream(env, '/search/multi', { query: q, include_adult: 'false', language: 'en-US', page: '1' }),
      TTL_SEARCH,
    )
    for (const it of items) {
      const t = it.media_type === 'movie' || it.media_type === 'tv' ? it.media_type : null
      if (t) push(it, t)
    }
  }

  const norm = normKey(q)
  if (norm.length > 2) {
    const genreIds: number[] = []
    const addGenre = (id: number) => {
      if (!genreIds.includes(id) && genreIds.length < 2) genreIds.push(id)
    }

    /* 1) exact/stem genre-name match (thriller → thrillers, animation → animated) */
    for (const [name, id] of Object.entries(MOVIE_GENRES)) {
      const stem = name.length > 6 ? name.slice(0, 6) : name
      if (norm.includes(name) || (stem.length >= 6 && norm.includes(stem))) addGenre(id)
      if (genreIds.length >= 2) break
    }
    if (genreIds.length === 0) {
      for (const [name, id] of Object.entries(TV_GENRES)) {
        const stem = name.length > 6 ? name.slice(0, 6) : name
        if (norm.includes(name) || (stem.length >= 6 && norm.includes(stem))) addGenre(id)
        if (genreIds.length >= 2) break
      }
    }

    /* 2) streaming-concept keywords that do not carry genre names */
    const CONCEPTS: [RegExp, number[]][] = [
      [/heist|robbery|caper|conart/, [80, 53]],
      [/anime/, [16]],
      [/animated|animation|cartoon|pixar|disney|ghibli/, [16]],
      [/horror|scary|creepy|spooky|haunt/, [27]],
      [/romantic|romance|lovestory|fallinlove/, [10749]],
      [/funny|comedy|laugh|hilarious/, [35]],
      [/space|alien|interstel|galaxy/, [878]],
      [/zombie|apocalyp|endoftheworld/, [27, 878]],
      [/superhero|comicbook/, [28, 14]],
      [/spy|espionage/, [53, 80]],
      [/feelgood|heartwarm|wholesome|uplifting/, [10751, 35]],
      [/mindbend|psycholog|twist/, [53, 9648]],
    ]
    for (const [re, ids] of CONCEPTS) {
      if (re.test(norm)) for (const id of ids) addGenre(id)
      if (genreIds.length >= 2) break
    }

    for (const gid of genreIds) {
      const { items } = await fetchResults(
        env,
        buildUpstream(env, '/discover/movie', {
          with_genres: String(gid),
          sort_by: 'popularity.desc',
          'vote_count.gte': '100',
          include_adult: 'false',
          language: 'en-US',
          page: '1',
        }),
        TTL_SEARCH,
      )
      for (const it of items) push(it, 'movie')
    }

    /* anime queries → also pull Japanese animation (movie + tv) */
    if (/anime|ghibli/.test(norm)) {
      const { items } = await fetchResults(
        env,
        buildUpstream(env, '/discover/movie', {
          with_genres: '16',
          with_original_language: 'ja',
          sort_by: 'popularity.desc',
          'vote_count.gte': '50',
          include_adult: 'false',
          language: 'en-US',
          page: '1',
        }),
        TTL_SEARCH,
      )
      for (const it of items) push(it, 'movie')
    }
  }

  /* guarantee a deep pool even for vague/empty matches */
  if (out.length < 12) {
    const { items } = await fetchResults(
      env,
      buildUpstream(env, '/trending/all/week', { language: 'en-US' }),
      TTL_LIST,
    )
    for (const it of items) {
      const t = it.media_type === 'movie' || it.media_type === 'tv' ? it.media_type : null
      if (t) push(it, t)
    }
  }

  return out.slice(0, 60)
}
