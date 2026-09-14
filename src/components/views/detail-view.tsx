'use client'

import { useEffect, useState, useMemo } from 'react'
import { Play, Plus, Check, Heart, ChevronLeft, Clock, Calendar, Globe, Award, Star, ChevronDown } from 'lucide-react'
import type { UnifiedMedia } from '@/lib/types'
import { useApp } from '@/lib/store'
import { mediaService, formatRuntime, mediaTypeLabel } from '@/lib/services/media'
import { watchlistStore, favoritesStore, progressStore } from '@/lib/db/stores'
import { SmartPoster, SmartAvatar } from '../media/smart-poster'
import { GlassPanel, GlassButton, Chip, RatingBadge, EmptyState } from '../ui-custom/glass'
import { MediaRow } from '../media/media-row'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

export function DetailView({ id }: { id: string }) {
  const { navigate, back, openPlayer, bumpLibrary } = useApp()
  const [media, setMedia] = useState<UnifiedMedia | null>(null)
  const [similar, setSimilar] = useState<UnifiedMedia[]>([])
  const [loading, setLoading] = useState(true)
  const [inList, setInList] = useState(false)
  const [fav, setFav] = useState(false)
  const [season, setSeason] = useState(1)
  const [progress, setProgress] = useState<{ season?: number; episode?: number; pct: number } | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    ;(async () => {
      const m = await mediaService.detail(id)
      if (!alive) return
      setMedia(m)
      setLoading(false)
      if (m) {
        const sim = await mediaService.similar(m.id)
        if (alive) setSimilar(sim)
        const p = await progressStore.get(m.id, undefined, undefined)
        if (p) {
          const all = await import('@/lib/db/stores').then(({ progressStore }) => progressStore.all())
          const mine = all.filter((x) => x.mediaId === m.id).sort((a, b) => b.updatedAt - a.updatedAt)[0]
          if (mine) setProgress({ season: mine.season, episode: mine.episode, pct: Math.round((mine.position / Math.max(mine.duration, 1)) * 100) })
        }
      }
    })()
    return () => { alive = false }
  }, [id])

  useEffect(() => {
    if (!media) return
    let alive = true
    Promise.all([watchlistStore.has(media.id), favoritesStore.has(media.id)]).then(([w, f]) => {
      if (!alive) return
      setInList(!!w)
      setFav(!!f)
    })
    return () => { alive = false }
  }, [media])

  const episodes = useMemo(() => {
    if (!media?.seasons?.length) return []
    const s = media.seasons.find((x) => x.season === season)
    return Array.from({ length: s?.episodes ?? 0 }, (_, i) => i + 1)
  }, [media, season])

  if (loading) {
    return (
      <div className="flex flex-col gap-6 pb-6">
        <div className="skeleton-shimmer h-72 w-full rounded-3xl" />
        <div className="skeleton-shimmer h-6 w-1/3 rounded-full" />
        <div className="skeleton-shimmer h-32 w-full rounded-3xl" />
      </div>
    )
  }

  if (!media) {
    return (
      <EmptyState
        icon={<ChevronLeft size={26} />}
        title="Title not found"
        body="It may have been removed from the catalog, or the cache entry expired."
        action={<GlassButton variant="rose" onClick={() => navigate({ name: 'home' })}>Back to Home</GlassButton>}
      />
    )
  }

  const toggleList = async () => {
    const added = await watchlistStore.toggle(media)
    setInList(added)
    bumpLibrary()
    toast(added ? 'Added to Watchlist' : 'Removed from Watchlist')
  }
  const toggleFav = async () => {
    const added = await favoritesStore.toggle(media)
    setFav(added)
    bumpLibrary()
    if (added) toast('Loved — your taste profile just got sharper')
  }

  const resume = () => {
    if (progress) openPlayer(media, progress.season, progress.episode)
    else openPlayer(media, media.mediaType !== 'movie' ? 1 : undefined, 1)
  }

  const startEpisode = (ep: number) => openPlayer(media, season, ep)

  return (
    <div className="flex flex-col gap-6 pb-6">
      {/* Backdrop header */}
      <div className="anim-fade glass relative min-h-[340px] overflow-hidden rounded-3xl md:min-h-[420px]">
        <SmartPoster media={media} variant="backdrop" size="w1280" className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-0 bg-gradient-to-r from-white/60 via-white/25 to-transparent md:via-white/12" />
        <div className="absolute inset-0 bg-gradient-to-t from-white/50 via-transparent to-transparent" />

        <button
          onClick={back}
          className="glass-strong absolute left-4 top-4 z-20 rounded-full p-2.5 text-ink transition-transform hover:scale-105"
          aria-label="Go back"
        >
          <ChevronLeft size={19} />
        </button>

        <div className="relative z-10 flex h-full items-end gap-5 p-5 md:items-center md:gap-8 md:p-10">
          <div className="glass-strong hidden w-44 shrink-0 overflow-hidden rounded-2xl shadow-2xl md:block lg:w-52">
            <SmartPoster media={media} className="aspect-[2/3] w-full" />
          </div>

          <div className="flex flex-col gap-3 pb-2 md:pb-0">
            <div className="flex flex-wrap items-center gap-2">
              <Chip active>{mediaTypeLabel(media.mediaType)}</Chip>
              {media.rated && <Chip>{media.rated}</Chip>}
              {media.awards && (
                <Chip className="!bg-white/60"><Award size={11} className="mr-1 inline" />{media.awards}</Chip>
              )}
            </div>
            <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-ink drop-shadow-sm md:text-5xl">
              {media.title}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm font-semibold text-ink/80">
              <RatingBadge rating={media.voteAverage} />
              {media.imdbRating && <span className="glass rounded-full px-2.5 py-0.5 text-xs font-bold">IMDb {media.imdbRating}</span>}
              {media.metascore && <span className="glass rounded-full px-2.5 py-0.5 text-xs font-bold">Metascore {media.metascore}</span>}
              <span className="flex items-center gap-1"><Calendar size={13} className="text-mauve" />{media.year || 'Unknown'}</span>
              {media.runtime && <span className="flex items-center gap-1"><Clock size={13} className="text-mauve" />{formatRuntime(media.runtime)}</span>}
              <span className="flex items-center gap-1"><Globe size={13} className="text-mauve" />{media.originalLanguage.toUpperCase()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3">
        <GlassButton variant="rose" className="!px-7 !py-3 !text-sm" onClick={resume}>
          <Play size={17} fill="currentColor" />
          {progress ? `Resume ${progress.season ? `S${progress.season}E${progress.episode} ` : ''}· ${progress.pct}%` : 'Watch Now'}
        </GlassButton>
        <GlassButton onClick={toggleList}>
          {inList ? <Check size={16} /> : <Plus size={16} />}
          {inList ? 'In Watchlist' : 'Watchlist'}
        </GlassButton>
        <GlassButton onClick={toggleFav} ariaLabel="Toggle favorite">
          <Heart size={16} fill={fav ? 'currentColor' : 'none'} className={cn(fav && 'text-rose')} />
          {fav ? 'Loved' : 'Love'}
        </GlassButton>
      </div>

      {/* Overview + metadata grid */}
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <GlassPanel className="p-6">
          {media.tagline && (
            <p className="mb-2 text-sm font-bold uppercase tracking-[0.2em] text-rose">“{media.tagline}”</p>
          )}
          <h2 className="mb-2 text-lg font-bold text-ink">Overview</h2>
          <p className="text-[15px] leading-relaxed text-ink/80">{media.overview}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {media.genres.map((g) => <Chip key={g}>{g}</Chip>)}
          </div>

          {media.cast.length > 0 && (
            <>
              <h3 className="mb-3 mt-6 text-sm font-bold uppercase tracking-wider text-mauve">Top Cast</h3>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {media.cast.map((c) => (
                  <div key={c.name} className="flex items-center gap-3 rounded-2xl bg-white/40 p-2.5">
                    <SmartAvatar name={c.name} profilePath={c.profilePath} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-ink">{c.name}</p>
                      <p className="truncate text-xs text-mauve">{c.character}</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </GlassPanel>

        <GlassPanel className="p-6">
          <h2 className="mb-3 text-lg font-bold text-ink">Ratings & Info</h2>
          <dl className="flex flex-col gap-3 text-sm">
            <InfoRow label="Director / Creator" value={media.director ?? '—'} />
            <InfoRow label="TMDB Score" value={media.voteAverage > 0 ? `${media.voteAverage.toFixed(1)} (${media.voteCount.toLocaleString()} votes)` : 'Unknown'} />
            {media.imdbRating && <InfoRow label="IMDb" value={`${media.imdbRating} / 10`} icon={<Star size={13} className="text-rose" />} />}
            {media.metascore && <InfoRow label="Metascore" value={String(media.metascore)} />}
            {media.boxOffice && <InfoRow label="Box Office" value={media.boxOffice} />}
            <InfoRow label="Release Date" value={media.releaseDate || 'Unknown'} />
            <InfoRow label="Primary ID" value={`TMDB ${media.tmdbId}${media.malId ? ` · MAL ${media.malId}` : ''}`} />
          </dl>
          <div className="glass-subtle mt-4 rounded-xl p-3 text-[11px] leading-relaxed text-mauve">
            Metadata merged from TMDB (primary identity) + OMDb (secondary enrichment), normalized into a unified model and cached in IndexedDB.
          </div>
        </GlassPanel>
      </div>

      {/* Seasons & Episodes (TV / Anime) */}
      {media.seasons && media.seasons.length > 0 && (
        <GlassPanel className="p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-ink">Seasons & Episodes</h2>
            <div className="flex items-center gap-2">
              {media.seasons.map((s) => (
                <Chip key={s.season} active={season === s.season} onClick={() => setSeason(s.season)}>
                  Season {s.season}
                </Chip>
              ))}
            </div>
          </div>
          <div className="scrollbar-thin max-h-96 overflow-y-auto pr-1">
            <div className="flex flex-col gap-2">
              {episodes.map((ep) => {
                const isResume = progress?.season === season && progress?.episode === ep
                return (
                  <button
                    key={ep}
                    onClick={() => startEpisode(ep)}
                    className={cn(
                      'group flex items-center gap-4 rounded-2xl p-3 text-left transition-all hover:bg-white/60',
                      isResume ? 'bg-rose/20' : 'bg-white/35'
                    )}
                  >
                    <span className="glass flex h-11 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl text-sm font-extrabold text-ink">
                      E{String(ep).padStart(2, '0')}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-ink">
                        {media.title} · Episode {ep}
                        {isResume && <span className="ml-2 rounded-full bg-rose px-2 py-0.5 text-[10px] font-extrabold text-ink">RESUME {progress!.pct}%</span>}
                      </p>
                      <p className="text-xs text-mauve">
                        S{season} E{ep} · ~{media.episodeRuntime ?? 45} min · VidLink provider
                      </p>
                    </div>
                    <span className="glass rounded-full p-2 text-ink opacity-0 transition-opacity group-hover:opacity-100">
                      <Play size={14} fill="currentColor" />
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </GlassPanel>
      )}

      {/* Similar */}
      {similar.length > 0 && (
        <MediaRow title="More Like This" subtitle="Genre + language + era similarity scoring" items={similar} />
      )}
    </div>
  )
}

function InfoRow({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/50 pb-2.5 last:border-0">
      <dt className="flex items-center gap-1.5 font-semibold text-mauve">{icon}{label}</dt>
      <dd className="truncate text-right font-bold text-ink">{value}</dd>
    </div>
  )
}
