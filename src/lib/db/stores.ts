import { idb, type StoreName } from './idb'
import type {
  UnifiedMedia, WatchProgress, HistoryEntry, RecentSearch,
  CacheEnvelope, TasteProfile, UnifiedMedia as Media,
} from '../types'

/* ── Typed stores over the raw IDB wrapper ──────────────────────────── */

const TTL = {
  detail: 7 * 24 * 3600_000,     // movie details — 7 days
  list: 30 * 60_000,             // lists — 30 min
  search: 24 * 3600_000,         // search cache — 24 h
  ai: 6 * 3600_000,              // AI cache — 6 h
}

function envelope<T>(data: T, ttl: number, source: string): CacheEnvelope<T> {
  const now = Date.now()
  return { data, cachedAt: now, expiresAt: now + ttl, source, version: 1 }
}

function fresh<T>(env: CacheEnvelope<T> | null | undefined): T | null {
  if (!env) return null
  return env // caller checks expiresAt (stale-while-revalidate allowed)
}

/* ── Media cache ─────────────────────────────────────────────────────── */

export const mediaStore = {
  async getDetail(id: string): Promise<{ media: UnifiedMedia; stale: boolean } | null> {
    const env = fresh<UnifiedMedia>(await idb.get<CacheEnvelope<UnifiedMedia>>('media', `detail:${id}`))
    if (!env) return null
    return { media: env.data, stale: Date.now() > env.expiresAt }
  },

  putDetail(m: UnifiedMedia, source = 'api') {
    return idb.put('media', `detail:${m.id}`, envelope(m, TTL.detail, source))
  },

  async getList(key: string): Promise<{ items: UnifiedMedia[]; stale: boolean } | null> {
    const env = fresh<UnifiedMedia[]>(await idb.get<CacheEnvelope<UnifiedMedia[]>>('media', `list:${key}`))
    if (!env) return null
    return { items: env.data, stale: Date.now() > env.expiresAt }
  },

  putList(key: string, items: UnifiedMedia[], source = 'api') {
    return idb.put('media', `list:${key}`, envelope(items, TTL.list, source))
  },

  async searchCache(q: string): Promise<UnifiedMedia[] | null> {
    const env = fresh<UnifiedMedia[]>(await idb.get<CacheEnvelope<UnifiedMedia[]>>('media', `search:${q.toLowerCase()}`))
    return env ? env.data : null
  },

  putSearch(q: string, items: UnifiedMedia[]) {
    if (items.length === 0) return Promise.resolve()
    return idb.put('media', `search:${q.toLowerCase()}`, envelope(items, TTL.search, 'api'))
  },

  async stats() {
    const all = await idb.all<CacheEnvelope<unknown>>('media')
    return { entries: all?.length ?? 0 }
  },

  clear() { return idb.clear('media') },
}

/* ── History ─────────────────────────────────────────────────────────── */

export const historyStore = {
  async all(): Promise<HistoryEntry[]> {
    const rows = await idb.all<HistoryEntry>('history')
    if (!rows) return []
    return rows.map((r) => r.value).sort((a, b) => b.watchedAt - a.watchedAt)
  },
  add(entry: HistoryEntry) {
    return idb.put('history', `${entry.mediaId}:${entry.season ?? 0}:${entry.episode ?? 0}`, entry)
  },
  clear() { return idb.clear('history') },
}

/* ── Progress (continue watching) ────────────────────────────────────── */

export const progressStore = {
  async all(): Promise<WatchProgress[]> {
    const rows = await idb.all<WatchProgress>('progress')
    if (!rows) return []
    return rows.map((r) => r.value).sort((a, b) => b.updatedAt - a.updatedAt)
  },
  get(mediaId: string, season?: number, episode?: number) {
    return idb.get<WatchProgress>('progress', ProgressKey(mediaId, season, episode))
  },
  save(p: WatchProgress) {
    return idb.put('progress', ProgressKey(p.mediaId, p.season, p.episode), p)
  },
  remove(mediaId: string, season?: number, episode?: number) {
    return idb.delete('progress', ProgressKey(mediaId, season, episode))
  },
  clear() { return idb.clear('progress') },
}

export function ProgressKey(mediaId: string, season?: number, episode?: number) {
  return `${mediaId}:${season ?? 0}:${episode ?? 0}`
}

/* ── Favorites / Watchlist ───────────────────────────────────────────── */

function collectionStore(name: StoreName) {
  return {
    async all(): Promise<UnifiedMedia[]> {
      const rows = await idb.all<Media>(name)
      if (!rows) return []
      return rows.map((r) => r.value).sort((a, b) => b.year - a.year)
    },
    has(id: string) { return idb.get(name, id) },
    add(m: UnifiedMedia) { return idb.put(name, m.id, m) },
    remove(id: string) { return idb.delete(name, id) },
    toggle: async (m: UnifiedMedia): Promise<boolean> => {
      const existing = await idb.get(name, m.id)
      if (existing) { await idb.delete(name, m.id); return false }
      await idb.put(name, m.id, m)
      return true
    },
    clear() { return idb.clear(name) },
  }
}

export const favoritesStore = collectionStore('favorites')
export const watchlistStore = collectionStore('watchlist')

/* ── Recent searches ─────────────────────────────────────────────────── */

export const searchStore = {
  async recent(): Promise<string[]> {
    const rows = await idb.all<RecentSearch>('searches')
    if (!rows) return []
    return rows
      .map((r) => r.value)
      .sort((a, b) => b.at - a.at)
      .slice(0, 8)
      .map((r) => r.q)
  },
  add(q: string) {
    if (!q.trim()) return Promise.resolve()
    return idb.put('searches', q.toLowerCase(), { q, at: Date.now() })
  },
  remove(q: string) { return idb.delete('searches', q.toLowerCase()) },
  clear() { return idb.clear('searches') },
}

/* ── AI cache + recommendations ──────────────────────────────────────── */

export const aiStore = {
  async get(key: string): Promise<unknown | null> {
    const env = fresh<unknown>(await idb.get<CacheEnvelope<unknown>>('aiCache', key))
    if (!env) return null
    if (Date.now() > env.expiresAt) return null
    return env.data
  },
  put(key: string, data: unknown) {
    return idb.put('aiCache', key, envelope(data, TTL.ai, 'ai'))
  },
  clear() { return idb.clear('aiCache') },
}

export const recommendationStore = {
  cache(key: string, items: UnifiedMedia[]) {
    return idb.put('recommendations', key, envelope(items, 2 * 3600_000, 'local+ai'))
  },
  async get(key: string): Promise<UnifiedMedia[] | null> {
    const env = fresh<UnifiedMedia[]>(await idb.get<CacheEnvelope<UnifiedMedia[]>>('recommendations', key))
    if (!env || Date.now() > env.expiresAt) return null
    return env.data
  },
}

/* ── Settings / preferences ──────────────────────────────────────────── */

export interface AdShieldPrefs {
  enabled: boolean
  customRules: string[]    // user-authored lines (uBlock-style: ||domain^ and ##selector)
  blockedCount: number     // lifetime count of blocked requests (approximate)
}

export interface Preferences {
  glassIntensity: number   // 0.25 – 0.85 (kept for compat; drives glass alpha)
  animations: boolean
  autoplayNext: boolean
  enableAI: boolean
  personalization: boolean
  /* CinemaOS v2 */
  theme: string            // theme id (see lib/themes.ts)
  tvMode: boolean          // 10-foot UI + spatial navigation (TVs / remotes)
  privateSession: boolean  // don't persist history / progress while on
  secureDNS: boolean       // use Cloudflare DoH for connectivity checks + prefetch
  adShield: AdShieldPrefs  // built-in request blocker (uBlock-style rules)
}

export const DEFAULT_PREFS: Preferences = {
  glassIntensity: 0.5,
  animations: true,
  autoplayNext: true,
  enableAI: true,
  personalization: true,
  theme: 'obsidian',
  tvMode: false,
  privateSession: false,
  secureDNS: false,
  adShield: { enabled: false, customRules: [], blockedCount: 0 },
}

export const settingsStore = {
  async all(): Promise<Preferences> {
    const saved = await idb.get<Partial<Preferences>>('settings', 'prefs')
    return {
      ...DEFAULT_PREFS,
      ...(saved ?? {}),
      adShield: { ...DEFAULT_PREFS.adShield, ...(saved?.adShield ?? {}) },
    }
  },
  save(p: Preferences) {
    return idb.put('settings', 'prefs', p)
  },
}

/* ── Taste profile (derived locally, never leaves device raw) ───────── */

export async function buildTasteProfile(): Promise<TasteProfile> {
  const [history, favorites, watchlist] = await Promise.all([
    historyStore.all(),
    favoritesStore.all(),
    watchlistStore.all(),
  ])

  const profile: TasteProfile = {
    genreWeights: {},
    decadeCounts: {},
    languageWeights: {},
    peopleWeights: {},
    avgRating: 0,
    totalWatched: history.length,
    totalLiked: favorites.length,
  }

  const bump = (obj: Record<string, number>, k: string, by = 1) => {
    obj[k] = (obj[k] ?? 0) + by
  }

  let ratingSum = 0
  const sources: [UnifiedMedia, number][] = [
    ...favorites.map((m) => [m, 3] as [UnifiedMedia, number]),
    ...watchlist.map((m) => [m, 1.5] as [UnifiedMedia, number]),
  ]

  for (const h of history.slice(0, 60)) {
    if (h.completed) ratingSum += 1
  }

  // hydrate full media info for history entries via detail cache
  for (const h of history.slice(0, 40)) {
    const detail = await mediaStore.getDetail(h.mediaId)
    if (detail) sources.push([detail.media, h.completed ? 2 : 1])
  }

  for (const [m, w] of sources) {
    for (const g of m.genres) bump(profile.genreWeights, g, w)
    bump(profile.decadeCounts, `${Math.floor(m.year / 10) * 10}s`, w)
    bump(profile.languageWeights, m.originalLanguage, w)
    if (m.director) bump(profile.peopleWeights, m.director, w)
    for (const c of m.cast.slice(0, 2)) bump(profile.peopleWeights, c.name, w / 2)
    ratingSum += m.voteAverage * w
  }

  const totalW = sources.reduce((s, [, w]) => s + w, 0)
  profile.avgRating = totalW > 0 ? Math.round((ratingSum / totalW) * 10) / 10 : 7.0

  return profile
}
