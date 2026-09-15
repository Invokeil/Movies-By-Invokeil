/* ── Movies by InvokeIL — Unified Media Types ─────────────────────────
   Mirrors the planned UnifiedMedia model (TMDB primary + OMDb extras)  */

export type MediaType = 'movie' | 'tv' | 'anime'

export interface CastMember {
  name: string
  character: string
  profilePath?: string // TMDB image path e.g. "/llO5..jpg" — empty/undefined = no photo
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
  malId?: number // anime MAL identity layer
  title: string
  originalTitle?: string
  overview: string
  tagline?: string
  releaseDate: string
  year: number
  runtime?: number // minutes (movies)
  genres: string[]
  voteAverage: number
  voteCount: number
  popularity: number
  originalLanguage: string
  posterPath?: string // TMDB image path e.g. "/9n2e..jpg" — served via /api/img (CF R2+edge cache)
  backdropPath?: string // TMDB image path — wide backdrop art
  cast: CastMember[]
  director?: string // movie director / show creator
  seasons?: SeasonInfo[]
  episodeRuntime?: number
  /* OMDb enrichment (optional secondary metadata) */
  imdbRating?: number
  metascore?: number
  rated?: string
  awards?: string
  boxOffice?: string
}

/* Metadata lifecycle wrapper — every cached object carries this */
export interface CacheEnvelope<T> {
  data: T
  cachedAt: number
  expiresAt: number
  source: string // "api" | "idb" | "ai" | "local"
  version: number
}

export interface WatchProgress {
  mediaId: string
  tmdbId: number
  mediaType: MediaType
  title: string
  season?: number
  episode?: number
  position: number // seconds
  duration: number // seconds
  updatedAt: number
}

export interface HistoryEntry {
  mediaId: string
  tmdbId: number
  mediaType: MediaType
  title: string
  posterSeed?: string
  posterPath?: string
  season?: number
  episode?: number
  watchedAt: number
  completed: boolean
}

export interface RecentSearch {
  q: string
  at: number
}

export interface TasteProfile {
  genreWeights: Record<string, number>
  decadeCounts: Record<string, number>
  languageWeights: Record<string, number>
  peopleWeights: Record<string, number>
  avgRating: number
  totalWatched: number
  totalLiked: number
}

/* SPA navigation views (client-side router — single route deployment) */
export type View =
  | { name: 'home' }
  | { name: 'search'; q?: string }
  | { name: 'browse'; kind: MediaType; genre?: string }
  | { name: 'detail'; id: string }
  | { name: 'watch'; id: string; season?: number; episode?: number }
  | { name: 'library'; tab?: 'watchlist' | 'favorites' | 'history' | 'continue' }
  | { name: 'privacy' }
  | { name: 'settings' }

/* AI router response */
export interface AIResult {
  id: string
  reason?: string
}

export interface AIResponse {
  ok: boolean
  provider?: string
  results?: AIResult[]
  answer?: string
  fallback?: boolean
  error?: string
}
