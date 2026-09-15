'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { SlidersHorizontal, X } from 'lucide-react'
import type { UnifiedMedia, MediaType } from '@/lib/types'
import { useApp } from '@/lib/store'
import { mediaService } from '@/lib/services/media'
import { ALL_GENRES } from '@/lib/data/catalog'
import { MediaCard, CardSkeleton } from '../media/media-card'
import { Chip, EmptyState, GlassButton, SectionTitle, GlassPanel } from '../ui-custom/glass'
import { cn } from '@/lib/utils'

/* ── Browse (CinemaOS) — URL-synced filters, responsive grid ──────────
   ?genre= lives in the address bar (/movies?genre=Action), so filtered
   views are shareable, re-crawlable and survive refresh.               */

const TITLES: Record<MediaType, { title: string; subtitle: string }> = {
  movie: { title: 'Movies', subtitle: 'Full catalog — filterable by genre and rating' },
  tv: { title: 'TV Shows', subtitle: 'Series with seasons and episode guides' },
  anime: { title: 'Anime', subtitle: 'TMDB + MAL dual-identity titles' },
}

const PAGE = 24

export function BrowseView({ kind, genre: initialGenre }: { kind: MediaType; genre?: string }) {
  const { view } = useApp()
  const [items, setItems] = useState<UnifiedMedia[]>([])
  const [loading, setLoading] = useState(true)
  const [genre, setGenre] = useState<string | null>(initialGenre ?? null)
  const [minRating, setMinRating] = useState(0)
  const [sort, setSort] = useState<'popular' | 'rating' | 'newest'>('popular')
  const [visible, setVisible] = useState(PAGE)
  const sentinel = useRef<HTMLDivElement>(null)

  /* keep state in sync with address bar (back/forward + deep links) */
  useEffect(() => {
    const vGenre = view.name === 'browse' ? view.genre ?? null : null
    setGenre(vGenre)
  }, [view])

  useEffect(() => {
    let alive = true
    const t = setTimeout(async () => {
      setLoading(true)
      const loader = kind === 'movie' ? mediaService.popularMovies() : kind === 'tv' ? mediaService.popularTV() : mediaService.anime()
      loader.then((r) => { if (alive) { setItems(r); setLoading(false); setVisible(PAGE) } })
    }, 0)
    return () => { alive = false; clearTimeout(t) }
  }, [kind])

  /* reflect genre changes into the URL (replaceState — no history spam,
     no scroll jump). Store view is synced so back/forward stays true. */
  const setGenreAndSync = (g: string | null) => {
    setGenre(g)
    if (view.name === 'browse') {
      const url = `/${kind === 'movie' ? 'movies' : kind}${g ? `?genre=${encodeURIComponent(g)}` : ''}`
      history.replaceState({ view: 'browse' }, '', url)
      useApp.setState({ view: { name: 'browse', kind, genre: g ?? undefined } })
    }
  }

  const genres = useMemo(
    () => ALL_GENRES.filter((g) => items.some((m) => m.genres.includes(g))),
    [items]
  )

  const filtered = useMemo(() => {
    let out = items
    if (genre) out = out.filter((m) => m.genres.includes(genre))
    if (minRating > 0) out = out.filter((m) => m.voteAverage >= minRating)
    if (sort === 'rating') out = [...out].sort((a, b) => b.voteAverage - a.voteAverage)
    else if (sort === 'newest') out = [...out].sort((a, b) => b.year - a.year)
    else out = [...out].sort((a, b) => b.popularity - a.popularity)
    return out
  }, [items, genre, minRating, sort])

  /* infinite scroll */
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setVisible((v) => Math.min(v + PAGE, filtered.length))
      },
      { rootMargin: '600px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [filtered.length])

  return (
    <div className="flex flex-col gap-5 pb-6">
      <SectionTitle title={TITLES[kind].title} subtitle={TITLES[kind].subtitle} />

      <GlassPanel variant="subtle" className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-mauve">
            <SlidersHorizontal size={13} /> Genre
          </span>
          <Chip active={!genre} onClick={() => setGenreAndSync(null)}>All</Chip>
          {genres.map((g) => (
            <Chip key={g} active={genre === g} onClick={() => setGenreAndSync(genre === g ? null : g)}>{g}</Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-bold uppercase tracking-wider text-mauve">Rating</span>
          {[0, 7, 7.5, 8, 8.5].map((r) => (
            <Chip key={r} active={minRating === r} onClick={() => setMinRating(r)}>
              {r === 0 ? 'Any' : `${r}+`}
            </Chip>
          ))}
          <span className="mx-1 h-4 w-px bg-white/15" aria-hidden />
          <span className="mr-1 text-xs font-bold uppercase tracking-wider text-mauve">Sort</span>
          {(['popular', 'rating', 'newest'] as const).map((s) => (
            <Chip key={s} active={sort === s} onClick={() => setSort(s)}>
              {s === 'popular' ? 'Popular' : s === 'rating' ? 'Top Rated' : 'Newest'}
            </Chip>
          ))}
          {(genre || minRating > 0) && (
            <button
              onClick={() => { setGenreAndSync(null); setMinRating(0) }}
              className="ml-auto inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold text-mauve transition-colors hover:text-rose"
            >
              <X size={13} /> Clear all
            </button>
          )}
        </div>
      </GlassPanel>

      {loading ? (
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 md:gap-4">
          {Array.from({ length: 18 }).map((_, i) => <CardSkeleton key={i} index={i} />)}
        </div>
      ) : filtered.length > 0 ? (
        <>
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 md:gap-4">
            {filtered.slice(0, visible).map((m, i) => <MediaCard key={m.id} media={m} index={i} />)}
          </div>
          <div ref={sentinel} className="h-1" aria-hidden />
          {visible < filtered.length && (
            <p className="text-center text-xs font-bold text-mauve">
              Showing {visible} of {filtered.length} — scroll for more
            </p>
          )}
        </>
      ) : (
        <EmptyState
          icon={<SlidersHorizontal size={26} />}
          title="No titles match those filters"
          body="Try relaxing the rating threshold or clearing the genre filter."
          action={
            <GlassButton variant="rose" onClick={() => { setGenreAndSync(null); setMinRating(0) }}>
              Clear filters
            </GlassButton>
          }
        />
      )}
    </div>
  )
}
