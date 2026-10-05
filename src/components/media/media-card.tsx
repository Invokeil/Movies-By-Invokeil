'use client'

import { Play, Plus, Check, Heart, Info } from 'lucide-react'
import { motion } from 'motion/react'
import type { UnifiedMedia } from '@/lib/types'
import { useApp } from '@/lib/store'
import { favoritesStore, watchlistStore } from '@/lib/db/stores'
import { SmartPoster } from './smart-poster'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useEffect, useState } from 'react'

/* ── Porcelain MediaCard — frosted poster card with motion ──────────── */

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
    toast(added ? `Added "${media.title}" to Watchlist` : 'Removed from Watchlist', {
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
    <motion.a
      href={href}
      className={cn('group relative block w-full shrink-0 cursor-pointer', className)}
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '40px' }}
      transition={{ duration: 0.5, delay: Math.min(index * 0.05, 0.35), ease: [0.22, 1, 0.36, 1] }}
      onClick={(e) => {
        e.preventDefault() // crawler-visible href; humans get instant SPA nav
        navigate({ name: 'detail', id: media.id })
      }}
      aria-label={`${media.title} (${media.year || 'Unknown'})`}
    >
      <motion.div
        className="glass relative overflow-hidden rounded-[1.3rem]"
        whileHover={{ y: -6 }}
        transition={{ type: 'spring', stiffness: 320, damping: 24 }}
      >
        <SmartPoster media={media} className="aspect-[2/3] w-full" />

        {/* hover overlay — actions (always visible in TV mode via .tv-always) */}
        <div className="tv-always absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-gradient-to-t from-[rgba(15,23,42,0.78)] via-[rgba(15,23,42,0.12)] to-transparent opacity-0 transition-all duration-300 group-hover:opacity-100 group-focus-within:opacity-100">
          <motion.button
            onClick={play}
            className="pill-navy flex translate-y-2 items-center rounded-full pl-1.5 pr-5 py-1.5 text-sm font-medium text-white shadow-xl transition-all duration-300 group-hover:translate-y-0"
            aria-label={`Play ${media.title}`}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
          >
            <span className="icon-circle mr-1.5 h-7 w-7">
              <Play size={13} fill="currentColor" aria-hidden />
            </span>
            Play
          </motion.button>
          <div className="flex translate-y-2 gap-2 transition-transform duration-300 group-hover:translate-y-0">
            <button
              onClick={toggleWatchlist}
              className="badge-frost rounded-full p-2 text-[rgba(30,50,90,0.9)] transition-transform hover:scale-110"
              aria-label={inWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
            >
              {inWatchlist ? <Check size={14} /> : <Plus size={14} />}
            </button>
            <button
              onClick={toggleFav}
              className={cn('badge-frost rounded-full p-2 text-[rgba(30,50,90,0.9)] transition-transform hover:scale-110', fav && 'text-rose')}
              aria-label={fav ? 'Remove favorite' : 'Add to favorites'}
            >
              <Heart size={14} fill={fav ? 'currentColor' : 'none'} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); navigate({ name: 'detail', id: media.id }) }}
              className="badge-frost rounded-full p-2 text-[rgba(30,50,90,0.9)] transition-transform hover:scale-110"
              aria-label={`More info about ${media.title}`}
            >
              <Info size={14} />
            </button>
          </div>
        </div>

        {/* top badges */}
        <div className="pointer-events-none absolute left-2.5 top-2.5">
          <span className="badge-frost rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wider text-[rgba(30,50,90,0.85)]">
            {media.mediaType === 'movie' ? 'Movie' : media.mediaType === 'tv' ? 'TV' : 'Anime'}
          </span>
        </div>
        {media.voteAverage > 0 && (
          <span className="badge-frost pointer-events-none absolute right-2.5 top-2.5 flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold text-[rgba(30,50,90,0.9)] tabular">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="#f5c518" stroke="none" aria-hidden>
              <path d="M12 2l2.9 6.26L21.5 9.3l-4.75 4.4 1.15 6.8L12 17.2l-5.9 3.3 1.15-6.8L2.5 9.3l6.6-1.04L12 2z" />
            </svg>
            {media.voteAverage.toFixed(1)}
          </span>
        )}
      </motion.div>

      <div className="px-1 pt-2.5">
        <h3 className="truncate text-sm font-semibold tracking-tight text-ink transition-colors group-hover:text-rose">{media.title}</h3>
        <p className="truncate text-xs font-normal text-mauve tabular">{media.year || 'Unknown'} · {media.genres.slice(0, 2).join(' · ') || mediaTypeLabelLite(media.mediaType)}</p>
      </div>
    </motion.a>
  )
}

function mediaTypeLabelLite(t: string) {
  return t === 'movie' ? 'Movie' : t === 'tv' ? 'TV Series' : 'Anime'
}

export function CardSkeleton({ index = 0 }: { index?: number }) {
  return (
    <div className="w-full shrink-0" style={{ opacity: 1 - Math.min(index * 0.12, 0.6) }} aria-hidden>
      <div className="skeleton-shimmer aspect-[2/3] w-full rounded-[1.3rem]" />
      <div className="px-1 pt-2.5">
        <div className="skeleton-shimmer h-3.5 w-3/4 rounded-full" />
        <div className="skeleton-shimmer mt-1.5 h-2.5 w-1/2 rounded-full" />
      </div>
    </div>
  )
}
