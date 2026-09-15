'use client'

import {
  Home, Film, Tv, Compass, BookmarkCheck, Settings, ShieldCheck,
  Search, ChevronLeft, Popcorn,
} from 'lucide-react'
import { useApp } from '@/lib/store'
import type { View } from '@/lib/types'
import { cn } from '@/lib/utils'

/* ── Brand wordmark ─────────────────────────────────────────────────── */

export function Brand({ compact = false, className }: { compact?: boolean; className?: string }) {
  const { navigate } = useApp()
  return (
    <button
      onClick={() => navigate({ name: 'home' })}
      className={cn('group flex items-center gap-2.5', className)}
      aria-label="Movies by InvokeIL — Home"
    >
      <span className="glass flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl transition-transform group-hover:scale-105">
        <img src="/icon.svg" alt="" width={34} height={34} className="rounded-lg" />
      </span>
      {!compact && (
        <span className="flex flex-col items-start leading-none">
          <span
            className="bg-gradient-rose bg-clip-text text-[17px] font-extrabold tracking-tight text-transparent"
            style={{ WebkitBackgroundClip: 'text', backgroundImage: 'linear-gradient(120deg, var(--rose), var(--accent-2))' }}
          >
            InvokeIL
          </span>
          <span className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.3em] text-mauve">Movies</span>
        </span>
      )}
    </button>
  )
}

/* ── Desktop Sidebar ────────────────────────────────────────────────── */

const NAV: { view: View; icon: React.ElementType; label: string; match: (v: View) => boolean }[] = [
  { view: { name: 'home' }, icon: Home, label: 'Home', match: (v) => v.name === 'home' },
  /* Search intentionally lives ONLY in the desktop utility bar (glass pill
     with the `/` hint) and the mobile bottom nav — a third sidebar entry
     duplicated both. Matches the search VIEW so nothing else changes.   */
  { view: { name: 'browse', kind: 'movie' }, icon: Film, label: 'Movies', match: (v) => v.name === 'browse' && v.kind === 'movie' },
  { view: { name: 'browse', kind: 'tv' }, icon: Tv, label: 'TV Shows', match: (v) => v.name === 'browse' && v.kind === 'tv' },
  { view: { name: 'browse', kind: 'anime' }, icon: Popcorn, label: 'Anime', match: (v) => v.name === 'browse' && v.kind === 'anime' },
  { view: { name: 'library', tab: 'watchlist' }, icon: BookmarkCheck, label: 'Library', match: (v) => v.name === 'library' },
]

export function Sidebar() {
  const { view, navigate, setAiPanel } = useApp()
  return (
    <aside className="sticky top-0 hidden h-screen shrink-0 flex-col gap-1 p-3 md:flex lg:w-60" aria-label="Main navigation">
      <div className="glass flex h-full flex-col rounded-3xl p-3.5">
        <div className="mb-6 flex flex-col items-center gap-1.5 lg:items-start">
          <Brand />
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map(({ view: v, icon: Icon, label, match }) => {
            const active = match(view)
            return (
              <button
                key={label}
                onClick={() => navigate(v)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group relative flex items-center gap-3.5 rounded-2xl px-3.5 py-3 text-sm font-bold transition-all lg:px-4',
                  active
                    ? 'bg-gradient-rose text-white shadow-lg'
                    : 'text-ink-soft hover:bg-white/5 hover:text-ink'
                )}
              >
                <Icon size={19} strokeWidth={active ? 2.4 : 2} />
                <span className="hidden lg:inline">{label}</span>
              </button>
            )
          })}

          <div className="my-2.5 h-px bg-white/8" />

          <button
            onClick={() => setAiPanel(true)}
            className="flex items-center gap-3.5 rounded-2xl px-3.5 py-3 text-sm font-bold text-ink-soft transition-all hover:bg-white/5 hover:text-ink lg:px-4"
          >
            <Compass size={19} />
            <span className="hidden lg:inline">AI Discovery</span>
            <span className="ml-auto hidden rounded-full bg-gradient-rose px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-white lg:inline">AI</span>
          </button>

          <button
            onClick={() => navigate({ name: 'privacy' })}
            aria-current={view.name === 'privacy' ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3.5 rounded-2xl px-3.5 py-3 text-sm font-bold transition-all lg:px-4',
              view.name === 'privacy'
                ? 'bg-gradient-rose text-white shadow-lg'
                : 'text-ink-soft hover:bg-white/5 hover:text-ink'
            )}
          >
            <ShieldCheck size={19} />
            <span className="hidden lg:inline">Privacy</span>
            <span className="ml-auto hidden h-2 w-2 rounded-full bg-mint pulse-dot lg:inline" title="Local-first" />
          </button>
        </nav>

        <button
          onClick={() => navigate({ name: 'settings' })}
          className={cn(
            'mt-2 flex items-center gap-3.5 rounded-2xl px-3.5 py-3 text-sm font-bold transition-all lg:px-4',
            view.name === 'settings' ? 'bg-white/8 text-ink' : 'text-ink-soft hover:bg-white/5 hover:text-ink'
          )}
        >
          <Settings size={19} />
          <span className="hidden lg:inline">Settings</span>
        </button>
      </div>
    </aside>
  )
}

/* ── Mobile Bottom Navigation ───────────────────────────────────────── */

const MOBILE_NAV: { view: View; icon: React.ElementType; label: string }[] = [
  { view: { name: 'home' }, icon: Home, label: 'Home' },
  { view: { name: 'search' }, icon: Search, label: 'Search' },
  { view: { name: 'library', tab: 'watchlist' }, icon: BookmarkCheck, label: 'Library' },
  { view: { name: 'privacy' }, icon: ShieldCheck, label: 'Privacy' },
  { view: { name: 'settings' }, icon: Settings, label: 'Settings' },
]

export function BottomNav() {
  const { view, navigate } = useApp()
  return (
    <nav
      className="fixed inset-x-2 bottom-2 z-40 md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Mobile navigation"
    >
      <div className="glass-strong flex items-center justify-around rounded-3xl px-1.5 py-1.5">
        {MOBILE_NAV.map(({ view: v, icon: Icon, label }) => {
          const active =
            (v.name === 'home' && view.name === 'home') ||
            (v.name === 'search' && view.name === 'search') ||
            (v.name === 'library' && view.name === 'library') ||
            (v.name === 'privacy' && view.name === 'privacy') ||
            (v.name === 'settings' && view.name === 'settings')
          return (
            <button
              key={label}
              onClick={() => navigate(v)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-[46px] min-w-[58px] flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-2 py-1.5 text-[10px] font-bold transition-all',
                active ? 'bg-gradient-rose text-white shadow-md' : 'text-mauve'
              )}
            >
              <Icon size={18} strokeWidth={active ? 2.4 : 2} />
              {label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

/* ── Top bar (mobile header + desktop utility row) ──────────────────── */

export function TopBar() {
  const { view, navigate, back, backStack, setAiPanel } = useApp()
  const showBack = backStack.length > 0 && view.name !== 'home'

  return (
    <header className="sticky top-0 z-30 px-1 pt-3 md:hidden">
      <div className="glass flex items-center justify-between rounded-2xl px-2.5 py-2">
        <div className="flex items-center gap-1">
          {showBack && (
            <button onClick={back} className="rounded-full p-2 text-ink hover:bg-white/10" aria-label="Go back">
              <ChevronLeft size={20} />
            </button>
          )}
          <Brand />
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigate({ name: 'search' })}
            className="rounded-full p-2.5 text-ink-soft transition-colors hover:bg-white/10 hover:text-ink"
            aria-label="Search"
          >
            <Search size={19} />
          </button>
          <button
            onClick={() => setAiPanel(true)}
            className="rounded-full p-2.5 text-ink-soft transition-colors hover:bg-white/10 hover:text-ink"
            aria-label="AI Discovery"
          >
            <Compass size={19} className="text-rose" />
          </button>
        </div>
      </div>
    </header>
  )
}

/* ── Desktop utility bar (search entry + AI + privacy quick glance) ── */

export function DesktopBar() {
  const { view, navigate, back, backStack, setAiPanel } = useApp()
  const showBack = backStack.length > 0 && view.name !== 'home'
  return (
    <header className="sticky top-0 z-30 -mx-2 mb-2 hidden items-center justify-between gap-4 px-2 pt-3 md:flex">
      <div className="flex min-w-0 items-center gap-2">
        {showBack && (
          <button onClick={back} className="glass rounded-full p-2 text-ink hover:brightness-125" aria-label="Go back">
            <ChevronLeft size={18} />
          </button>
        )}
        {/* The real smart-search input lives on the /search page — showing
            this pill there too would be a duplicate entry point. */}
        {view.name !== 'search' && (
          <button
            onClick={() => navigate({ name: 'search' })}
            className="glass glass-hover group flex w-full max-w-md min-w-56 items-center gap-3 rounded-full px-4 py-2.5 text-left text-sm text-mauve"
            aria-label="Search movies and shows"
          >
            <Search size={16} />
            <span className="flex-1 truncate">Search movies, TV, anime…</span>
            <kbd className="hidden rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-bold text-mauve lg:inline">/</kbd>
          </button>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          onClick={() => setAiPanel(true)}
          className="glass glass-hover flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold text-ink"
          aria-label="Open AI Discovery"
        >
          <Compass size={16} className="text-rose" />
          <span className="hidden lg:inline">AI Discovery</span>
        </button>
        <button
          onClick={() => navigate({ name: 'privacy' })}
          className="glass glass-hover flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold text-mint"
          aria-label="Privacy Center"
        >
          <ShieldCheck size={16} />
          <span className="hidden xl:inline">Private</span>
        </button>
      </div>
    </header>
  )
}
