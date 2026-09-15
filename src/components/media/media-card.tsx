'use client'

import { Play, Plus, Check, Heart, Info } from 'lucide-react'
import type { UnifiedMedia } from '@/lib/types'
import { useApp } from '@/lib/store'
import { favoritesStore, watchlistStore } from '@/lib/db/stores'
import { SmartPoster } from './smart-poster'
import { RatingBadge } from '../ui-custom/glass'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useEffect, useState } from 'react'

/* ── CinemaOS MediaCard — poster with quick actions ─────────────────── */

export function MediaCard({ media, className, index = 0 }: { media: UnifiedMedia; className?: string; index?: number }) {
  const { navigate, openPlayer, bumpLibrary } = useApp()
  const [inWatchlist, setInWatchlist] = useState(false)
  const [fav, setFav] = useState(false)

  useEffect(() => {
    let alive = true
    Promise.all([watchlistStore.has(media.id), favoritesStore.has(media.id)]).then(([w, f]) => {
      if (!alive) return
      setInWatchlist(!!w)
      setFav(!!f)
    })
    return () => { alive = false }
  }, [media.id])

  const toggleWatchlist = async (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const added = await watchlistStore.toggle(media)
    setInWatchlist(added)
    bumpLibrary()
    toast(added ? `Added "${media.title}" to Watchlist` : `Removed from Watchlist`, {
      description: added ? 'Saved locally on this device' : undefined,
    })
  }

  const toggleFav = async (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const added = await favoritesStore.toggle(media)
    setFav(added)
    bumpLibrary()
    if (added) toast(`Loved "${media.title}" — tuning your recommendations`)
  }

  const play = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    openPlayer(media, media.mediaType !== 'movie' ? 1 : undefined, 1)
  }

  const href = `/${media.mediaType === 'tv' ? 'tv' : 'movie'}/${media.tmdbId}`

  return (
    <a
      href={href}
      className={cn('group anim-rise relative block w-full shrink-0 cursor-pointer', className)}
      style={{ animationDelay: `${Math.min(index * 40, 400)}ms` }}
      onClick={(e) => {
        e.preventDefault() // crawler-visible href; humans get instant SPA nav
        navigate({ name: 'detail', id: media.id })
      }}
      aria-label={`${media.title} (${media.year || 'Unknown'})`}
    >
      <div className="glass glass-hover relative overflow-hidden rounded-2xl">
        <SmartPoster media={media} className="aspect-[2/3] w-full" />

        {/* hover overlay — actions (always visible in TV mode via .tv-always) */}
        <div className="tv-always absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-gradient-to-t from-black/70 via-black/10 to-transparent opacity-0 transition-all duration-300 group-hover:opacity-100 group-focus-within:opacity-100">
          <button
            onClick={play}
            className="flex translate-y-2 items-center gap-2 rounded-full bg-gradient-rose px-4 py-2 text-sm font-extrabold text-white shadow-xl transition-all duration-300 hover:scale-105 group-hover:translate-y-0"
            aria-label={`Play ${media.title}`}
            style={{ boxShadow: '0 8px 30px var(--glow)' }}
          >
            <Play size={15} fill="currentColor" /> Play
          </button>
          <div className="flex gap-2">
            <button
              onClick={toggleWatchlist}
              className={cn(
                'glass rounded-full p-2 text-white transition-transform hover:scale-110',
                inWatchlist && 'border-rose/60 text-rose'
              )}
              aria-label={inWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
            >
              {inWatchlist ? <Check size={14} /> : <Plus size={14} />}
            </button>
            <button
              onClick={toggleFav}
              className={cn(
                'glass rounded-full p-2 text-white transition-transform hover:scale-110',
                fav && 'border-rose/60 text-rose'
              )}
              aria-label={fav ? 'Remove favorite' : 'Add to favorites'}
            >
              <Heart size={14} fill={fav ? 'currentColor' : 'none'} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); navigate({ name: 'detail', id: media.id }) }}
              className="glass rounded-full p-2 text-white transition-transform hover:scale-110"
              aria-label={`More info about ${media.title}`}
            >
              <Info size={14} />
            </button>
          </div>
        </div>

        {/* top badges */}
        <div className="pointer-events-none absolute left-2 top-2 flex gap-1.5">
          <span className="rounded-full border border-white/10 bg-black/45 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-white/90 backdrop-blur-md">
            {media.mediaType === 'movie' ? 'Movie' : media.mediaType === 'tv' ? 'TV' : 'Anime'}
          </span>
        </div>
        <RatingBadge rating={media.voteAverage} className="absolute right-2 top-2" />
      </div>

      <div className="px-1 pt-2">
        <h3 className="truncate text-sm font-bold text-ink transition-colors group-hover:text-rose">{media.title}</h3>
        <p className="truncate text-xs text-mauve">{media.year || 'Unknown'} · {media.genres.slice(0, 2).join(' · ') || mediaTypeLabelLite(media.mediaType)}</p>
      </div>
    </a>
  )
}

function mediaTypeLabelLite(t: string) {
  return t === 'movie' ? 'Movie' : t === 'tv' ? 'TV Series' : 'Anime'
}

export function CardSkeleton({ index = 0 }: { index?: number }) {
  return (
    <div className="w-full shrink-0" style={{ opacity: 1 - Math.min(index * 0.12, 0.6) }}>
      <div className="skeleton-shimmer aspect-[2/3] w-full rounded-2xl" />
      <div className="px-1 pt-2">
        <div className="skeleton-shimmer h-3.5 w-3/4 rounded-full" />
        <div className="skeleton-shimmer mt-1.5 h-2.5 w-1/2 rounded-full" />
      </div>
    </div>
  )
}
