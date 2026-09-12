'use client'

import { useEffect, useState } from 'react'
import { Play, Plus, Check, Info, Sparkles } from 'lucide-react'
import type { UnifiedMedia } from '@/lib/types'
import { useApp } from '@/lib/store'
import { SmartPoster } from './smart-poster'
import { RatingBadge, Chip } from '../ui-custom/glass'
import { watchlistStore } from '@/lib/db/stores'
import { formatRuntime, mediaTypeLabel } from '@/lib/services/media'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

export function Hero({ items, loading }: { items: UnifiedMedia[]; loading?: boolean }) {
  const { navigate, openPlayer, bumpLibrary } = useApp()
  const [idx, setIdx] = useState(0)
  const [paused, setPaused] = useState(false)
  const [inList, setInList] = useState(false)

  const current = items[idx]

  useEffect(() => {
    if (paused || items.length <= 1) return
    const t = setInterval(() => setIdx((i) => (i + 1) % items.length), 8000)
    return () => clearInterval(t)
  }, [paused, items.length])

  useEffect(() => {
    if (!current) return
    let alive = true
    watchlistStore.has(current.id).then((v) => alive && setInList(!!v))
    return () => { alive = false }
  }, [current])

  if (loading || !current) {
    return <div className="skeleton-shimmer h-[420px] w-full rounded-3xl md:h-[480px]" aria-hidden />
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
      aria-label="Featured"
    >
      <div className="glass relative min-h-[420px] overflow-hidden rounded-3xl md:min-h-[480px]">
        <div key={current.id} className="anim-hero absolute inset-0">
          <SmartPoster media={current} variant="backdrop" size="w1280" className="h-full w-full" />
        </div>

        <div className="absolute inset-0 bg-gradient-to-r from-white/55 via-white/20 to-transparent md:via-white/10" />
        <div className="absolute inset-0 bg-gradient-to-t from-white/45 via-transparent to-transparent" />

        <div className="relative z-10 flex h-full flex-col justify-end gap-4 p-6 md:max-w-2xl md:p-10 lg:justify-center">
          <div className="flex flex-wrap items-center gap-2">
            <Chip active>{mediaTypeLabel(current.mediaType)}</Chip>
            <Chip>#{idx + 1} Featured</Chip>
            {current.imdbRating && <Chip>IMDb {current.imdbRating}</Chip>}
          </div>

          <h1
            key={current.id + '-t'}
            className="anim-title text-3xl font-extrabold leading-[1.08] tracking-tight text-ink drop-shadow-sm md:text-5xl"
          >
            {current.title}
          </h1>

          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink/80">
            <RatingBadge rating={current.voteAverage} />
            <span>{current.year}</span>
            <span aria-hidden>·</span>
            {current.runtime ? (
              <>
                <span>{formatRuntime(current.runtime)}</span>
                <span aria-hidden>·</span>
              </>
            ) : null}
            <span className="hidden sm:inline">{current.genres.join(' · ')}</span>
          </div>

          <p className="hidden max-w-xl text-sm leading-relaxed text-ink/75 md:block md:text-[15px]">
            {current.overview}
          </p>

          <div className="mt-1 flex flex-wrap items-center gap-3">
            <button
              onClick={() => openPlayer(current, current.mediaType !== 'movie' ? 1 : undefined, 1)}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-rose px-7 py-3 text-sm font-bold text-ink shadow-xl shadow-rose/40 transition-transform hover:scale-[1.03] active:scale-95"
            >
              <Play size={17} fill="currentColor" /> Watch Now
            </button>
            <button
              onClick={toggleList}
              className="glass glass-hover inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-bold text-ink"
            >
              {inList ? <Check size={17} /> : <Plus size={17} />}
              {inList ? 'In Watchlist' : 'Watchlist'}
            </button>
            <button
              onClick={() => navigate({ name: 'detail', id: current.id })}
              className="glass glass-hover inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-bold text-ink"
            >
              <Info size={17} /> Details
            </button>
          </div>
        </div>

        {/* dots */}
        <div className="absolute bottom-5 right-6 z-10 hidden gap-2 md:flex">
          {items.map((it, i) => (
            <button
              key={it.id}
              onClick={() => setIdx(i)}
              aria-label={`Show featured item ${i + 1}`}
              className={cn(
                'h-1.5 rounded-full transition-all duration-300',
                i === idx ? 'w-8 bg-ink' : 'w-3 bg-ink/30 hover:bg-ink/50'
              )}
            />
          ))}
        </div>

        <div className="glass-subtle absolute right-6 top-5 z-10 hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-mauve md:flex">
          <Sparkles size={12} /> InvokeIL Picks
        </div>
      </div>
    </section>
  )
}
