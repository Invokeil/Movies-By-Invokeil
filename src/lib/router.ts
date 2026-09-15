'use client'

import type { View, MediaType } from './types'
import { useApp } from './store'

/* ── URL router for Movies by invokeil ───────────────────────────────
   Every view/interaction is a real URL: tap = pushState, back = popstate,
   deep links work, scroll position is restored per route.
   The store.ts ↔ router.ts circular import is intentional and safe:
   both modules only dereference each other inside runtime function
   bodies, never during module evaluation.                              */

export function viewToURL(v: View): string {
  switch (v.name) {
    case 'home':
      return '/'
    case 'search':
      return v.q ? `/search?q=${encodeURIComponent(v.q)}` : '/search'
    case 'browse': {
      const genre = new URLSearchParams(
        v.name === 'browse' && 'genre' in v && v.genre ? `genre=${encodeURIComponent(v.genre)}` : ''
      ).toString()
      return v.kind === 'movie' ? `/movies${genre ? `?${genre}` : ''}` : `/${v.kind}${genre ? `?${genre}` : ''}`
    }
    case 'detail': {
      const i = v.id.indexOf('-')
      return `/${v.id.slice(0, i)}/${v.id.slice(i + 1)}`
    }
    case 'watch': {
      const i = v.id.indexOf('-')
      const sp = new URLSearchParams()
      if (v.season) sp.set('s', String(v.season))
      if (v.episode) sp.set('e', String(v.episode))
      const q = sp.toString()
      return `/watch/${v.id.slice(0, i)}/${v.id.slice(i + 1)}${q ? `?${q}` : ''}`
    }
    case 'library':
      return `/library/${v.tab ?? 'continue'}`
    case 'privacy':
      return '/privacy'
    case 'settings':
      return '/settings'
    default:
      return '/'
  }
}

export function urlToView(pathname: string, search: string): View {
  const seg = pathname.replace(/\/+$/, '').split('/').filter(Boolean)
  const sp = new URLSearchParams(search)
  if (seg.length === 0) return { name: 'home' }
  switch (seg[0]) {
    case 'home':
      return { name: 'home' }
    case 'search':
      return { name: 'search', q: sp.get('q') ?? '' }
    case 'movies':
      return { name: 'browse', kind: 'movie' as MediaType, genre: sp.get('genre') ?? undefined }
    case 'anime':
      return { name: 'browse', kind: 'anime' as MediaType, genre: sp.get('genre') ?? undefined }
    case 'tv':
      return seg[1] ? { name: 'detail', id: `tv-${seg[1]}` } : { name: 'browse', kind: 'tv' as MediaType, genre: sp.get('genre') ?? undefined }
    case 'movie':
      return seg[1] ? { name: 'detail', id: `movie-${seg[1]}` } : { name: 'browse', kind: 'movie' as MediaType, genre: sp.get('genre') ?? undefined }
    case 'watch':
      return seg[1] && seg[2]
        ? {
            name: 'watch',
            id: `${seg[1]}-${seg[2]}`,
            season: Number(sp.get('s')) || undefined,
            episode: Number(sp.get('e')) || undefined,
          }
        : { name: 'home' }
    case 'library': {
      const tab = (['watchlist', 'favorites', 'history', 'continue'] as const).includes(seg[1] as 'watchlist')
        ? (seg[1] as 'watchlist' | 'favorites' | 'history' | 'continue')
        : 'continue'
      return { name: 'library', tab }
    }
    case 'privacy':
      return { name: 'privacy' }
    case 'settings':
      return { name: 'settings' }
    default:
      return { name: 'home' }
  }
}

/* scroll memory per URL — "scroll is a route too" */
const SCROLL_KEY = 'il:scrollmap'
function loadScrollMap(): Record<string, number> {
  try { return JSON.parse(sessionStorage.getItem(SCROLL_KEY) ?? '{}') } catch { return {} }
}
function saveScrollMap(m: Record<string, number>) {
  try { sessionStorage.setItem(SCROLL_KEY, JSON.stringify(m)) } catch { /* ignore */ }
}
export function rememberScroll() {
  if (typeof window === 'undefined') return
  const m = loadScrollMap()
  m[location.pathname + location.search] = window.scrollY
  saveScrollMap(m)
}
export function restoreScroll() {
  if (typeof window === 'undefined') return
  const saved = loadScrollMap()[location.pathname + location.search]
  requestAnimationFrame(() => window.scrollTo({ top: saved ?? 0, behavior: 'instant' as ScrollBehavior }))
}

/* push/replace the history entry for a view change (called from the store) */
export function syncURL(v: View, replace: boolean) {
  if (typeof window === 'undefined') return
  const url = viewToURL(v)
  if (location.pathname + location.search !== url) {
    history[replace ? 'replaceState' : 'pushState']({ view: v.name }, '', url)
  }
}

/* init: deep-link parse + back/forward buttons */
export function initRouter() {
  if (typeof window === 'undefined') return
  const apply = () => {
    const prev = useApp.getState().view
    const next = urlToView(location.pathname, location.search)
    if (prev.name === 'watch' && next.name !== 'watch' && useApp.getState().player.media) {
      useApp.setState({ player: { ...useApp.getState().player, minimized: true } })
    }
    useApp.setState({ view: next })
    restoreScroll()
  }
  window.addEventListener('popstate', apply)
  // initial deep-link sync (replace so the entry isn't duplicated)
  const initial = urlToView(location.pathname, location.search)
  useApp.setState({ view: initial })
  /* /ai deep link = home + AI Discovery panel open (the route's own
     noindex metadata is injected server-side by the worker)            */
  if (location.pathname === '/ai') useApp.setState({ aiPanelOpen: true })
}
