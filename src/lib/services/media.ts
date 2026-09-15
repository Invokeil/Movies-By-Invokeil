import type { UnifiedMedia, MediaType } from '../types'
import { mediaStore, searchStore } from '../db/stores'
import { API_BASE } from '../api'

/* ── Cache-first media service ────────────────────────────────────────
   Priority: IndexedDB → Worker API (/api/media). Stale data is shown
   instantly and refreshed in the background (stale-while-revalidate).  */

async function fetchList(key: string, params: string): Promise<UnifiedMedia[]> {
  const cached = await mediaStore.getList(key)
  const staleRef = cached // keep a typed reference — TS narrows `cached` to never below
  if (cached && !cached.stale) return cached.items

  if (cached) {
    // stale-while-revalidate
    fetch(`${API_BASE}/api/media?${params}`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((j) => j.results && mediaStore.putList(key, j.results))
      .catch(() => {})
    return cached.items
  }

  try {
    const r = await fetch(`${API_BASE}/api/media?${params}`)
    if (!r.ok) throw new Error(`API ${r.status}`)
    const j = await r.json()
    const items: UnifiedMedia[] = j.results ?? []
    mediaStore.putList(key, items)
    return items
  } catch {
    return staleRef?.items ?? [] // offline fallback: stale cache
  }
}

export const mediaService = {
  async detail(id: string): Promise<UnifiedMedia | null> {
    const cached = await mediaStore.getDetail(id)
    const staleRef = cached // keep a typed reference — TS narrows `cached` to never below
    if (cached && !cached.stale) return cached.media
    if (cached) {
      fetch(`${API_BASE}/api/media?action=detail&id=${encodeURIComponent(id)}`)
        .then((r) => r.json())
        .then((j) => j.result && mediaStore.putDetail(j.result))
        .catch(() => {})
      return cached.media
    }
    try {
      const r = await fetch(`${API_BASE}/api/media?action=detail&id=${encodeURIComponent(id)}`)
      const j = await r.json()
      if (!j.result) return null
      await mediaStore.putDetail(j.result)
      return j.result as UnifiedMedia
    } catch {
      return staleRef?.media ?? null // offline fallback: stale data
    }
  },

  trending: () => fetchList('trending', 'list=trending'),
  popularMovies: () => fetchList('popular-movies', 'list=popular-movies'),
  popularTV: () => fetchList('popular-tv', 'list=popular-tv'),
  anime: () => fetchList('anime', 'list=anime'),
  topRated: () => fetchList('top-rated', 'list=top-rated'),
  newReleases: () => fetchList('new-releases', 'list=new-releases'),
  byGenre: (genre: string) => fetchList(`genre:${genre}`, `list=genre&genre=${encodeURIComponent(genre)}`),
  similar: (id: string) => fetchList(`similar:${id}`, `action=similar&id=${encodeURIComponent(id)}`),

  async search(q: string, type?: 'movie' | 'tv' | 'anime'): Promise<UnifiedMedia[]> {
    const key = `${type ? `${type}:` : ''}${q.trim().toLowerCase()}`
    if (!q.trim()) return []
    const local = await mediaStore.searchCache(key)
    if (local) return local
    try {
      const tp = type ? `&type=${encodeURIComponent(type)}` : ''
      const r = await fetch(`${API_BASE}/api/media?action=search&q=${encodeURIComponent(q)}${tp}`)
      const j = await r.json()
      const items: UnifiedMedia[] = j.results ?? []
      mediaStore.putSearch(key, items)
      return items
    } catch {
      return []
    }
  },

  async mood(moods: string[]): Promise<UnifiedMedia[]> {
    return fetchList(`mood:${moods.sort().join(',')}`, `action=mood&moods=${encodeURIComponent(moods.join(','))}`)
  },

  async suggestions(q: string): Promise<string[]> {
    /* local-first suggestions: recent searches + cached titles */
    const recent = await searchStore.recent()
    const lower = q.toLowerCase()
    return recent.filter((s) => s.includes(lower)).slice(0, 4)
  },

  async logWatch(m: UnifiedMedia, season?: number, episode?: number) {
    const { historyStore } = await import('../db/stores')
    await historyStore.add({
      mediaId: m.id,
      tmdbId: m.tmdbId,
      mediaType: m.mediaType,
      title: m.title,
      season,
      episode,
      watchedAt: Date.now(),
      completed: false,
    })
  },

  async saveProgress(m: UnifiedMedia, position: number, duration: number, season?: number, episode?: number) {
    const { progressStore } = await import('../db/stores')
    await progressStore.save({
      mediaId: m.id,
      tmdbId: m.tmdbId,
      mediaType: m.mediaType,
      title: m.title,
      season,
      episode,
      position: Math.floor(position),
      duration: Math.max(Math.floor(duration), 1),
      updatedAt: Date.now(),
    })
  },
}

export function formatRuntime(min?: number): string {
  if (!min) return '—'
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export function mediaTypeLabel(t: MediaType): string {
  return { movie: 'Movie', tv: 'TV Series', anime: 'Anime' }[t]
}
