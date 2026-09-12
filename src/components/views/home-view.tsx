'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { UnifiedMedia } from '@/lib/types'
import { mediaService } from '@/lib/services/media'
import { explainRecommendation } from '@/lib/services/recommend'
import { ALL_GENRES, FEATURED_IDS } from '@/lib/data/catalog'
import {
  historyStore, progressStore, favoritesStore, watchlistStore, buildTasteProfile,
} from '@/lib/db/stores'
import { Hero } from '../media/hero'
import { MediaRow } from '../media/media-row'
import { ContinueRow } from '../media/continue-row'
import { Chip } from '../ui-custom/glass'
import { useApp } from '@/lib/store'

/* ── Behavior-driven Home ─────────────────────────────────────────────
   Nothing on this page is a fixed default: every personalized row is
   derived from THIS device's watch history / progress / library via the
   local taste profile, hydrated through the edge-cached media service.
   A brand-new profile (no history, no likes) simply sees only the
   generic rows below.                                                  */

/* Watched-title genres can carry names the Worker's genre resolver
   doesn't know — map them onto the Worker's resolvable set. */
const GENRE_ALIASES: Record<string, string> = {
  'Science Fiction': 'Sci-Fi',
  'War & Politics': 'War',
  'TV Movie': 'Family',
  'Action & Adventure': 'Adventure',
}

interface PersonalRow {
  id: string
  title: string
  subtitle?: string
  items: UnifiedMedia[]
  loading: boolean // phase 1: skeleton until the media service answers
}

interface RowSlot {
  id: string
  title: string
  subtitle?: string
  load: () => Promise<UnifiedMedia[]>
}

export function HomeView() {
  const { navigate, libraryVersion } = useApp()
  const [featured, setFeatured] = useState<UnifiedMedia[]>([])
  const [trending, setTrending] = useState<UnifiedMedia[]>([])
  const [popMovies, setPopMovies] = useState<UnifiedMedia[]>([])
  const [popTV, setPopTV] = useState<UnifiedMedia[]>([])
  const [anime, setAnime] = useState<UnifiedMedia[]>([])
  const [top, setTop] = useState<UnifiedMedia[]>([])
  const [newest, setNewest] = useState<UnifiedMedia[]>([])
  const [personalRows, setPersonalRows] = useState<PersonalRow[]>([])
  const [loading, setLoading] = useState(true)
  const [whyText, setWhyText] = useState<string | null>(null)
  const runRef = useRef(0)

  /* Phase 1 (instant, IndexedDB-only): history + progress + library +
     taste profile → decide WHICH personalized rows exist.
     Phase 2 (edge-cached fetches): hydrate each row's items. Generic
     rows below never wait on this. */
  const loadPersonal = useCallback(async () => {
    const run = ++runRef.current
    const [history, progress, favorites, watchlist, profile] = await Promise.all([
      historyStore.all(),
      progressStore.all(),
      favoritesStore.all(),
      watchlistStore.all(),
      buildTasteProfile(),
    ])
    if (run !== runRef.current) return

    const continueIds = new Set(progress.map((p) => p.mediaId))
    const watchedIds = new Set(history.map((h) => h.mediaId))
    const libraryIds = new Set([...favorites, ...watchlist].map((m) => m.id))

    const topGenres = Object.entries(profile.genreWeights)
      .sort((a, b) => b[1] - a[1])
      .map(([g]) => g)
      .slice(0, 2)

    const slots: RowSlot[] = []

    /* "Because you watched {last watched title}" */
    const last = history[0]
    if (last) {
      slots.push({
        id: 'because',
        title: `Because you watched ${last.title}`,
        subtitle: 'Similar titles, picked from your watch history — computed on this device',
        load: async () => {
          const similar = await mediaService.similar(last.mediaId)
          return similar.filter(
            (m) => m.id !== last.mediaId && !watchedIds.has(m.id) && !continueIds.has(m.id)
          )
        },
      })
    }

    /* "More {genre}" rows from the strongest signals in the taste profile */
    for (const g of topGenres) {
      slots.push({
        id: `genre:${g}`,
        title: `More ${g}`,
        subtitle: `You keep coming back to ${g.toLowerCase()}`,
        load: () => mediaService.byGenre(GENRE_ALIASES[g] ?? g),
      })
    }

    /* "Picked for You" — round-robin merge of similar-of up-to-3 recent
       watches + top-genre lists; deduped, minus already-watched /
       in-progress / in-library items, capped at 20. */
    if (history.length > 0 || topGenres.length > 0) {
      const seeds = history.slice(0, 3)
      const genreQueries = topGenres.map((g) => GENRE_ALIASES[g] ?? g)
      slots.push({
        id: 'picks',
        title: 'Picked for You',
        subtitle: 'Blended from your recent watches, likes and top genres — local, never uploaded',
        load: async () => {
          const pools = await Promise.all([
            ...seeds.map((h) => mediaService.similar(h.mediaId).catch(() => [] as UnifiedMedia[])),
            ...genreQueries.map((q) => mediaService.byGenre(q).catch(() => [] as UnifiedMedia[])),
          ])
          const taken = new Set<string>([...watchedIds, ...continueIds, ...libraryIds])
          const out: UnifiedMedia[] = []
          const depth = Math.max(0, ...pools.map((p) => p.length))
          for (let i = 0; i < depth && out.length < 20; i++) {
            for (const pool of pools) {
              if (out.length >= 20) break
              const m = pool[i]
              if (!m || taken.has(m.id)) continue
              taken.add(m.id)
              out.push(m)
            }
          }
          return out
        },
      })
    }

    /* Render the row plan immediately: known rows keep their previous
       items across library bumps (no flicker), new slots show skeletons. */
    setPersonalRows((prev) =>
      slots.map((s) => {
        const existing = prev.find((r) => r.id === s.id)
        return existing && !existing.loading
          ? { ...existing, title: s.title, subtitle: s.subtitle }
          : { id: s.id, title: s.title, subtitle: s.subtitle, items: [], loading: true }
      })
    )

    await Promise.all(
      slots.map(async (s) => {
        const items = await s.load().catch(() => [] as UnifiedMedia[])
        if (run !== runRef.current) return
        setPersonalRows((prev) => prev.map((r) => (r.id === s.id ? { ...r, items, loading: false } : r)))
      })
    )
  }, [])

  useEffect(() => {
    let alive = true
    const t = setTimeout(async () => {
      const [tr, pm, ptv, an, trate, nr] = await Promise.all([
        mediaService.trending(),
        mediaService.popularMovies(),
        mediaService.popularTV(),
        mediaService.anime(),
        mediaService.topRated(),
        mediaService.newReleases(),
      ])
      if (!alive) return
      const picked: UnifiedMedia[] = []
      for (const id of FEATURED_IDS) {
        const found = tr.find((m) => m.id === id)
        if (found && !picked.some((p) => p.id === found.id)) picked.push(found)
      }
      for (const m of tr) {
        if (picked.length >= 5) break
        if (!picked.some((p) => p.id === m.id)) picked.push(m)
      }
      setFeatured(picked.slice(0, 5))
      setTrending(tr)
      setPopMovies(pm)
      setPopTV(ptv)
      setAnime(an)
      setTop(trate)
      setNewest(nr)
      setLoading(false)
      loadPersonal()
    }, 0)
    return () => { alive = false; clearTimeout(t) }
  }, [loadPersonal])

  /* re-run personalization whenever the library bumps (watch / like / save) */
  useEffect(() => {
    if (loading) return
    const t = setTimeout(loadPersonal, 0)
    return () => clearTimeout(t)
  }, [libraryVersion, loadPersonal, loading])

  const showWhy = async (m: UnifiedMedia) => {
    setWhyText(await explainRecommendation(m))
  }

  return (
    <div className="flex flex-col gap-8 pb-6">
      <Hero items={featured} loading={loading} />

      <ContinueRow />

      {/* Behavior-driven rows — exist only when this profile has signal.
          A row whose fetch returns nothing simply disappears. */}
      {personalRows.map((row) =>
        row.loading ? (
          <MediaRow key={row.id} title={row.title} subtitle={row.subtitle} loading />
        ) : row.items.length > 0 ? (
          <MediaRow
            key={row.id}
            title={row.title}
            subtitle={row.subtitle}
            items={row.items}
            onWhy={
              row.id === 'picks' && row.items[0]
                ? () => { void showWhy(row.items[0]) }
                : undefined
            }
            action={
              row.id === 'picks' && whyText ? (
                <Popover open onOpenChange={(o) => !o && setWhyText(null)}>
                  <PopoverTrigger asChild>
                    <span />
                  </PopoverTrigger>
                  <PopoverContent className="w-72 text-sm" side="top">
                    <p className="font-bold text-ink">Why this row?</p>
                    <p className="mt-1 text-mauve">{whyText}</p>
                  </PopoverContent>
                </Popover>
              ) : undefined
            }
          />
        ) : null
      )}

      {/* Generic rows — the fallback (and the only rows for empty profiles);
          once personalized rows exist they sit BELOW them. */}
      <MediaRow
        title="Trending Now"
        subtitle="What everyone is watching this week"
        items={trending}
        loading={loading}
      />
      <MediaRow title="Popular Movies" items={popMovies} loading={loading} />
      <MediaRow title="Popular TV Series" items={popTV} loading={loading} />

      <section>
        <h2 className="mb-3 text-xl font-bold tracking-tight text-ink">Browse by Genre</h2>
        <div className="flex flex-wrap gap-2">
          {ALL_GENRES.slice(0, 14).map((g) => (
            <Chip key={g} onClick={() => navigate({ name: 'browse', kind: 'movie' })}>
              {g}
            </Chip>
          ))}
        </div>
      </section>

      <MediaRow title="Anime Spotlight" items={anime} loading={loading} />
      <MediaRow title="New Releases" items={newest} loading={loading} />
      <MediaRow title="Top Rated of All Time" items={top} loading={loading} />
    </div>
  )
}
