'use client'

import { useEffect } from 'react'
import { useApp } from '@/lib/store'
import { initRouter } from '@/lib/router'
import { initSpatialNav, initShortcuts } from '@/lib/spatial'
import { Sidebar, BottomNav, TopBar, DesktopBar } from '@/components/layout/shell'
import { HomeView } from '@/components/views/home-view'
import { SearchView } from '@/components/search/search-view'
import { BrowseView } from '@/components/views/browse-view'
import { DetailView } from '@/components/views/detail-view'
import { WatchView } from '@/components/player/watch-view'
import { LibraryView } from '@/components/library/library-view'
import { PrivacyView } from '@/components/privacy/privacy-view'
import { SettingsView } from '@/components/settings/settings-view'
import { MiniPlayer } from '@/components/player/mini-player'
import { AIPanel } from '@/components/ai/ai-panel'
import { syncShield } from '@/lib/services/shield'

/* ── Movies by InvokeIL — CinemaOS SPA shell ───────────────────────────
   Client-side view routing (single-route deployment, mirrors the React
   Router plan). Views mount/unmount; the player + prefs live in the
   global store so they survive navigation.                              */

function CurrentView() {
  const view = useApp((s) => s.view)
  switch (view.name) {
    case 'home':
      return <HomeView />
    case 'search':
      return <SearchView initialQuery={view.q} />
    case 'browse':
      return <BrowseView kind={view.kind} genre={view.genre} />
    case 'detail':
      return <DetailView id={view.id} />
    case 'watch':
      return <WatchView id={view.id} season={view.season} episode={view.episode} />
    case 'library':
      return <LibraryView tab={view.tab} />
    case 'privacy':
      return <PrivacyView />
    case 'settings':
      return <SettingsView />
    default:
      return <HomeView />
  }
}

export default function Page() {
  const loadPrefs = useApp((s) => s.loadPrefs)
  const prefs = useApp((s) => s.prefs)

  useEffect(() => { loadPrefs() }, [loadPrefs])

  /* URL router: deep links + browser back/forward (see src/lib/router.ts) */
  useEffect(() => { initRouter() }, [])

  /* Ad Shield follows the prefs toggle; runs once on load + on change */
  useEffect(() => {
    void syncShield(prefs.adShield)
  }, [prefs.adShield])

  /* TV mode spatial navigation + global shortcuts */
  useEffect(() => initSpatialNav(), [])
  useEffect(() => initShortcuts({
    openSearch: () => useApp.getState().navigate({ name: 'search' }),
    goBack: () => useApp.getState().back(),
  }), [])

  /* ── Synthetic event shim ──────────────────────────────────────────
     Some dev setups (Turbopack + React 19.2) fail to register React's
     delegated listeners on the document. This capture-phase shim
     dispatches onClick/onKeyDown from the nearest React props manually.
     It stops propagation after dispatching exactly once, so it stays
     correct even in environments where delegation works.               */
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return
    const findProps = (el: Element | null): Record<string, unknown> | null => {
      let node: Element | null = el
      while (node) {
        for (const k of Object.keys(node)) {
          if (k.startsWith('__reactProps$')) {
            return (node as unknown as Record<string, Record<string, unknown>>)[k]
          }
        }
        node = node.parentElement
      }
      return null
    }

    const clickShim = (e: MouseEvent) => {
      const path = e.composedPath() as EventTarget[]
      for (const t of path) {
        if (!(t instanceof Element)) continue
        const props = findProps(t)
        if (props && typeof props.onClick === 'function' && !(t as HTMLButtonElement).disabled) {
          (props.onClick as (ev: MouseEvent) => void)(e)
          e.stopPropagation()
          return
        }
      }
    }
    const keyShim = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return
      const el = e.target as Element
      const props = findProps(el)
      if (!props) return
      if (typeof props.onKeyDown === 'function') {
        (props.onKeyDown as (ev: KeyboardEvent) => void)(e)
      }
      /* native buttons synthesize a click on Enter/Space — replicate that
         here since React's own delegated key handling may be absent */
      const tag = el.tagName
      const isButtonLike =
        tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT' ||
        el.getAttribute('role') === 'button'
      if (isButtonLike && !props.onKeyDown && typeof props.onClick === 'function') {
        e.preventDefault()
        ;(props.onClick as (ev: Event) => void)(e)
      }
    }
    document.addEventListener('click', clickShim, true)
    document.addEventListener('keydown', keyShim, true)
    return () => {
      document.removeEventListener('click', clickShim, true)
      document.removeEventListener('keydown', keyShim, true)
    }
  }, [])

  return (
    <div className="relative min-h-screen">
      {/* ambient background (theme-aware) */}
      <div className="app-bg" aria-hidden>
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <div className="blob blob-3" />
      </div>

      <div className="mx-auto flex max-w-[1600px]">
        <Sidebar />

        <main className="min-w-0 flex-1 px-3 pb-28 md:px-5 md:pb-10 lg:px-8">
          <TopBar />
          <DesktopBar />

          <div className="mt-2 md:mt-4">
            <CurrentView />
          </div>

          <footer className="mt-10 pb-6 text-center text-[11px] font-semibold text-mauve">
            Movies by InvokeIL · Local-first · No account · Data stored in your browser ·
            Uses TMDB API (not endorsed by TMDB) · Auto-fallback player ·{' '}
            <button
              onClick={() => useApp.getState().navigate({ name: 'privacy' })}
              className="text-mint underline-offset-2 hover:underline"
            >
              Privacy Center
            </button>
          </footer>
        </main>
      </div>

      <MiniPlayer />
      <BottomNav />
      <AIPanel />

    </div>
  )
}
