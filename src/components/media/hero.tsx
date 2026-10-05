'use client'

import { useEffect, useState, useRef } from 'react'
import {
  Play, Plus, Check, ChevronLeft, ChevronRight, Pause, Sparkles, Star,
} from 'lucide-react'
import { motion } from 'motion/react'
import type { UnifiedMedia } from '@/lib/types'
import { useApp } from '@/lib/store'
import { SmartPoster } from './smart-poster'
import { watchlistStore } from '@/lib/db/stores'
import { formatRuntime, mediaTypeLabel } from '@/lib/services/media'
import { tmdbImg } from '@/lib/images'
import { EASE } from '../ui-custom/motion'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

/* ── Glasshouse Hero — ConSentinel composition, movie-grade data ──────
   Full-bleed artwork stage with edge scrims melting into the studio
   canvas. Weight-360 display title, white play orb + hero tag, ink CTA
   with knob, weight-200 stats with slash separators, gradient glass
   panel (Viewer Score + scale track) and a poster-thumb meet pill.
   Auto-advances every 9 s, swipeable, keyboard-friendly.               */

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
    return <div className="skeleton-shimmer h-[64vh] min-h-96 w-full rounded-[2rem] md:h-[76vh] md:rounded-[calc(44*var(--u))]" aria-hidden />
  }

  const toggleList = async () => {
    const added = await watchlistStore.toggle(current)
    setInList(added)
    bumpLibrary()
    toast(added ? 'Added to Watchlist' : 'Removed from Watchlist')
  }

  const nav = (dir: 1 | -1) => setIdx((i) => (i + dir + items.length) % items.length)
  const score = current.voteAverage > 0 ? Math.min(10, current.voteAverage) : 0
  const metaBits = [
    current.year || null,
    current.runtime ? formatRuntime(current.runtime) : null,
    current.genres.slice(0, 2).join(' · ') || null,
  ].filter(Boolean) as string[]

  return (
    <section
      className="group relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX }}
      onTouchEnd={(e) => {
        if (touchX.current === null) return
        const dx = e.changedTouches[0].clientX - touchX.current
        if (Math.abs(dx) > 48) nav(dx < 0 ? 1 : -1)
        touchX.current = null
      }}
      aria-label="Featured"
      aria-roledescription="carousel"
    >
      <div
        className="relative overflow-hidden rounded-[1.6rem] bg-white/10 md:rounded-[calc(44*var(--u))]"
        style={{ height: 'min(calc(880 * var(--u)), calc(100dvh - 148px))', minHeight: 520 }}
      >
        {/* artwork — slow ken-burns push-in, crossfade on change */}
        <div className="absolute inset-0 z-0">
          <motion.div
            key={current.id}
            className="absolute inset-0"
            initial={{ opacity: 0, scale: 1.06 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ opacity: { duration: 0.9, ease: EASE }, scale: { duration: 9, ease: 'linear' } }}
          >
            <SmartPoster media={current} variant="backdrop" size="w1280" className="h-full w-full" />
          </motion.div>
        </div>

        {/* studio scrims — melt artwork into the canvas (theme-aware) */}
        <div className="absolute inset-0 bg-gradient-to-r from-[rgba(var(--hero-scrim),0.9)] via-[rgba(var(--hero-scrim),0.35)] to-transparent" aria-hidden />
        <div className="absolute inset-0 bg-gradient-to-t from-[rgba(var(--hero-scrim),0.85)] via-[rgba(var(--hero-scrim),0.12)] to-transparent" aria-hidden />
        <div className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/40" aria-hidden />

        {/* top-right rotation controls + AI orb (desktop) */}
        {items.length > 1 && (
          <div className="absolute right-4 top-4 z-20 hidden items-center gap-1.5 md:flex lg:right-[calc(24*var(--u))] lg:top-[calc(24*var(--u))]">
            <HeroIconBtn label="Previous featured" onClick={() => nav(-1)}><ChevronLeft size={16} /></HeroIconBtn>
            <HeroIconBtn label={paused ? 'Resume auto-rotate' : 'Pause auto-rotate'} onClick={() => setPaused((p) => !p)}>
              {paused ? <Play size={13} /> : <Pause size={13} />}
            </HeroIconBtn>
            <HeroIconBtn label="Next featured" onClick={() => nav(1)}><ChevronRight size={16} /></HeroIconBtn>
          </div>
        )}

        {/* ── content composition ── */}
        <div className="relative z-10 flex h-full flex-col justify-end px-5 pb-16 pt-8 sm:px-9 sm:pb-14 md:px-[calc(56*var(--u))] md:pb-[calc(52*var(--u))] md:pt-[calc(48*var(--u))] lg:flex-row lg:items-end lg:justify-between lg:gap-[calc(46*var(--u))]">
          {/* left — copy column */}
          <div className="flex min-w-0 max-w-[min(62vw,780px)] flex-col items-start lg:max-w-[46vw]">
            {/* eyebrow */}
            <motion.p
              key={current.id + '-e'}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: EASE }}
              className="hero-eyebrow flex items-center gap-2"
            >
              <Sparkles size={14} className="shrink-0 text-[var(--hero-ink-soft)]" aria-hidden />
              Trending {mediaTypeLabel(current.mediaType)}
              {current.imdbRating ? ` · IMDb ${current.imdbRating.toFixed(1)}` : ''}
            </motion.p>

            {/* display title — weight 360, tight, balanced */}
            <motion.h1
              key={current.id + '-t'}
              initial={{ opacity: 0, scale: 0.985 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.15, ease: EASE }}
              className="display-hero mt-[calc(14*var(--u))] text-[clamp(2.4rem,calc(76*var(--u)),6.4rem)]"
            >
              {current.title}
            </motion.h1>

            {/* tag row — white play orb + hero tag */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.7, delay: 0.3 }}
              className="mt-[calc(22*var(--u))] flex flex-wrap items-center gap-x-3 gap-y-2"
            >
              <motion.button
                onClick={() => openPlayer(current, current.mediaType !== 'movie' ? 1 : undefined, 1)}
                className="play-orb h-[max(calc(46*var(--u)),40px)] w-[max(calc(46*var(--u)),40px)]"
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.94 }}
                aria-label={`Play ${current.title}`}
              >
                <svg viewBox="0 0 13 14" className="h-[38%] w-[38%] translate-x-[6%]" aria-hidden>
                  <path d="M1.4 1.3 11.6 7 1.4 12.7z" fill="#0b1526" />
                </svg>
              </motion.button>
              <span className="hero-tag">
                {metaBits.join('  ·  ')}
              </span>
            </motion.div>

            {/* CTAs — ink pill with knob + glass pill */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.45, ease: EASE }}
              className="mt-[calc(26*var(--u))] flex flex-wrap items-center gap-3"
            >
              <motion.button
                onClick={() => openPlayer(current, current.mediaType !== 'movie' ? 1 : undefined, 1)}
                className="cta-ink flex items-center gap-3 py-1.5 pl-6 pr-1.5"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
              >
                <span className="text-[max(calc(15*var(--u)),14px)] font-[470] tracking-[-0.01em]">Watch Now</span>
                <span className="knob h-[max(calc(38*var(--u)),34px)] w-[max(calc(38*var(--u)),34px)]">
                  <Play size={14} fill="currentColor" aria-hidden />
                </span>
              </motion.button>
              <motion.button
                onClick={toggleList}
                className="glass flex items-center gap-2 rounded-full px-5 py-3 text-sm font-[470] text-ink"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                aria-pressed={inList}
              >
                {inList ? <Check size={16} className="text-rose" aria-hidden /> : <Plus size={16} strokeWidth={1.9} aria-hidden />}
                {inList ? 'In Watchlist' : 'Watchlist'}
              </motion.button>
            </motion.div>

            {/* stats — weight 200 numerals, slash separators (wide screens) */}
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.6, ease: EASE }}
              className="mt-[calc(44*var(--u))] hidden items-end gap-[calc(22*var(--u))] lg:flex"
            >
              <div className="stat">
                <span className="stat-num">950K+</span>
                <span className="stat-lbl mt-2 block">Movies & Series<br />Discoverable</span>
              </div>
              <span className="slash-sep" aria-hidden />
              <div className="stat">
                <span className="stat-num">40+</span>
                <span className="stat-lbl mt-2 block">Genres<br />& Moods</span>
              </div>
              <span className="slash-sep" aria-hidden />
              <div className="stat">
                <span className="stat-num">0</span>
                <span className="stat-lbl mt-2 block">Accounts<br />Required</span>
              </div>
            </motion.div>
          </div>

          {/* right — gradient glass panel: Viewer Score */}
          <motion.aside
            key={current.id + '-p'}
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.35, ease: EASE }}
            className="glass-panel mt-8 hidden w-[max(calc(275*var(--u)),240px)] flex-none p-[calc(30*var(--u))] md:block lg:mt-0 lg:self-center"
            aria-label="Viewer score"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="gp-title block">Viewer Score</span>
                <span className="gp-sub mt-[calc(8*var(--u))] block">TMDB community rating</span>
              </div>
              <span className="flex h-[max(calc(56*var(--u)),44px)] w-[max(calc(56*var(--u)),44px)] flex-none items-center justify-center rounded-full bg-[rgba(var(--surface-tint),0.92)] shadow-[0_0_calc(26*var(--u))_calc(10*var(--u))_rgba(255,255,255,0.5)]" aria-hidden>
                <Star size={22} className="fill-[#f5c518] text-[#f5c518]" />
              </span>
            </div>
            <div className="mt-[calc(26*var(--u))] flex items-end justify-between gap-3">
              <span className="gp-num">{score > 0 ? score.toFixed(1) : 'NR'}</span>
              <span className="gp-scale pb-1">/ 10</span>
            </div>
            <div className="gp-track mt-[calc(14*var(--u))]" role="img" aria-label={`${score.toFixed(1)} out of 10`}>
              <i style={{ width: `${Math.max(6, score * 10)}%` }} />
            </div>
            <div className="gp-scale mt-[calc(10*var(--u))] flex justify-between">
              <span>1</span><span>5</span><span>10</span>
            </div>
            {current.genres.length > 0 && (
              <p className="gp-sub mt-[calc(22*var(--u))] border-t border-[rgba(var(--surface-tint),0.4)] pt-[calc(16*var(--u))]">
                {current.genres.slice(0, 3).join(' · ')}
              </p>
            )}
          </motion.aside>
        </div>

        {/* ── bottom-right meet pill — poster thumb + knob (desktop) ── */}
        <motion.button
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.5, ease: EASE }}
          onClick={() => navigate({ name: 'detail', id: current.id })}
          className="meet-pill absolute bottom-[calc(28*var(--u))] right-[calc(28*var(--u))] z-10 hidden items-center gap-3 py-2 pl-2 pr-2 md:flex lg:pr-3"
          whileHover={{ scale: 1.015 }}
          whileTap={{ scale: 0.98 }}
          aria-label={`Open details for ${current.title}`}
        >
          <span className="thumb h-[max(calc(56*var(--u)),44px)] w-[max(calc(56*var(--u)),44px)]">
            {current.posterPath ? (
              <img src={tmdbImg(current.posterPath, 'w185')} alt="" loading="lazy" decoding="async" />
            ) : (
              <span className="flex h-full w-full items-center justify-center bg-[rgba(var(--surface-tint),0.5)]">
                <Play size={16} className="text-[var(--hero-ink)]" aria-hidden />
              </span>
            )}
          </span>
          <b className="text-[max(calc(15*var(--u)),13px)]">Open Details</b>
          <span className="knob h-[max(calc(44*var(--u)),36px)] w-[max(calc(44*var(--u)),36px)]">
            <ChevronRight size={16} aria-hidden />
          </span>
        </motion.button>

        {/* progress dots */}
        {items.length > 1 && (
          <div className="absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 gap-1.5 md:bottom-[calc(20*var(--u))]">
            {items.map((it, i) => (
              <button
                key={it.id}
                onClick={() => setIdx(i)}
                aria-label={`Show featured item ${i + 1}`}
                aria-current={i === idx}
                className={cn(
                  'h-1.5 rounded-full bg-[var(--hero-ink)] transition-all duration-300',
                  i === idx ? 'w-8 opacity-90' : 'w-2.5 opacity-25 hover:opacity-50',
                )}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

/* Small frosted circular control */
function HeroIconBtn({ children, label, onClick }: { children: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <motion.button
      onClick={onClick}
      className="badge-frost flex h-9 w-9 items-center justify-center rounded-full text-[var(--hero-ink)]"
      aria-label={label}
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.94 }}
    >
      {children}
    </motion.button>
  )
}
