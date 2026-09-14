'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Minimize2, X, Radio, RefreshCw, ShieldAlert, Zap } from 'lucide-react'
import type { UnifiedMedia } from '@/lib/types'
import { useApp } from '@/lib/store'
import { mediaService } from '@/lib/services/media'
import { player, providers, attachPlayerListener, type PlayerEvent } from '@/lib/services/player'
import { progressStore } from '@/lib/db/stores'
import { GlassPanel, GlassButton, Chip } from '../ui-custom/glass'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

export function WatchView({ id, season, episode }: { id: string; season?: number; episode?: number }) {
  const { navigate, back, updatePlayer, minimizePlayer, closePlayer, prefs, bumpLibrary } = useApp()
  const [media, setMedia] = useState<UnifiedMedia | null>(null)
  const [loading, setLoading] = useState(true)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playerLive, setPlayerLive] = useState(false) // got a real player event
  const [iframeReady, setIframeReady] = useState(false)
  const [showFallback, setShowFallback] = useState(false)
  const [longWait, setLongWait] = useState(false) // still no signal after the extended grace period
  const [attemptIdx, setAttemptIdx] = useState(player.attempt)
  const [exhausted, setExhausted] = useState(false) // every provider/mirror attempt was tried
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const posRef = useRef(0)
  const savedRef = useRef(0)

  /* load media + saved progress */
  useEffect(() => {
    let alive = true
    const t = setTimeout(() => {
      setLoading(true)
      // new title / episode → fresh iframe instance: reset transient states
      player.startFromPreferred()
      setAttemptIdx(player.attempt)
      setPlayerLive(false)
      setIframeReady(false)
      setExhausted(false)
      setShowFallback(false)
      setLongWait(false)
      ;(async () => {
        const m = await mediaService.detail(id)
        if (!alive) return
        setMedia(m)
        setLoading(false)
        if (!m) return
        mediaService.logWatch(m, season, episode)
        const saved = await progressStore.get(m.id, season, episode)
        const dur = m.mediaType === 'movie' ? (m.runtime ?? 110) * 60 : (m.episodeRuntime ?? 45) * 60
        setDuration(dur)
        updatePlayer({ duration: dur, position: saved?.position ?? 0, playing: true })
        posRef.current = saved?.position ?? 0
        setPosition(saved?.position ?? 0)
        if (saved && saved.position > 30) toast.info(`Resumed at ${fmt(saved.position)}`)
      })()
    }, 0)
    return () => { alive = false; clearTimeout(t) }
  }, [id, season, episode, updatePlayer])

  const handleEnd = useCallback(() => {
    if (!media) return
    ;(async () => {
      await mediaService.saveProgress(media, 0.99 * duration, duration, season, episode)
      if (prefs.autoplayNext && media.mediaType !== 'movie') {
        const s = media.seasons?.find((x) => x.season === season)
        if (s && (episode ?? 1) < s.episodes) {
          toast.info('Autoplaying next episode…')
          updatePlayer({ episode: (episode ?? 1) + 1, position: 0 })
          navigate({ name: 'watch', id: media.id, season, episode: (episode ?? 1) + 1 }, true)
          return
        }
      }
      toast.success('Episode complete')
    })()
  }, [media, duration, season, episode, prefs.autoplayNext, navigate, updatePlayer])

  /* real player events (postMessage — accepted from any provider in the chain) */
  useEffect(() => {
    if (!media) return
    const off = attachPlayerListener(iframeRef.current, (e: PlayerEvent) => {
      setPlayerLive(true)
      setShowFallback(false)
      setLongWait(false)
      setExhausted(false)
      player.markAlive() // sticky: this provider actually played
      if (e.duration && e.duration > 0) setDuration(e.duration)
      if (typeof e.currentTime === 'number' && e.currentTime > 0) {
        posRef.current = e.currentTime
        setPosition(e.currentTime)
      }
      if (e.event === 'ended') handleEnd()
    })
    return off
  }, [media, handleEnd])

  /* simulated playback fallback (external iframe may be blocked in sandbox preview) */
  useEffect(() => {
    if (!media || !prefs.animations) return
    const sim = setInterval(() => {
      if (duration === 0) return
      posRef.current = Math.min(posRef.current + 1, duration - 1)
      setPosition(posRef.current)
    }, 1000)
    return () => clearInterval(sim)
  }, [media, duration, prefs.animations])

  /* persist progress every 10 s */
  useEffect(() => {
    if (!media) return
    const saver = setInterval(() => {
      if (posRef.current - savedRef.current >= 10 && duration > 0) {
        savedRef.current = posRef.current
        mediaService.saveProgress(media, posRef.current, duration, season, episode)
        bumpLibrary()
      }
    }, 5000)
    return () => {
      clearInterval(saver)
      if (media && duration > 0 && posRef.current > 5) {
        mediaService.saveProgress(media, posRef.current, duration, season, episode)
      }
    }
  }, [media, duration, season, episode, bumpLibrary])

  /* Auto-failover: advance one attempt when the current provider/mirror
     is provably not working. Switching is FAST:
       • ~4.5 s — mirror domain unreachable (no-cors reachability probe)
       • ~8 s   — iframe never fires load
       • +7–15 s— frame loads but the provider never signals playback
                  (only for providers WITH an event API; providers without
                  one get the benefit of the doubt once loaded)
     Exhausting every attempt stops the engine and shows the help panel. */
  const failover = useCallback((reason: string) => {
    const nextName = player.autoNext()
    if (!nextName) {
      setExhausted(true)
      setShowFallback(true)
      setLongWait(true)
      return
    }
    toast.info(`Player: ${reason} — switching to ${nextName}`, { id: 'failover', duration: 3000 })
    setPlayerLive(false)
    setIframeReady(false)
    setShowFallback(false)
    setLongWait(false)
    setAttemptIdx(player.attempt)
  }, [])

  const embedUrl = media ? player.attemptUrl(media, season, episode) : ''

  useEffect(() => {
    if (!media || playerLive || exhausted) return
    const attempt = player.current

    /* phase 1 — frame not loaded yet: probe + load deadline */
    if (!iframeReady) {
      let cancelled = false
      const ctrl = new AbortController()
      const killer = setTimeout(() => ctrl.abort(), 4500)
      fetch(new URL(embedUrl).origin, { mode: 'no-cors', cache: 'no-store', signal: ctrl.signal })
        .then(() => clearTimeout(killer))
        .catch(() => {
          if (!cancelled) failover('mirror unreachable')
        })
      const loadT = setTimeout(() => failover('no response'), 8000)
      return () => {
        cancelled = true
        clearTimeout(killer)
        clearTimeout(loadT)
        ctrl.abort()
      }
    }

    /* phase 2 — frame loaded: event-capable providers must prove playback;
       no-event providers get the benefit of the doubt (nothing more to
       detect — switching away from a working player would be worse).     */
    if (attempt.events) {
      const t = setTimeout(() => failover('no playback signal'), attemptIdx === 0 ? 15000 : 7000)
      return () => clearTimeout(t)
    }
  }, [media, playerLive, iframeReady, exhausted, attemptIdx, embedUrl, failover])

  /* Non-blocking status panel BELOW the frame (never covering it) — shows
     while a provider is struggling or after manual/exhausted failover.   */
  useEffect(() => {
    if (playerLive) return
    const base = iframeReady ? 12000 : 15000
    const t1 = setTimeout(() => setShowFallback(true), base)
    const t2 = setTimeout(() => {
      setShowFallback(true)
      setLongWait(true)
    }, base + 9000)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [playerLive, iframeReady, id, season, episode, attemptIdx])

  /* Failover: switch provider (chip = direct pick, button = cycle mirror)
     and remount the iframe. Watch progress (posRef) is kept — playback
     position continues under the new provider.                          */
  const switchProvider = (target?: number) => {
    if (typeof target === 'number') player.setPreferred(target)
    else player.next()
    setAttemptIdx(player.attempt)
    setPlayerLive(false)
    setIframeReady(false)
    setExhausted(false)
    setShowFallback(false)
    setLongWait(false)
  }

  if (loading || !media) {
    return (
      <div className="flex flex-col gap-4 pb-6">
        <div className="skeleton-shimmer aspect-video w-full rounded-3xl" />
        <div className="skeleton-shimmer h-5 w-1/3 rounded-full" />
      </div>
    )
  }

  const attempt = player.current
  const pct = Math.round((position / Math.max(duration, 1)) * 100)
  const seasonInfo = media.seasons?.find((s) => s.season === season)

  const goEpisode = (delta: 1 | -1) => {
    if (!seasonInfo || !season) return
    const next = (episode ?? 1) + delta
    if (next < 1) {
      toast('Already at first episode')
      return
    }
    if (next > seasonInfo.episodes) {
      toast('Already at last episode')
      return
    }
    posRef.current = 0
    savedRef.current = 0
    updatePlayer({ episode: next, position: 0 })
    navigate({ name: 'watch', id: media.id, season, episode: next }, true)
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      {/* Player frame */}
      <div className="glass relative overflow-hidden rounded-3xl p-2">
        <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-[#2b2226]">
          <iframe
            ref={iframeRef}
            key={`${id}-${season ?? 0}-${episode ?? 0}-${attemptIdx}`}
            src={embedUrl}
            className="player-frame"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture; autoplay*; encrypted-media*"
            allowFullScreen
            referrerPolicy="origin"
            title={`${media.title} player`}
            onLoad={() => setIframeReady(true)}
            /* NO sandbox attribute — VidLink detects sandboxed frames and
               refuses to stream. Top-level production (movies.invokeil.cfd)
               runs unconstrained; embed gets full autoplay/media perms.      */
          />
        </div>

        {/* Control bar */}
        <div className="flex flex-wrap items-center gap-2.5 px-2 py-3">
          <GlassButton variant="ghost" onClick={back} className="!px-3">
            <ChevronLeft size={18} /> Back
          </GlassButton>

          {media.mediaType !== 'movie' && (
            <>
              <GlassButton variant="ghost" onClick={() => goEpisode(-1)} className="!px-3" ariaLabel="Previous episode">
                <ChevronLeft size={16} />
              </GlassButton>
              <Chip active>
                {media.mediaType === 'anime' && media.malId ? `EP ${episode}` : `S${season} E${episode}`}
              </Chip>
              <GlassButton variant="ghost" onClick={() => goEpisode(1)} className="!px-3" ariaLabel="Next episode">
                <ChevronRight size={16} />
              </GlassButton>
            </>
          )}

          <div className="mx-2 hidden min-w-40 flex-1 items-center gap-3 sm:flex">
            <div className="progress-track h-2 flex-1">
              <div className="progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs font-bold text-ink/70">{pct}%</span>
          </div>

          <span
            className={cn(
              'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold',
              playerLive ? 'bg-emerald-100 text-emerald-800' : 'bg-white/50 text-mauve'
            )}
          >
            <Radio size={11} className={cn(playerLive && 'animate-pulse')} />
            {playerLive
              ? 'Player events live'
              : iframeReady
                ? attempt.events
                  ? 'Waiting for playback'
                  : 'Loaded'
                : 'Connecting…'}{' '}
            · {attempt.provider}
            <span className="hidden font-semibold opacity-60 sm:inline">{new URL(attempt.domain).host}</span>
          </span>

          <GlassButton
            variant="ghost"
            onClick={() => switchProvider()}
            className="!px-3"
            ariaLabel="Switch player provider"
          >
            <RefreshCw size={16} />
          </GlassButton>

          <GlassButton variant="ghost" onClick={minimizePlayer} className="!px-3" ariaLabel="Minimize to mini player">
            <Minimize2 size={16} />
          </GlassButton>
          <GlassButton
            variant="ghost"
            className="!px-3"
            ariaLabel="Close player"
            onClick={() => {
              mediaService.saveProgress(media, posRef.current, duration, season, episode)
              closePlayer()
              navigate({ name: 'detail', id: media.id })
            }}
          >
            <X size={16} />
          </GlassButton>
        </div>
      </div>

      {/* Non-blocking player status panel — sits BELOW the frame in normal
          flow; the iframe itself is never covered. */}
      {showFallback && (
        <GlassPanel
          variant="subtle"
          className="flex flex-col gap-3 rounded-2xl p-4 md:flex-row md:items-center md:justify-between"
        >
          <div className="flex items-center gap-3">
            <span className="glass rounded-full p-2.5 text-mauve"><ShieldAlert size={16} /></span>
            <div>
              <h3 className="text-sm font-bold text-ink">Player status</h3>
              <p className="text-xs font-semibold text-mauve">
                {longWait
                  ? <>
                      No playback signal from {attempt.provider} ({new URL(attempt.domain).host}).
                      {exhausted ? ' Every provider was tried — pick one below or open it in a new tab.' : ' Auto-fallback keeps trying the next provider automatically, or pick one below.'}
                    </>
                  : <>Waiting for {attempt.provider}… slow embed, or no stream available for this title. Auto-fallback will switch if it stays silent.</>}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-mauve">
              <Zap size={11} /> Auto-fallback on · switch provider
            </span>
            {providers.map((p, i) => (
              <Chip key={p.name} active={attempt.provider === p.name} onClick={() => switchProvider(i)}>
                {p.name}
              </Chip>
            ))}
            <a
              href={embedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-gradient-rose px-4 py-2 text-xs font-bold text-ink shadow-lg transition hover:brightness-110"
            >
              ▶ Open player in new tab
            </a>
          </div>
        </GlassPanel>
      )}

      {/* Now playing info */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">{media.title}</h1>
          <p className="mt-0.5 text-sm font-semibold text-mauve">
            {media.mediaType === 'movie' ? 'Movie' : `Season ${season}, Episode ${episode}`}
            {' · '}provider: {attempt.provider} ({new URL(attempt.domain).host}){' · '}ID: TMDB {media.tmdbId}
            {media.mediaType === 'anime' && media.malId ? ` · MAL ${media.malId}` : ''}
          </p>
        </div>
        <GlassPanel variant="subtle" className="max-w-md p-4 text-xs leading-relaxed text-mauve">
          <span className="font-bold text-ink">Progress privacy:</span> playback position is written to your
          browser&apos;s IndexedDB only — the Worker never sees user history. AI receives an anonymized taste profile,
          never raw watch data.
        </GlassPanel>
      </div>

      {/* Episode quick list for TV/anime */}
      {seasonInfo && (
        <GlassPanel className="p-5">
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-mauve">Season {season} episodes</h3>
          <div className="row-scroll no-scrollbar flex gap-2 overflow-x-auto pb-1">
            {Array.from({ length: seasonInfo.episodes }, (_, i) => i + 1).map((ep) => (
              <button
                key={ep}
                onClick={() => {
                  posRef.current = 0
                  savedRef.current = 0
                  updatePlayer({ episode: ep, position: 0 })
                  navigate({ name: 'watch', id: media.id, season, episode: ep }, true)
                }}
                className={cn(
                  'min-h-[44px] min-w-[52px] shrink-0 rounded-xl px-3 py-2 text-sm font-bold transition-all',
                  ep === episode ? 'bg-gradient-rose text-ink shadow' : 'glass text-ink hover:brightness-105'
                )}
              >
                {ep}
              </button>
            ))}
          </div>
        </GlassPanel>
      )}
    </div>
  )
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
