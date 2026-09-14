import type { UnifiedMedia } from '../types'

/* ── PlayerService — ordered AUTO-failover across providers & mirrors ────
   Frontend never constructs stream URLs directly. Providers are tried in
   priority order; each provider owns several VERIFIED-ALIVE mirror domains
   (checked 2026-09-14) so a dead mirror rotates within the provider before
   the next provider takes over. The watch view advances attempts
   automatically (fast switch: ~4.5 s for unreachable domains, ~8 s for
   frames that never load, +7–15 s for frames that load but never signal)
   and the viewer can always pick a provider chip manually.

   Priority chain (index 0 = default, untouched for existing users):
     1. VidLink      vidlink.pro                      + events API
     2. Vidsrc       vidsrcme.ru / .su, vidsrc-me.ru,
                     vidsrc2.ru                       + events API
     3. 2Embed       2embed.cc, 2embed.skin
     4. RiveStream   rivestream.ru, rivestream.app
     5. SuperEmbed   multiembed.mov  (last resort — CF-fronted)
   Excluded (verified dead/drifted 2026-09-14): vidsrc.xyz (down),
   vidsrc-me.su (embed 404), vidsrc-embed.ru/.su + vsrc.su (drifted to
   vsembed.ru), rivestream.vip (no DNS).                               */

export interface PlayerAttempt {
  provider: string // display name
  domain: string // origin loaded into the iframe
  events: boolean // documented postMessage playback-event support
  url(m: UnifiedMedia, season?: number, episode?: number): string
}

interface ProviderDef {
  name: string
  domains: string[]
  events: boolean
  movie(d: string, m: UnifiedMedia): string
  tv(d: string, m: UnifiedMedia, s: number, e: number): string
  /** MAL-native players only; others fall back to the TV form. */
  anime?(d: string, m: UnifiedMedia, e: number, dub: boolean): string
}

const VIDLINK: ProviderDef = {
  name: 'VidLink',
  domains: ['https://vidlink.pro'],
  events: true,
  movie: (d, m) => `${d}/movie/${m.tmdbId}`,
  tv: (d, m, s, e) => `${d}/tv/${m.tmdbId}/${s}/${e}`,
  anime: (d, m, e, dub) =>
    m.malId ? `${d}/anime/${m.malId}/${e}/${dub ? 'dub' : 'sub'}` : `${d}/tv/${m.tmdbId}/1/${e}`,
}

const VIDSRC: ProviderDef = {
  name: 'Vidsrc',
  domains: ['https://vidsrcme.ru', 'https://vidsrcme.su', 'https://vidsrc-me.ru', 'https://vidsrc2.ru'],
  events: true,
  movie: (d, m) => `${d}/embed/movie/${m.tmdbId}`,
  tv: (d, m, s, e) => `${d}/embed/tv/${m.tmdbId}/${s}/${e}`,
  anime: (d, m, e) => `${d}/embed/tv/${m.tmdbId}/1/${e}`,
}

const TWOEMBED: ProviderDef = {
  name: '2Embed',
  domains: ['https://www.2embed.cc', 'https://www.2embed.skin'],
  events: false,
  movie: (d, m) => `${d}/embed/${m.tmdbId}`,
  tv: (d, m, s, e) => `${d}/embedtv/${m.tmdbId}&s=${s}&e=${e}`,
  anime: (d, m, e) => `${d}/embedtv/${m.tmdbId}&s=1&e=${e}`,
}

const RIVESTREAM: ProviderDef = {
  name: 'RiveStream',
  domains: ['https://rivestream.ru', 'https://www.rivestream.app', 'https://watch.rivestream.app'],
  events: false,
  movie: (d, m) => `${d}/embed?type=movie&id=${m.tmdbId}`,
  tv: (d, m, s, e) => `${d}/embed?type=tv&id=${m.tmdbId}&season=${s}&episode=${e}`,
  anime: (d, m, e) => `${d}/embed?type=tv&id=${m.tmdbId}&season=1&episode=${e}`,
}

const SUPEREMBED: ProviderDef = {
  name: 'SuperEmbed',
  domains: ['https://multiembed.mov'],
  events: false,
  movie: (d, m) => `${d}/?video_id=${m.tmdbId}&tmdb=1`,
  tv: (d, m, s, e) => `${d}/?video_id=${m.tmdbId}&tmdb=1&s=${s}&e=${e}`,
  anime: (d, m, e) => `${d}/?video_id=${m.tmdbId}&tmdb=1&s=1&e=${e}`,
}

export const PROVIDERS: ProviderDef[] = [VIDLINK, VIDSRC, TWOEMBED, RIVESTREAM, SUPEREMBED]

/* provider name → chip list (legacy export shape: objects with .name) */
export const providers = PROVIDERS.map((p) => ({ name: p.name }))

/* flat attempt list: provider × mirror domain, in failover order */
export const ATTEMPTS: PlayerAttempt[] = PROVIDERS.flatMap((p) =>
  p.domains.map((domain) => ({
    provider: p.name,
    domain,
    events: p.events,
    url: (m: UnifiedMedia, season?: number, episode?: number) => {
      const s = season ?? 1
      const e = episode ?? 1
      if (m.mediaType === 'movie') return p.movie(domain, m)
      if (m.mediaType === 'anime' && p.anime && m.malId) return p.anime(domain, m, e, false)
      return p.tv(domain, m, s, e)
    },
  })),
)

/* first attempt index of each provider (for chip jumps) */
const START_OF: number[] = []
PROVIDERS.forEach((p, i) => {
  START_OF[i] = ATTEMPTS.findIndex((a) => a.provider === p.name)
})

class PlayerService {
  private preferredIdx = 0 // sticky "what worked last time" provider
  private attemptIdx = 0 // concrete provider × domain attempt

  get attempt() {
    return this.attemptIdx
  }

  get attemptsCount() {
    return ATTEMPTS.length
  }

  get current(): PlayerAttempt {
    return ATTEMPTS[this.attemptIdx]
  }

  get domain() {
    return ATTEMPTS[this.attemptIdx].domain
  }

  /* legacy compat: previously "index" meant the active provider */
  get index() {
    const i = PROVIDERS.findIndex((p) => p.name === this.current.provider)
    return i < 0 ? 0 : i
  }

  get name() {
    return this.current.provider
  }

  /* chip click → jump to a provider's first mirror */
  setPreferred(i: number) {
    this.preferredIdx = ((i % PROVIDERS.length) + PROVIDERS.length) % PROVIDERS.length
    this.attemptIdx = START_OF[this.preferredIdx]
  }

  /* legacy compat */
  setIndex(i: number) {
    this.setPreferred(i)
  }

  /* manual cycle button — wraps across every attempt */
  next(): string {
    this.attemptIdx = (this.attemptIdx + 1) % ATTEMPTS.length
    const i = PROVIDERS.findIndex((p) => p.name === this.current.provider)
    if (i >= 0) this.preferredIdx = i
    return this.name
  }

  /* auto-failover advance — no wrap; null ⇒ every attempt tried */
  autoNext(): string | null {
    if (this.attemptIdx + 1 >= ATTEMPTS.length) return null
    this.attemptIdx += 1
    return this.name
  }

  /* sticky preference — remember the provider that actually played */
  markAlive() {
    const i = PROVIDERS.findIndex((p) => p.name === this.current.provider)
    if (i >= 0) this.preferredIdx = i
  }

  /* new title → begin at the preferred provider's first mirror */
  startFromPreferred() {
    this.attemptIdx = START_OF[this.preferredIdx]
  }

  attemptUrl(m: UnifiedMedia, season?: number, episode?: number): string {
    return this.current.url(m, season, episode)
  }

  /* ── legacy per-kind helpers (kept for API compatibility) ─────────── */
  getMovieUrl(m: UnifiedMedia): string {
    return this.attemptUrl(m)
  }

  getEpisodeUrl(m: UnifiedMedia, season = 1, episode = 1): string {
    return this.attemptUrl(m, season, episode)
  }

  getAnimeUrl(m: UnifiedMedia, episode = 1, dub = false): string {
    const p = PROVIDERS.find((x) => x.name === this.current.provider) ?? PROVIDERS[0]
    return p.anime ? p.anime(this.domain, m, episode, dub) : p.tv(this.domain, m, 1, episode)
  }

  getEmbedUrl(m: UnifiedMedia, season?: number, episode?: number): string {
    return this.attemptUrl(m, season, episode)
  }

  hasAnimeMapping(m: UnifiedMedia): boolean {
    return typeof m.malId === 'number' && m.malId > 0
  }
}

export const player = new PlayerService()

/* ── Player postMessage progress events ───────────────────────────────
   Normalizes every supported provider's event dialect into PlayerEvent:
   • VidLink  { source:'vidlink', data:{ event, progress, currentTime … } }
   • Vidsrc   { type:'PLAYER_EVENT', data:{ player_status,
                player_progress, player_duration … } }
   Events are accepted from any chain provider; only dev-tool noise is
   ignored. Providers without an events API simply never fire.           */

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

      /* Vidsrc PLAYER_EVENT envelope → normalized PlayerEvent */
      if (data.type === 'PLAYER_EVENT' && data.data && typeof data.data === 'object') {
        const d = data.data as Record<string, unknown>
        const status = String(d.player_status ?? '').toLowerCase()
        const cur = typeof d.player_progress === 'number' ? d.player_progress : undefined
        const dur = typeof d.player_duration === 'number' ? d.player_duration : undefined
        onEvent({
          event: status === 'completed' ? 'ended' : status === 'playing' ? 'progress' : status,
          progress: cur && dur ? cur / dur : undefined,
          currentTime: cur,
          duration: dur,
        })
        return
      }

      /* VidLink / generic { event, progress, currentTime } envelope */
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
