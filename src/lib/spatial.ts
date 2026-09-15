'use client'

/* ── TV spatial navigation (10-foot UI) ───────────────────────────────
   Arrow keys move DOM focus geometrically; Enter/Space activates (the
   browser already does this for buttons/links). Activated only when
   TV Mode is enabled in Settings/Privacy, so desktop keyboard users
   are never surprised by focus jumps.                                  */

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[role="button"]',
].join(',')

function center(el: Element): { x: number; y: number } {
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

function pickCandidate(candidates: Element[], from: DOMRect, dir: 'up' | 'down' | 'left' | 'right'): Element | null {
  const fx = from.left + from.width / 2
  const fy = from.top + from.height / 2
  let best: Element | null = null
  let bestScore = Infinity
  for (const el of candidates) {
    const c = center(el)
    const dx = c.x - fx
    const dy = c.y - fy
    /* must be generally in the pressed direction (with a small
       perpendicular tolerance so rows/columns line up naturally)     */
    if (dir === 'left' && !(dx < -8)) continue
    if (dir === 'right' && !(dx > 8)) continue
    if (dir === 'up' && !(dy < -8)) continue
    if (dir === 'down' && !(dy > 8)) continue
    const primary = Math.abs(dir === 'left' || dir === 'right' ? dx : dy)
    const secondary = Math.abs(dir === 'left' || dir === 'right' ? dy : dx)
    /* crossing the viewport edge wraps: heavily prefer on-screen items */
    const r = el.getBoundingClientRect()
    if (r.bottom < -40 || r.top > innerHeight + 40) continue
    const score = primary + secondary * 2.5
    if (score < bestScore) {
      bestScore = score
      best = el
    }
  }
  return best
}

export function initSpatialNav(): () => void {
  if (typeof window === 'undefined') return () => {}
  const onKey = (e: KeyboardEvent) => {
    if (!document.documentElement.classList.contains('tv-mode')) return
    const dir = ({ ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' } as const)[e.key]
    if (!dir) return
    const target = e.target as HTMLElement | null
    /* don't hijack typing in inputs */
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return

    const all = Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null || el === document.activeElement
    )
    if (all.length === 0) return

    const active = document.activeElement as HTMLElement | null
    let fromRect: DOMRect
    if (active && active !== document.body && all.includes(active)) {
      fromRect = active.getBoundingClientRect()
    } else {
      /* nothing focused yet — focus the most sensible starting point */
      const start =
        dir === 'up' || dir === 'left'
          ? all[all.length - 1]
          : all[0]
      start?.focus()
      e.preventDefault()
      return
    }

    const next = pickCandidate(all, fromRect, dir)
    if (next) {
      ;(next as HTMLElement).focus()
      /* keep the newly focused element comfortably in view */
      const r = (next as HTMLElement).getBoundingClientRect()
      if (r.top < 80 || r.bottom > innerHeight - 80) {
        ;(next as HTMLElement).scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
      e.preventDefault()
    }
  }
  window.addEventListener('keydown', onKey, true)
  return () => window.removeEventListener('keydown', onKey, true)
}

/* ── Global keyboard shortcuts (all devices) ──────────────────────────
   / → focus search · Esc → back · Alt+← → back · d → toggle dark/light */

export function initShortcuts(handlers: {
  openSearch: () => void
  goBack: () => void
}): () => void {
  if (typeof window === 'undefined') return () => {}
  const onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null
    const typing = t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)
    if (e.key === '/' && !typing) {
      e.preventDefault()
      handlers.openSearch()
    } else if (e.key === 'Escape' && !typing) {
      handlers.goBack()
    } else if (e.key === 'ArrowLeft' && e.altKey) {
      handlers.goBack()
    }
  }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}
