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
    const added = await watchlistStore.toggle(media)
    setInWatchlist(added)
    bumpLibrary()
    toast(added ? `Added "${media.title}" to Watchlist` : `Removed from Watchlist`, {
      description: added ? 'Saved locally on this device' : undefined,
    })
  }

  const toggleFav = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const added = await favoritesStore.toggle(media)
    setFav(added)
    bumpLibrary()
    if (added) toast(`Loved "${media.title}" — tuning your recommendations`)
  }

  return (
    <article
      className={cn('group anim-rise relative w-40 shrink-0 cursor-pointer md:w-44', className)}
      style={{ animationDelay: `${Math.min(index * 40, 400)}ms` }}
      onClick={() => navigate({ name: 'detail', id: media.id })}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && navigate({ name: 'detail', id: media.id })}
      aria-label={`${media.title} (${media.year})`}
    >
      <div className="glass glass-hover relative overflow-hidden rounded-2xl">
        <SmartPoster media={media} className="aspect-[2/3] w-full" />

        {/* hover overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-gradient-to-t from-black/35 via-transparent to-transparent opacity-0 backdrop-blur-[2px] transition-all duration-300 group-hover:opacity-100">
          <button
            onClick={(e) => { e.stopPropagation(); openPlayer(media, media.mediaType !== 'movie' ? 1 : undefined, 1) }}
            className="glass-strong flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-ink transition-transform hover:scale-105"
            aria-label={`Play ${media.title}`}
          >
            <Play size={16} fill="currentColor" /> Play
          </button>
          <div className="flex gap-2">
            <button
              onClick={toggleWatchlist}
              className={cn('glass rounded-full p-2 text-ink transition-transform hover:scale-110', inWatchlist && 'bg-rose/60')}
              aria-label={inWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
            >
              {inWatchlist ? <Check size={15} /> : <Plus size={15} />}
            </button>
            <button
              onClick={toggleFav}
              className={cn('glass rounded-full p-2 text-ink transition-transform hover:scale-110', fav && 'bg-rose/60')}
              aria-label={fav ? 'Remove favorite' : 'Add to favorites'}
            >
              <Heart size={15} fill={fav ? 'currentColor' : 'none'} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); navigate({ name: 'detail', id: media.id }) }}
              className="glass rounded-full p-2 text-ink transition-transform hover:scale-110"
              aria-label={`More info about ${media.title}`}
            >
              <Info size={15} />
            </button>
          </div>
        </div>

        {/* top badges */}
        <div className="absolute left-2 top-2 flex gap-1.5">
          <span className="rounded-full bg-white/65 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink backdrop-blur-sm">
            {media.mediaType === 'movie' ? 'Movie' : media.mediaType === 'tv' ? 'TV' : 'Anime'}
          </span>
        </div>
        <RatingBadge rating={media.voteAverage} className="absolute right-2 top-2" />
      </div>

      <div className="px-1 pt-2">
        <h3 className="truncate text-sm font-bold text-ink">{media.title}</h3>
        <p className="text-xs text-mauve">{media.year} · {media.genres.slice(0, 2).join(' · ')}</p>
      </div>
    </article>
  )
}

export function CardSkeleton({ index = 0 }: { index?: number }) {
  return (
    <div className="w-40 shrink-0 md:w-44" style={{ opacity: 1 - Math.min(index * 0.12, 0.6) }}>
      <PosterSkeleton2 />
      <div className="px-1 pt-2">
        <div className="skeleton-shimmer h-3.5 w-3/4 rounded-full" />
        <div className="skeleton-shimmer mt-1.5 h-2.5 w-1/2 rounded-full" />
      </div>
    </div>
  )
}

function PosterSkeleton2() {
  return <div className="skeleton-shimmer aspect-[2/3] w-full rounded-2xl" />
}
