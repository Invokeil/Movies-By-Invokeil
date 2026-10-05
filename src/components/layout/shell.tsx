'use client'

import {
  Home, Film, Tv, BookmarkCheck, Settings, ShieldCheck,
  Search, ChevronLeft, Compass, Sparkles,
} from 'lucide-react'
import { motion } from 'motion/react'
import { useApp } from '@/lib/store'
import type { View } from '@/lib/types'
import { cn } from '@/lib/utils'

/* ── Glasshouse shell — ConSentinel glass capsule nav ─────────────────
   One floating frosted capsule across the top (brand · centered menu ·
   ink CTA with knob), a slim phone header, and a floating glass dock.
   Geometry scales with the design-unit system (--u / --t).             */

export function Brand({ compact = false, className }: { compact?: boolean; className?: string }) {
  const { navigate } = useApp()
  return (
    <button
      onClick={() => navigate({ name: 'home' })}
      className={cn('group flex items-center', className)}
      aria-label="Movies by InvokeIL — Home"
    >
      <span className="glass flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full transition-transform duration-300 group-hover:scale-105">
        <img src="/icon.svg" alt="" width={34} height={34} className="rounded-full" />
      </span>
      {!compact && (
        <span className="ml-2.5 hidden flex-col items-start leading-none sm:flex">
          <span className="text-[18px] font-[520] tracking-[-0.03em] text-ink">
            Invoke<span className="text-rose">IL</span>
          </span>
          <span className="mt-1 text-[8.5px] font-[470] uppercase tracking-[0.32em] text-mauve">Movies</span>
        </span>
      )}
    </button>
  )
}

/* ── Center menu (desktop) — icon · links · hairline divider ────────── */

const NAV: { view: View; label: string; match: (v: View) => boolean }[] = [
  { view: { name: 'home' }, label: 'Home', match: (v) => v.name === 'home' },
  { view: { name: 'browse', kind: 'movie' }, label: 'Movies', match: (v) => v.name === 'browse' && v.kind === 'movie' },
  { view: { name: 'browse', kind: 'tv' }, label: 'TV Shows', match: (v) => v.name === 'browse' && v.kind === 'tv' },
  { view: { name: 'browse', kind: 'anime' }, label: 'Anime', match: (v) => v.name === 'browse' && v.kind === 'anime' },
  { view: { name: 'library', tab: 'watchlist' }, label: 'Library', match: (v) => v.name === 'library' },
]

function CenterMenu() {
  const { view, navigate } = useApp()
  return (
    <ul className="hidden items-center lg:flex" role="list">
      <li>
        <button
          onClick={() => navigate({ name: 'home' })}
          aria-label="Home"
          aria-current={view.name === 'home' ? 'page' : undefined}
          className={cn(
            'relative flex h-9 w-9 items-center justify-center rounded-full transition-colors',
            view.name === 'home' ? 'text-ink' : 'text-mauve hover:text-ink',
          )}
        >
          {view.name === 'home' && (
            <motion.span
              layoutId="nav-pill"
              className="absolute inset-0 rounded-full bg-[rgba(var(--navy,15,27,49),0.08)]"
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              aria-hidden
            />
          )}
          <Home size={17} strokeWidth={1.9} className="relative" aria-hidden />
        </button>
      </li>
      {NAV.slice(1).map(({ view: v, label, match }) => {
        const active = match(view)
        return (
          <li key={label}>
            <button
              onClick={() => navigate(v)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative cursor-pointer rounded-full px-3.5 py-2 text-[14.5px] font-[470] tracking-[-0.02em] transition-colors',
                active ? 'text-ink' : 'text-mauve hover:text-ink',
              )}
            >
              {active && (
                <motion.span
                  layoutId="nav-pill"
                  className="absolute inset-0 rounded-full bg-[rgba(var(--navy,15,27,49),0.08)]"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  aria-hidden
                />
              )}
              <span className="relative">{label}</span>
            </button>
          </li>
        )
      })}
      <li aria-hidden className="mx-1.5 h-6 w-px shrink-0 bg-[rgba(var(--navy,15,27,49),0.12)]" />
      <li>
        <button
          onClick={() => navigate({ name: 'settings' })}
          aria-label="Settings"
          aria-current={view.name === 'settings' ? 'page' : undefined}
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-full transition-colors',
            view.name === 'settings' ? 'text-ink' : 'text-mauve hover:text-ink',
          )}
        >
          <Settings size={17} strokeWidth={1.9} aria-hidden />
        </button>
      </li>
    </ul>
  )
}

/* ── Top navigation (desktop capsule + mobile header in one) ────────── */

export function NavBar() {
  const { view, navigate, back, backStack, setAiPanel } = useApp()
  const showBack = backStack.length > 0 && view.name !== 'home'

  return (
    <header className="sticky top-0 z-40 px-3 pt-3 md:px-5 md:pt-4">
      <div
        className="glass-capsule mx-auto flex max-w-[1600px] items-center justify-between gap-2 py-2 pl-2.5 pr-2 md:gap-3 md:py-2 md:pl-3 md:pr-2.5"
        role="banner"
      >
        {/* left — back + brand */}
        <div className="flex min-w-0 items-center gap-1">
          {showBack && (
            <motion.button
              onClick={back}
              className="rounded-full p-2 text-ink transition-colors hover:bg-[rgba(var(--navy,15,27,49),0.07)]"
              aria-label="Go back"
              whileTap={{ scale: 0.92 }}
            >
              <ChevronLeft size={20} />
            </motion.button>
          )}
          <Brand />
        </div>

        {/* center — capsule menu (desktop) */}
        <CenterMenu />

        {/* right — search + ink CTA with knob */}
        <div className="flex shrink-0 items-center gap-2">
          <motion.button
            onClick={() => navigate({ name: 'search' })}
            className="glass glass-hover hidden min-w-48 items-center gap-2.5 rounded-full px-4 py-2.5 text-left text-sm text-mauve sm:flex"
            aria-label="Search movies and shows"
            whileTap={{ scale: 0.98 }}
          >
            <Search size={16} strokeWidth={1.9} />
            <span className="flex-1 truncate">Search movies, TV, anime…</span>
            <kbd className="hidden rounded-md border border-[rgba(var(--navy,15,27,49),0.14)] bg-white/50 px-1.5 py-0.5 text-[10px] font-semibold text-mauve lg:inline">/</kbd>
          </motion.button>
          <motion.button
            onClick={() => navigate({ name: 'search' })}
            className="glass flex items-center justify-center rounded-full p-2.5 text-ink sm:hidden"
            aria-label="Search"
            whileTap={{ scale: 0.92 }}
          >
            <Search size={18} />
          </motion.button>
          <motion.button
            onClick={() => setAiPanel(true)}
            className="cta-ink group hidden items-center gap-2.5 py-1.5 pl-5 pr-1.5 sm:flex"
            aria-label="Open AI Discovery"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
          >
            <span className="text-[13.5px] font-[470] tracking-[-0.01em]">AI Discovery</span>
            <span className="knob h-8 w-8">
              <Sparkles size={14} aria-hidden />
            </span>
          </motion.button>
          <motion.button
            onClick={() => setAiPanel(true)}
            className="cta-ink flex items-center justify-center p-1 sm:hidden"
            aria-label="Open AI Discovery"
            whileTap={{ scale: 0.92 }}
          >
            <span className="knob h-8 w-8">
              <Sparkles size={14} aria-hidden />
            </span>
          </motion.button>
          <button
            onClick={() => navigate({ name: 'privacy' })}
            className="hidden h-10 w-10 items-center justify-center rounded-full text-mint transition-colors hover:bg-[rgba(var(--navy,15,27,49),0.06)] xl:flex"
            aria-label="Privacy Center"
            title="Local-first · Privacy Center"
          >
            <ShieldCheck size={19} strokeWidth={1.9} />
          </button>
        </div>
      </div>
    </header>
  )
}

/* Legacy aliases — page.tsx and any other callers keep working */
export function TopBar() { return <NavBar /> }
export function DesktopBar() { return null }
export function Sidebar() { return null }

/* ── Mobile bottom dock ─────────────────────────────────────────────── */

const MOBILE_NAV: { view: View; icon: React.ElementType; label: string }[] = [
  { view: { name: 'home' }, icon: Home, label: 'Home' },
  { view: { name: 'browse', kind: 'movie' }, icon: Film, label: 'Movies' },
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
      <div className="glass-strong flex items-center justify-around rounded-full px-2 py-2">
        {MOBILE_NAV.map(({ view: v, icon: Icon, label }) => {
          const active =
            (v.name === 'home' && view.name === 'home') ||
            (v.name === 'search' && view.name === 'search') ||
            (v.name === 'library' && view.name === 'library') ||
            (v.name === 'browse' && view.name === 'browse' && v.kind === 'movie') ||
            (v.name === 'settings' && view.name === 'settings')
          return (
            <motion.button
              key={label}
              onClick={() => navigate(v)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex min-h-[50px] min-w-[56px] flex-1 flex-col items-center justify-center gap-1 rounded-full px-2 text-[10px] font-[470] tracking-[-0.01em] transition-colors',
                active ? 'text-ink' : 'text-mauve',
              )}
              whileTap={{ scale: 0.92 }}
            >
              {active && (
                <motion.span
                  layoutId="dock-pill"
                  className="absolute inset-0 rounded-full bg-[rgba(var(--navy,15,27,49),0.09)]"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  aria-hidden
                />
              )}
              <Icon size={19} strokeWidth={active ? 2.2 : 1.8} className="relative" aria-hidden />
              <span className="relative">{label}</span>
            </motion.button>
          )
        })}
      </div>
    </nav>
  )
}

/* AI Discovery floating entry for tablet/desktop quick access */
export function AICompassFab() {
  const { setAiPanel } = useApp()
  return (
    <motion.button
      onClick={() => setAiPanel(true)}
      className="meet-pill fixed bottom-24 right-4 z-30 hidden h-12 w-12 items-center justify-center md:flex lg:bottom-6"
      aria-label="Open AI Discovery"
      title="AI Discovery"
      whileHover={{ scale: 1.06, rotate: 8 }}
      whileTap={{ scale: 0.94 }}
    >
      <Compass size={20} className="text-rose" aria-hidden />
    </motion.button>
  )
}
