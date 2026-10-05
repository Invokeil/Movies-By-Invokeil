'use client'

import { useEffect, useState, useRef } from 'react'
import {
  Play, Plus, Check, ChevronLeft, ChevronRight, Pause, Sparkles,
  ArrowUpRight, Compass, Star,
} from 'lucide-react'
import { motion } from 'motion/react'
import type { UnifiedMedia } from '@/lib/types'
import { useApp } from '@/lib/store'
import { SmartPoster } from './smart-poster'
import { watchlistStore } from '@/lib/db/stores'
import { formatRuntime, mediaTypeLabel } from '@/lib/services/media'
import { EASE } from '../ui-custom/motion'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

/* ── Porcelain Hero — RIVR-grade glassmorphism showcase ───────────────
   A rounded frosted stage: the featured title's artwork fills the
   panel, white scrims melt it into the #f0f0f0 canvas, and navy ink
   typography carries the frame. Bottom furniture mirrors the RIVR
   reference: a glass stat card (left) and a corner-cutout action
   plate (right). Auto-advances every 9 s, swipeable, keyboard-friendly. */

export function Hero({ items, loading }: { items: UnifiedMedia[]; loading?: boolean }) {
  const { navigate, openPlayer, setAiPanel, bumpLibrary } = useApp()
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
    return <div className="skeleton-shimmer h-[52vh] min-h-96 w-full rounded-[1.5rem] md:h-[600px] md:rounded-[2.5rem]" aria-hidden />
  }

  const toggleList = async () => {
    const added = await watchlistStore.toggle(current)
    setInList(added)
    bumpLibrary()
    toast(added ? 'Added to Watchlist' : 'Removed from Watchlist')
  }

  const nav = (dir: 1 | -1) => setIdx((i) => (i + dir + items.length) % items.length)

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
      <div className="relative h-[560px] overflow-hidden rounded-[1.5rem] bg-white/10 md:h-[620px] md:rounded-[2.5rem] lg:h-[680px]">
        {/* artwork — slow ken-burns drift, crossfade on change */}
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

        {/* porcelain scrims — melt artwork into the canvas (theme-aware) */}
        <div className="absolute inset-0 bg-gradient-to-r from-[rgba(var(--hero-scrim),0.92)] via-[rgba(var(--hero-scrim),0.45)] to-transparent" aria-hidden />
        <div className="absolute inset-0 bg-gradient-to-t from-[rgba(var(--hero-scrim),0.72)] via-transparent to-transparent" aria-hidden />
        <div className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/40" aria-hidden />

        {/* top-right auto-rotate controls (desktop) */}
        {items.length > 1 && (
          <div className="absolute right-4 top-4 z-20 hidden items-center gap-1.5 md:flex">
            <HeroIconBtn label="Previous featured" onClick={() => nav(-1)}><ChevronLeft size={16} /></HeroIconBtn>
            <HeroIconBtn label={paused ? 'Resume auto-rotate' : 'Pause auto-rotate'} onClick={() => setPaused((p) => !p)}>
              {paused ? <Play size={13} /> : <Pause size={13} />}
            </HeroIconBtn>
            <HeroIconBtn label="Next featured" onClick={() => nav(1)}><ChevronRight size={16} /></HeroIconBtn>
          </div>
        )}

        {/* ── content column ── */}
        <div className="relative z-10 flex h-full flex-col items-start px-6 pt-8 sm:px-10 md:px-14 md:pt-12 lg:justify-center lg:pt-0">
          {/* badge */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
            className="badge-frost mx-0 flex items-center gap-2 rounded-full px-4 py-2"
          >
            <Sparkles className="h-4 w-4 text-[var(--hero-ink)]" aria-hidden />
            <span className="text-[13px] font-medium text-[var(--hero-ink)]">
              Featured {mediaTypeLabel(current.mediaType)}
              {current.imdbRating ? ` · IMDb ${current.imdbRating.toFixed(1)}` : ''}
            </span>
          </motion.div>

          {/* title */}
          <motion.h1
            key={current.id + '-t'}
            initial={{ opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.15, ease: EASE }}
            className="display-hero mt-4 max-w-3xl text-4xl sm:text-5xl md:text-6xl lg:text-[72px]"
          >
            {current.title}
          </motion.h1>

          {/* meta line */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm font-medium text-[var(--hero-ink-soft)]"
          >
            {current.voteAverage > 0 && (
              <span className="flex items-center gap-1.5 tabular">
                <Star size={14} className="fill-[#f5c518] text-[#f5c518]" aria-hidden />
                {current.voteAverage.toFixed(1)}
              </span>
            )}
            <span aria-hidden className="opacity-40">|</span>
            <span className="tabular">{current.year || 'Unknown'}</span>
            {current.runtime ? (
              <>
                <span aria-hidden className="opacity-40">|</span>
                <span className="tabular">{formatRuntime(current.runtime)}</span>
              </>
            ) : null}
            {current.genres.length > 0 && (
              <>
                <span aria-hidden className="hidden opacity-40 sm:inline">|</span>
                <span className="hidden sm:inline">{current.genres.slice(0, 3).join(' · ')}</span>
              </>
            )}
          </motion.div>

          {/* overview */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="mt-3 line-clamp-2 hidden max-w-xl text-[15px] font-normal leading-relaxed text-[var(--hero-ink-soft)] opacity-90 md:block"
          >
            {current.overview}
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.5, ease: EASE }}
            className="mt-7 flex flex-wrap items-center gap-3"
          >
            <motion.button
              onClick={() => openPlayer(current, current.mediaType !== 'movie' ? 1 : undefined, 1)}
              className="pill-navy flex items-center rounded-full pl-2 pr-6 py-1.5 md:py-2"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
            >
              <span className="icon-circle m-1 h-9 w-9">
                <Play size={16} className="text-white" fill="currentColor" aria-hidden />
              </span>
              <span className="text-sm font-medium">Watch Now</span>
            </motion.button>
            <motion.button
              onClick={toggleList}
              className="glass flex items-center gap-2 rounded-full px-5 py-3 text-sm font-medium text-ink"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              aria-pressed={inList}
            >
              {inList ? <Check size={16} className="text-rose" aria-hidden /> : <Plus size={16} aria-hidden />}
              {inList ? 'In Watchlist' : 'Watchlist'}
            </motion.button>
          </motion.div>
        </div>

        {/* ── bottom-left glass stat card (RIVR "Active Yielders") ── */}
        <motion.div
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.25, ease: EASE }}
          className="absolute bottom-24 left-4 right-auto md:bottom-8 md:left-8 lg:bottom-12 lg:left-12 hidden rounded-[1.4rem] bg-[rgba(var(--hero-scrim),0.42)] p-4 backdrop-blur-xl sm:flex sm:flex-col sm:gap-2.5 sm:min-w-[170px] lg:rounded-[1.8rem] lg:p-5"
          style={{ border: '1px solid rgba(var(--hero-scrim),0.5)' }}
        >
          <div className="flex flex-col">
            <span className="text-3xl font-medium tracking-tight text-[var(--hero-ink)] tabular">
              {current.voteAverage > 0 ? current.voteAverage.toFixed(1) : 'NR'}
            </span>
            <span className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-[var(--hero-ink-soft)]">
              Viewer Score
            </span>
          </div>
          <motion.button
            onClick={() => navigate({ name: 'detail', id: current.id })}
            className="flex items-center self-start rounded-full bg-[rgba(var(--hero-scrim),0.92)] py-1.5 pl-1.5 pr-4 gap-2 transition-colors"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            aria-label={`More about ${current.title}`}
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[rgba(var(--hero-scrim),0.25)]">
              <ArrowUpRight size={13} className="text-[var(--hero-ink)]" aria-hidden />
            </span>
            <span className="text-[13px] font-medium text-[var(--hero-ink)]">Details</span>
          </motion.button>
        </motion.div>

        {/* ── bottom-right corner-cutout plate (RIVR "Documentation") ── */}
        <motion.button
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.4, ease: EASE }}
          onClick={() => setAiPanel(true)}
          className="absolute bottom-0 right-0 z-10 hidden items-center gap-3 rounded-tl-[1.5rem] bg-[var(--bg)] p-3 pl-8 pt-5 sm:flex sm:gap-4 sm:p-4 sm:pl-10 sm:pt-6 md:gap-5 md:p-6 md:pl-14 md:pt-8 lg:rounded-tl-[2.6rem]"
          whileHover={{ scale: 1.015 }}
          whileTap={{ scale: 0.98 }}
          aria-label="Open AI Discovery — find your next mood"
        >
          {/* corner intersection masks */}
          <span className="pointer-events-none absolute -top-6 right-0 h-6 w-6 md:-top-9 md:h-9 md:w-9" aria-hidden>
            <svg width="100%" height="100%" viewBox="0 0 56 56" fill="none">
              <path d="M56 56V0C56 30.9279 30.9279 56 0 56H56Z" className="cutout-fill" />
            </svg>
          </span>
          <span className="pointer-events-none absolute -left-6 bottom-0 h-6 w-6 md:-left-9 md:h-9 md:w-9" aria-hidden>
            <svg width="100%" height="100%" viewBox="0 0 56 56" fill="none">
              <path d="M56 56H0C30.9279 56 56 30.9279 56 0V56Z" className="cutout-fill" />
            </svg>
          </span>
          <span className="flex h-11 w-11 items-center justify-center rounded-full border border-[rgba(var(--hero-scrim),0.35)] bg-[rgba(var(--hero-scrim),0.1)] md:h-14 md:w-14">
            <Compass size={20} className="text-[var(--hero-ink)]" aria-hidden />
          </span>
          <span className="flex flex-col items-start">
            <span className="text-base font-medium text-[var(--hero-ink)] md:text-lg">AI Discovery</span>
            <span className="flex items-center gap-1 text-[var(--hero-ink-soft)] transition-colors hover:text-[var(--hero-ink)]">
              <span className="text-xs font-medium md:text-sm">Find your mood</span>
              <ChevronRight size={14} aria-hidden />
            </span>
          </span>
        </motion.button>

        {/* progress dots (desktop) */}
        {items.length > 1 && (
          <div className="absolute bottom-6 left-1/2 z-10 hidden -translate-x-1/2 gap-1.5 md:flex">
            {items.map((it, i) => (
              <button
                key={it.id}
                onClick={() => setIdx(i)}
                aria-label={`Show featured item ${i + 1}`}
                aria-current={i === idx}
                className={cn(
                  'h-1.5 rounded-full transition-all duration-300',
                  i === idx ? 'w-8 bg-[var(--hero-ink)]' : 'w-2.5 bg-[var(--hero-ink)]/25 hover:bg-[var(--hero-ink)]/50',
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
