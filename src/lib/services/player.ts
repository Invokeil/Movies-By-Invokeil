import type { UnifiedMedia } from '../types'

/* ── PlayerService — Adapter pattern with provider failover ───────────
   Frontend never constructs stream URLs directly. All providers live in
   one ordered array; the service routes every URL through the active
   index and can cycle to the next provider on failure (setIndex/next).  */

export interface PlayerProvider {
  name: string
  getMovieUrl(m: UnifiedMedia): string
  getEpisodeUrl(m: UnifiedMedia, season: number, episode: number): string
  getAnimeUrl(m: UnifiedMedia, episode: number, dub?: boolean): string
}

const VIDLINK_BASE = 'https://vidlink.pro'
const VIDSRC_BASE = 'https://vidsrc.xyz'
const TWOEMBED_BASE = 'https://www.2embed.cc'

export const vidlinkProvider: PlayerProvider = {
  name: 'VidLink',
  getMovieUrl: (m) => `${VIDLINK_BASE}/movie/${m.tmdbId}`,
  getEpisodeUrl: (m, season, episode) => `${VIDLINK_BASE}/tv/${m.tmdbId}/${season}/${episode}`,
  getAnimeUrl: (m, episode, dub = false) =>
    `${VIDLINK_BASE}/anime/${m.malId ?? 0}/${episode}/${dub ? 'dub' : 'sub'}`,
}

/* Vidsrc has no MAL identity layer — anime falls back to the TV form. */
export const vidsrcProvider: PlayerProvider = {
  name: 'Vidsrc',
  getMovieUrl: (m) => `${VIDSRC_BASE}/embed/movie?tmdb=${m.tmdbId}`,
  getEpisodeUrl: (m, season, episode) =>
    `${VIDSRC_BASE}/embed/tv?tmdb=${m.tmdbId}&season=${season}&episode=${episode}`,
  getAnimeUrl: (m, episode) => `${VIDSRC_BASE}/embed/tv?tmdb=${m.tmdbId}&season=1&episode=${episode}`,
}

export const twoEmbedProvider: PlayerProvider = {
  name: 'TwoEmbed',
  getMovieUrl: (m) => `${TWOEMBED_BASE}/embed/${m.tmdbId}`,
  getEpisodeUrl: (m, season, episode) => `${TWOEMBED_BASE}/embedtv/${m.tmdbId}&s=${season}&e=${episode}`,
  getAnimeUrl: (m, episode) => `${TWOEMBED_BASE}/embedtv/${m.tmdbId}&s=1&e=${episode}`,
}

/* Ordered failover chain — index 0 is the default provider. */
export const providers: PlayerProvider[] = [vidlinkProvider, vidsrcProvider, twoEmbedProvider]

class PlayerService {
  private activeIndex = 0

  get index() {
    return this.activeIndex
  }

  setIndex(i: number) {
    this.activeIndex = ((i % providers.length) + providers.length) % providers.length
  }

  /* Advance to the next provider cyclically; returns its name. */
  next(): string {
    this.activeIndex = (this.activeIndex + 1) % providers.length
    return providers[this.activeIndex].name
  }

  get name() {
    return providers[this.activeIndex].name
  }

  getMovieUrl(m: UnifiedMedia): string {
    return providers[this.activeIndex].getMovieUrl(m)
  }

  getEpisodeUrl(m: UnifiedMedia, season = 1, episode = 1): string {
    return providers[this.activeIndex].getEpisodeUrl(m, season, episode)
  }

  getAnimeUrl(m: UnifiedMedia, episode = 1, dub = false): string {
    return providers[this.activeIndex].getAnimeUrl(m, episode, dub)
  }

  getEmbedUrl(m: UnifiedMedia, season?: number, episode?: number): string {
    if (m.mediaType === 'movie') return this.getMovieUrl(m)
    if (m.mediaType === 'anime' && m.malId) return this.getAnimeUrl(m, episode ?? 1)
    return this.getEpisodeUrl(m, season ?? 1, episode ?? 1)
  }

  hasAnimeMapping(m: UnifiedMedia): boolean {
    return typeof m.malId === 'number' && m.malId > 0
  }
}

export const player = new PlayerService()

/* ── Player postMessage progress events ───────────────────────────────
   Listens for player events: play / pause / progress / ended.
   Events are accepted from ANY provider in the chain (source '' /
   'vidlink' / 'vidsrc' / anything containing 'embed'); only known
   dev-tooling noise sources are ignored.                                */

export interface PlayerEvent {
  event: string
  progress?: number // 0–1
  currentTime?: number
  duration?: number
}

const NOISE_SOURCES = new Set([
  'react-devex',
  'react-devtools',
  'webpack-dev-server',
  'webpack-devtools',
  'devtools',
])

export function attachPlayerListener(
  iframe: HTMLIFrameElement | null,
  onEvent: (e: PlayerEvent) => void
): () => void {
  const handler = (ev: MessageEvent) => {
    try {
      const data = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data
      if (!data || typeof data !== 'object') return
      const src = String(data.source ?? data.provider ?? '').toLowerCase()
      if (NOISE_SOURCES.has(src)) return
      if (src && src !== 'vidlink' && src !== 'vidsrc' && !src.includes('embed')) return
      const inner = data.data ?? data
      if (inner?.event || inner?.type) {
        onEvent({
          event: inner.event ?? inner.type,
          progress: inner.progress,
          currentTime: inner.currentTime ?? inner.current_time,
          duration: inner.duration,
        })
      }
    } catch { /* not a player message */ }
  }
  window.addEventListener('message', handler)
  return () => window.removeEventListener('message', handler)
}
