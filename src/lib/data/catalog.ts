import type { UnifiedMedia } from '../types'
import { MOVIES } from './catalog-movies'
import { TV_SHOWS, ANIME } from './catalog-tv'

/* ── "D1 metadata database" equivalent — the global catalog ─────────── */

export const CATALOG: UnifiedMedia[] = [...MOVIES, ...TV_SHOWS, ...ANIME]

export const ALL_GENRES: string[] = Array.from(
  new Set(CATALOG.flatMap((m) => m.genres))
).sort()

export const byId = (id: string): UnifiedMedia | undefined =>
  CATALOG.find((m) => m.id === id)

export const FEATURED_IDS = [
  'movie-693134', // Dune: Part Two
  'anime-209867', // Frieren
  'movie-545611', // EEAAO
  'tv-95396',     // Severance
  'movie-157336', // Interstellar
]

/* Deterministic trending / popular rankings (popularity + recent bias) */
export function trending(): UnifiedMedia[] {
  return [...CATALOG]
    .sort((a, b) => b.popularity * (b.year >= 2022 ? 1.35 : 1) - a.popularity * (a.year >= 2022 ? 1.35 : 1))
    .slice(0, 14)
}

export function popularMovies(): UnifiedMedia[] {
  return MOVIES.slice().sort((a, b) => b.popularity - a.popularity).slice(0, 14)
}

export function popularTV(): UnifiedMedia[] {
  return TV_SHOWS.slice().sort((a, b) => b.popularity - a.popularity).slice(0, 14)
}

export function topRated(): UnifiedMedia[] {
  return [...CATALOG].sort((a, b) => b.voteAverage - a.voteAverage).slice(0, 14)
}

export function newReleases(): UnifiedMedia[] {
  return [...CATALOG].sort((a, b) => b.year - a.year).slice(0, 14)
}

export function byGenre(genre: string): UnifiedMedia[] {
  return CATALOG.filter((m) => m.genres.includes(genre)).sort((a, b) => b.popularity - a.popularity)
}

export function similar(id: string): UnifiedMedia[] {
  const base = byId(id)
  if (!base) return []
  return CATALOG.filter((m) => m.id !== id)
    .map((m) => ({
      m,
      score:
        m.genres.filter((g) => base.genres.includes(g)).length * 3 +
        (m.originalLanguage === base.originalLanguage ? 2 : 0) +
        (m.mediaType === base.mediaType ? 1 : 0) -
        Math.abs(m.year - base.year) / 20,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((x) => x.m)
}

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'with', 'in', 'on', 'for', 'to', 'movie', 'show', 'film', 'series'])

export function search(q: string): UnifiedMedia[] {
  const needle = q.trim().toLowerCase()
  if (!needle) return []
  const tokens = needle.split(/\s+/).filter((t) => !STOP.has(t))
  const scored = CATALOG.map((m) => {
    const hay = `${m.title} ${m.originalTitle ?? ''} ${m.overview} ${m.genres.join(' ')} ${m.cast.map((c) => c.name).join(' ')} ${m.director ?? ''} ${m.year}`.toLowerCase()
    let score = 0
    if (m.title.toLowerCase() === needle) score += 100
    if (m.title.toLowerCase().startsWith(needle)) score += 50
    if (m.title.toLowerCase().includes(needle)) score += 25
    for (const t of tokens) {
      if (m.title.toLowerCase().includes(t)) score += 10
      if (hay.includes(t)) score += 3
    }
    return { m, score }
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.m.popularity - a.m.popularity)
    .slice(0, 24)
  return scored.map((x) => x.m)
}

export function moodPool(moods: string[]): UnifiedMedia[] {
  const moodGenreMap: Record<string, string[]> = {
    cozy: ['Family', 'Animation', 'Romance', 'Comedy'],
    'mind-bending': ['Sci-Fi', 'Mystery', 'Thriller'],
    'feel-good': ['Comedy', 'Romance', 'Family', 'Music'],
    dark: ['Crime', 'Thriller', 'Horror'],
    romantic: ['Romance', 'Drama'],
    thrilling: ['Thriller', 'Action', 'Crime'],
    epic: ['Adventure', 'Fantasy', 'History'],
    animated: ['Animation'],
    dramatic: ['Drama', 'History'],
    weird: ['Fantasy', 'Comedy', 'Sci-Fi'],
  }
  const wanted = new Set(moods.flatMap((m) => moodGenreMap[m] ?? []))
  if (wanted.size === 0) return trending()
  return CATALOG.filter((m) => m.genres.some((g) => wanted.has(g)))
    .sort((a, b) => b.voteAverage - a.voteAverage)
    .slice(0, 18)
}
