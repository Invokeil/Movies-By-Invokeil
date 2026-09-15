'use client'

import { create } from 'zustand'
import type { View, UnifiedMedia } from './types'
import { DEFAULT_PREFS, type Preferences, settingsStore } from './db/stores'
import { syncURL, rememberScroll } from './router'

/* ── Global SPA state: navigation · player · settings ────────────────── */

interface PlayerState {
  media: UnifiedMedia | null
  season?: number
  episode?: number
  position: number
  duration: number
  playing: boolean
  minimized: boolean // mini player mode
}

interface AppState {
  view: View
  backStack: View[]
  navigate: (v: View, replace?: boolean) => void
  back: () => void

  player: PlayerState
  openPlayer: (media: UnifiedMedia, season?: number, episode?: number) => void
  setPlayerEpisode: (season: number, episode: number) => void
  updatePlayer: (patch: Partial<PlayerState>) => void
  closePlayer: () => void
  minimizePlayer: () => void

  prefs: Preferences
  setPrefs: (patch: Partial<Preferences>) => void
  loadPrefs: () => Promise<void>

  libraryVersion: number
  bumpLibrary: () => void

  aiPanelOpen: boolean
  setAiPanel: (open: boolean) => void
}

/* globalThis singleton — guarantees ONE store instance across the module
   graph even if the bundler duplicates this module into multiple chunks.  */
const storeKey = '__invokeil_store__' as const

function createAppStore() {
  return create<AppState>((set, get) => ({
  view: { name: 'home' },
  backStack: [],
  navigate: (v, replace = false) => {
    const { backStack, view } = get()
    set({ view: v, backStack: replace ? backStack : [...backStack, view].slice(-20) })
    if (typeof window !== 'undefined') {
      rememberScroll()
      syncURL(v, replace)
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
    }
  },
  back: () => {
    // real history is the source of truth now — popstate in router.ts syncs
    // the store (incl. scroll restore + player minimize). In-app backStack
    // is only a fallback when there is no browser history to walk.
    if (typeof window !== 'undefined' && history.length > 1) {
      history.back()
      return
    }
    const { backStack, view } = get()
    if (backStack.length === 0) {
      set({ view: { name: 'home' } })
      return
    }
    const prev = backStack[backStack.length - 1]
    set({ view: prev, backStack: backStack.slice(0, -1) })
    // leaving watch → keep player alive in mini mode handled by view logic
    if (view.name === 'watch' && get().player.media) {
      set({ player: { ...get().player, minimized: true } })
    }
  },

  player: { media: null, position: 0, duration: 0, playing: false, minimized: false },
  openPlayer: (media, season, episode) => {
    set({
      player: { media, season, episode, position: 0, duration: 0, playing: true, minimized: false },
      view: { name: 'watch', id: media.id, season, episode },
    })
    if (typeof window !== 'undefined') {
      syncURL({ name: 'watch', id: media.id, season, episode }, false)
    }
  },
  setPlayerEpisode: (season, episode) => {
    const p = get().player
    set({ player: { ...p, season, episode, position: 0 } })
    set({ view: { name: 'watch', id: (p.media as UnifiedMedia).id, season, episode } })
    if (typeof window !== 'undefined') {
      syncURL({ name: 'watch', id: (p.media as UnifiedMedia).id, season, episode }, true)
    }
  },
  updatePlayer: (patch) => set({ player: { ...get().player, ...patch } }),
  closePlayer: () => set({ player: { media: null, position: 0, duration: 0, playing: false, minimized: false } }),
  minimizePlayer: () => set({ player: { ...get().player, minimized: true } }),

  prefs: DEFAULT_PREFS,
  setPrefs: (patch) => {
    const next = { ...get().prefs, ...patch }
    set({ prefs: next })
    settingsStore.save(next)
    applyPrefsToDOM(next)
  },
  loadPrefs: async () => {
    const prefs = await settingsStore.all()
    set({ prefs })
    applyPrefsToDOM(prefs)
  },

  libraryVersion: 0,
  bumpLibrary: () => set((s) => ({ libraryVersion: s.libraryVersion + 1 })),

  aiPanelOpen: false,
  setAiPanel: (open) => set({ aiPanelOpen: open }),
}))
}

type AppStore = ReturnType<typeof createAppStore>
const g = globalThis as unknown as { [storeKey]?: AppStore }
if (!g[storeKey]) {
  g[storeKey] = createAppStore()
}
export const useApp = g[storeKey]

export function applyPrefsToDOM(p: Preferences) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  /* glass intensity is a RELATIVE scale on top of each theme's base alpha
     (0.5 → ×1.0 neutral; 0.25 → ×0.5 subtle; 0.85 → ×1.7 heavy) */
  root.style.setProperty('--glass-scale', String(Math.max(0.2, p.glassIntensity * 2)))
  document.body.classList.toggle('no-anim', !p.animations)
  /* CinemaOS v2: theme + TV mode (the inline boot script handles first
     paint from the localStorage mirror written here) */
  root.classList.toggle('tv-mode', !!p.tvMode)
  try { localStorage.setItem('il:theme', p.theme || 'obsidian') } catch { /* private mode */ }
  void import('./themes').then(({ setTheme }) => setTheme(p.theme || 'obsidian'))
}
