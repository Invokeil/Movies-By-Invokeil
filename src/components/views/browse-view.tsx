'use client'

import { useEffect, useState, useMemo } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import type { UnifiedMedia, MediaType } from '@/lib/types'
import { mediaService } from '@/lib/services/media'
import { ALL_GENRES } from '@/lib/data/catalog'
import { MediaCard, CardSkeleton } from '../media/media-card'
import { Chip, EmptyState, GlassButton, SectionTitle, GlassPanel } from '../ui-custom/glass'
import { cn } from '@/lib/utils'

const TITLES: Record<MediaType, { title: string; subtitle: string }> = {
  movie: { title: 'Movies', subtitle: 'Full catalog — filterable by genre and rating' },
  tv: { title: 'TV Shows', subtitle: 'Series with seasons and episode guides' },
  anime: { title: 'Anime', subtitle: 'TMDB + MAL dual-identity titles' },
}

export function BrowseView({ kind }: { kind: MediaType }) {
  const [items, setItems] = useState<UnifiedMedia[]>([])
  const [loading, setLoading] = useState(true)
  const [genre, setGenre] = useState<string | null>(null)
  const [minRating, setMinRating] = useState(0)
  const [sort, setSort] = useState<'popular' | 'rating' | 'newest'>('popular')

  useEffect(() => {
    let alive = true
    const t = setTimeout(async () => {
      setLoading(true)
      const loader = kind === 'movie' ? mediaService.popularMovies() : kind === 'tv' ? mediaService.popularTV() : mediaService.anime()
      loader.then((r) => { if (alive) { setItems(r); setLoading(false) } })
    }, 0)
    return () => { alive = false; clearTimeout(t) }
  }, [kind])

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

  return (
    <div className="flex flex-col gap-5 pb-6">
      <SectionTitle title={TITLES[kind].title} subtitle={TITLES[kind].subtitle} />

      <GlassPanel variant="subtle" className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-mauve">
            <SlidersHorizontal size={13} /> Genre
          </span>
          <Chip active={!genre} onClick={() => setGenre(null)}>All</Chip>
          {genres.map((g) => (
            <Chip key={g} active={genre === g} onClick={() => setGenre(genre === g ? null : g)}>{g}</Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-bold uppercase tracking-wider text-mauve">Rating</span>
          {[0, 7, 7.5, 8, 8.5].map((r) => (
            <Chip key={r} active={minRating === r} onClick={() => setMinRating(r)}>
              {r === 0 ? 'Any' : `${r}+`}
            </Chip>
          ))}
          <span className="mx-1 h-4 w-px bg-white/70" />
          <span className="mr-1 text-xs font-bold uppercase tracking-wider text-mauve">Sort</span>
          {(['popular', 'rating', 'newest'] as const).map((s) => (
            <Chip key={s} active={sort === s} onClick={() => setSort(s)}>
              {s === 'popular' ? 'Popular' : s === 'rating' ? 'Top Rated' : 'Newest'}
            </Chip>
          ))}
        </div>
      </GlassPanel>

      {loading ? (
        <div className="flex flex-wrap gap-4">
          {Array.from({ length: 10 }).map((_, i) => <CardSkeleton key={i} index={i} />)}
        </div>
      ) : filtered.length > 0 ? (
        <div className="flex flex-wrap gap-4">
          {filtered.map((m, i) => <MediaCard key={m.id} media={m} index={i} />)}
        </div>
      ) : (
        <EmptyState
          icon={<SlidersHorizontal size={26} />}
          title="No titles match those filters"
          body="Try relaxing the rating threshold or clearing the genre filter."
          action={<GlassButton variant="rose" onClick={() => { setGenre(null); setMinRating(0) }}>Clear filters</GlassButton>}
        />
      )}
    </div>
  )
}
