'use client'

import {
  Home, Film, Tv, Sparkles, BookmarkCheck, Settings,
  Search, Compass, ChevronLeft,
} from 'lucide-react'
import { useApp } from '@/lib/store'
import type { View } from '@/lib/types'
import { cn } from '@/lib/utils'
import { GlassButton } from '../ui-custom/glass'

/* ── Brand logo (customized gradient wordmark) ──────────────────────── */

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
        <img
          src="/logo.svg"
          alt="Movies by InvokeIL"
          width={158}
          height={26}
          className="h-[22px] w-auto max-w-[160px]"
        />
      )}
    </button>
  )
}

/* ── Desktop Sidebar ────────────────────────────────────────────────── */

const NAV: { view: View; icon: React.ElementType; label: string }[] = [
  { view: { name: 'home' }, icon: Home, label: 'Home' },
  { view: { name: 'search' }, icon: Search, label: 'Search' },
  { view: { name: 'browse', kind: 'movie' }, icon: Film, label: 'Movies' },
  { view: { name: 'browse', kind: 'tv' }, icon: Tv, label: 'TV Shows' },
  { view: { name: 'browse', kind: 'anime' }, icon: Sparkles, label: 'Anime' },
  /* Single Library entry (tabs live inside the page) — previously Watchlist
     and History were two nav items pointing at the same page, both
     highlighting together. Mirrors the mobile bottom nav.                */
  { view: { name: 'library', tab: 'watchlist' }, icon: BookmarkCheck, label: 'Library' },
]

export function Sidebar() {
  const { view, navigate, setAiPanel } = useApp()
  return (
    <aside className="sticky top-0 hidden h-screen shrink-0 flex-col gap-1 p-4 md:flex lg:w-60" aria-label="Main navigation">
      <div className="glass flex h-full flex-col rounded-3xl p-4">
        <div className="mb-6 flex flex-col items-center gap-1.5 lg:items-start">
          <Brand />
          <p className="hidden text-[10px] font-semibold uppercase tracking-[0.28em] text-mauve lg:block">Movies</p>
        </div>

        <nav className="flex flex-1 flex-col gap-1.5">
          {NAV.map(({ view: v, icon: Icon, label }) => {
            const active =
              (v.name === 'home' && view.name === 'home') ||
              (v.name === 'search' && view.name === 'search') ||
              (v.name === 'browse' && view.name === 'browse' && v.kind === (view as { kind?: string }).kind) ||
              (v.name === 'library' && view.name === 'library')
            return (
              <button
                key={label}
                onClick={() => navigate(v)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group flex items-center gap-3.5 rounded-2xl px-4 py-3 text-sm font-bold transition-all',
                  active
                    ? 'glass-strong text-ink shadow-md'
                    : 'text-mauve hover:bg-white/40 hover:text-ink'
                )}
              >
                <Icon size={19} className={cn(active && 'text-rose')} strokeWidth={active ? 2.4 : 2} />
                <span className="hidden lg:inline">{label}</span>
                {active && <span className="ml-auto hidden h-1.5 w-1.5 rounded-full bg-rose lg:block" />}
              </button>
            )
          })}

          <div className="my-2 h-px bg-white/60" />

          <button
            onClick={() => setAiPanel(true)}
            className="flex items-center gap-3.5 rounded-2xl px-4 py-3 text-sm font-bold text-mauve transition-all hover:bg-white/40 hover:text-ink"
          >
            <Compass size={19} />
            <span className="hidden lg:inline">AI Discovery</span>
            <span className="ml-auto hidden rounded-full bg-gradient-rose px-2 py-0.5 text-[10px] font-extrabold text-ink lg:inline">NEW</span>
          </button>
        </nav>

        <button
          onClick={() => navigate({ name: 'settings' })}
          className={cn(
            'mt-2 flex items-center gap-3.5 rounded-2xl px-4 py-3 text-sm font-bold transition-all',
            view.name === 'settings' ? 'glass-strong text-ink' : 'text-mauve hover:bg-white/40 hover:text-ink'
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
  { view: { name: 'settings' }, icon: Settings, label: 'Settings' },
]

export function BottomNav() {
  const { view, navigate } = useApp()
  return (
    <nav
      className="fixed inset-x-3 bottom-3 z-40 md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Mobile navigation"
    >
      <div className="glass-strong flex items-center justify-around rounded-3xl px-2 py-2">
        {MOBILE_NAV.map(({ view: v, icon: Icon, label }) => {
          const active =
            (v.name === 'home' && view.name === 'home') ||
            (v.name === 'search' && view.name === 'search') ||
            (v.name === 'library' && view.name === 'library') ||
            (v.name === 'settings' && view.name === 'settings')
          return (
            <button
              key={label}
              onClick={() => navigate(v)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-[44px] min-w-[64px] flex-col items-center justify-center gap-0.5 rounded-2xl px-3 py-1.5 text-[10px] font-bold transition-all',
                active ? 'glass text-ink shadow' : 'text-mauve'
              )}
            >
              <Icon size={19} className={cn(active && 'text-rose')} strokeWidth={active ? 2.4 : 2} />
              {label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

/* ── Top bar (mobile header + back button) ──────────────────────────── */

export function TopBar() {
  const { view, navigate, back, backStack, setAiPanel } = useApp()
  const showBack = backStack.length > 0 && view.name !== 'home'

  return (
    <header className="sticky top-0 z-30 px-3 pt-3 md:hidden">
      <div className="glass flex items-center justify-between rounded-2xl px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          {showBack && (
            <button onClick={back} className="rounded-full p-2 text-ink hover:bg-white/50" aria-label="Go back">
              <ChevronLeft size={20} />
            </button>
          )}
          <Brand />
        </div>
        <div className="flex items-center gap-1">
          <GlassButton
            variant="ghost"
            className="p-2.5"
            ariaLabel="Search"
            onClick={() => navigate({ name: 'search' })}
          >
            <Search size={19} />
          </GlassButton>
          <GlassButton variant="ghost" className="p-2.5" ariaLabel="AI Discovery" onClick={() => setAiPanel(true)}>
            <Compass size={19} className="text-rose" />
          </GlassButton>
        </div>
      </div>
    </header>
  )
}
