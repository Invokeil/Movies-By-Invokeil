'use client'

import { useEffect, useState, useRef } from 'react'
import { Play, Plus, Check, Info, ChevronLeft, ChevronRight, Pause } from 'lucide-react'
import type { UnifiedMedia } from '@/lib/types'
import { useApp } from '@/lib/store'
import { SmartPoster } from './smart-poster'
import { RatingBadge } from '../ui-custom/glass'
import { watchlistStore } from '@/lib/db/stores'
import { formatRuntime, mediaTypeLabel } from '@/lib/services/media'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

/* ── CinemaOS Hero — full-bleed cinematic backdrop ────────────────────
   Auto-advances every 9 s (pausable), supports swipe on touch, arrow
   keys in TV mode, and keeps one instance of the artwork mounted per
   slide for a clean crossfade.                                          */

export function Hero({ items, loading }: { items: UnifiedMedia[]; loading?: boolean }) {
  const { navigate, openPlayer, bumpLibrary } = useApp()
  const [idx, setIdx] = useState(0)
  const [paused, setPaused] = useState(false)
  const [inList, setInList] = useState(false)
  const touchX = useRef<number | null>(null)

  const current = items[idx]

  useEffect(() => {
    if (paused || items.length <= 1) return
    const t = setInterval(() => setIdx((i) => (i + 1) % items.length), 9000)
    return () => clearInterval(t)
  }, [paused, items.length])

  useEffect(() => {
    if (!current) return
    let alive = true
    watchlistStore.has(current.id).then((v) => alive && setInList(!!v))
    return () => { alive = false }
  }, [current])

  if (loading || !current) {
    return <div className="skeleton-shimmer h-[46vh] min-h-80 w-full rounded-3xl md:h-[520px]" aria-hidden />
  }

  const toggleList = async () => {
    const added = await watchlistStore.toggle(current)
    setInList(added)
    bumpLibrary()
    toast(added ? 'Added to Watchlist' : 'Removed from Watchlist')
  }

  return (
    <section
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX }}
      onTouchEnd={(e) => {
        if (touchX.current === null) return
        const dx = e.changedTouches[0].clientX - touchX.current
        if (Math.abs(dx) > 48) setIdx((i) => (i + (dx < 0 ? 1 : -1) + items.length) % items.length)
        touchX.current = null
      }}
      aria-label="Featured"
    >
      <div className="relative min-h-[46vh] min-h-80 overflow-hidden rounded-3xl md:h-[520px]">
        <div key={current.id} className="anim-hero absolute inset-0">
          <SmartPoster media={current} variant="backdrop" size="w1280" className="h-full w-full" />
        </div>

        {/* cinematic scrims */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/35 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg)] via-transparent to-black/25" />
        <div className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-inset ring-white/10" />

        <div className="relative z-10 flex h-full min-h-[46vh] flex-col justify-end gap-3 p-5 md:min-h-[520px] md:max-w-2xl md:gap-4 md:p-10 lg:justify-center">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full bg-gradient-rose px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-white">
              {mediaTypeLabel(current.mediaType)}
            </span>
            <span className="glass-subtle rounded-full px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-ink-soft">
              #{idx + 1} Featured
            </span>
            {current.imdbRating ? (
              <span className="glass-subtle rounded-full px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#f5c518]">
                IMDb {current.imdbRating}
              </span>
            ) : null}
          </div>

          <h1
            key={current.id + '-t'}
            className="anim-title text-3xl font-black leading-[1.05] tracking-tight text-white drop-shadow-lg md:text-6xl"
          >
            {current.title}
          </h1>

          <div className="flex flex-wrap items-center gap-2.5 text-sm font-semibold text-white/85">
            <RatingBadge rating={current.voteAverage} />
            <span>{current.year || 'Unknown'}</span>
            <span aria-hidden className="text-white/40">•</span>
            {current.runtime ? (
              <>
                <span>{formatRuntime(current.runtime)}</span>
                <span aria-hidden className="text-white/40">•</span>
              </>
            ) : null}
            <span className="hidden sm:inline">{current.genres.slice(0, 3).join(' · ')}</span>
          </div>

          <p className="line-clamp-2 hidden max-w-xl text-sm leading-relaxed text-white/70 md:block md:text-[15px]">
            {current.overview}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              onClick={() => openPlayer(current, current.mediaType !== 'movie' ? 1 : undefined, 1)}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-rose px-7 py-3 text-sm font-extrabold text-white shadow-xl transition-transform hover:scale-[1.04] active:scale-95"
              style={{ boxShadow: '0 10px 40px var(--glow)' }}
            >
              <Play size={17} fill="currentColor" /> Watch Now
            </button>
            <button
              onClick={toggleList}
              className="glass glass-hover inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-bold text-white"
            >
              {inList ? <Check size={17} className="text-rose" /> : <Plus size={17} />}
              {inList ? 'In Watchlist' : 'Watchlist'}
            </button>
            <button
              onClick={() => navigate({ name: 'detail', id: current.id })}
              className="glass glass-hover inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-bold text-white"
            >
              <Info size={17} /> Details
            </button>
          </div>
        </div>

        {/* controls */}
        <div className="absolute bottom-5 right-5 z-10 flex items-center gap-2">
          {items.length > 1 && (
            <>
              <button
                onClick={() => setIdx((i) => (i - 1 + items.length) % items.length)}
                className="glass hidden h-9 w-9 items-center justify-center rounded-full text-white hover:brightness-125 md:flex"
                aria-label="Previous featured"
              >
                <ChevronLeft size={17} />
              </button>
              <button
                onClick={() => setPaused((p) => !p)}
                className="glass hidden h-9 w-9 items-center justify-center rounded-full text-white hover:brightness-125 md:flex"
                aria-label={paused ? 'Resume auto-rotate' : 'Pause auto-rotate'}
              >
                <Pause size={14} />
              </button>
              <button
                onClick={() => setIdx((i) => (i + 1) % items.length)}
                className="glass hidden h-9 w-9 items-center justify-center rounded-full text-white hover:brightness-125 md:flex"
                aria-label="Next featured"
              >
                <ChevronRight size={17} />
              </button>
            </>
          )}
        </div>

        {/* progress dots */}
        <div className="absolute bottom-6 left-6 z-10 hidden gap-1.5 md:flex">
          {items.map((it, i) => (
            <button
              key={it.id}
              onClick={() => setIdx(i)}
              aria-label={`Show featured item ${i + 1}`}
              className={cn(
                'h-1.5 rounded-full transition-all duration-300',
                i === idx ? 'w-8 bg-gradient-rose' : 'w-2.5 bg-white/25 hover:bg-white/50'
              )}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
