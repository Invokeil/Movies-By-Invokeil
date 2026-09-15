'use client'

import { useRef, useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { SectionTitle } from '../ui-custom/glass'
import { MediaCard, CardSkeleton } from './media-card'
import type { UnifiedMedia } from '@/lib/types'

/* ── CinemaOS row — snap scroller w/ desktop arrows ─────────────────── */

export function MediaRow({
  title, subtitle, items = [], loading, onWhy, action, href,
}: {
  title: string
  subtitle?: string
  items?: UnifiedMedia[]
  loading?: boolean
  onWhy?: () => void
  action?: React.ReactNode
  href?: string
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(true)

  const updateArrows = () => {
    const el = scroller.current
    if (!el) return
    setCanLeft(el.scrollLeft > 12)
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 12)
  }

  useEffect(() => {
    updateArrows()
    const el = scroller.current
    if (!el) return
    el.addEventListener('scroll', updateArrows, { passive: true })
    window.addEventListener('resize', updateArrows)
    return () => {
      el.removeEventListener('scroll', updateArrows)
      window.removeEventListener('resize', updateArrows)
    }
  }, [items.length])

  const scroll = (dir: 1 | -1) => {
    scroller.current?.scrollBy({ left: dir * scroller.current.clientWidth * 0.85, behavior: 'smooth' })
  }

  return (
    <section className="relative">
      <SectionTitle
        title={title}
        subtitle={subtitle}
        onWhy={onWhy}
        action={
          <div className="flex items-center gap-2">
            {action}
            <div className="hidden gap-1.5 md:flex">
              <button
                onClick={() => scroll(-1)}
                disabled={!canLeft}
                className="glass rounded-full p-2 text-ink transition-all hover:brightness-125 disabled:opacity-30"
                aria-label={`Scroll ${title} left`}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => scroll(1)}
                disabled={!canRight}
                className="glass rounded-full p-2 text-ink transition-all hover:brightness-125 disabled:opacity-30"
                aria-label={`Scroll ${title} right`}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        }
      />
      <div
        ref={scroller}
        className="row-scroll no-scrollbar -mx-1 grid auto-cols-[9.5rem] grid-flow-col gap-3.5 overflow-x-auto px-1 pb-2 pt-1 sm:auto-cols-[10.5rem] md:auto-cols-[11.5rem] md:gap-4 lg:auto-cols-[12.5rem]"
      >
        {loading
          ? Array.from({ length: 8 }).map((_, i) => <CardSkeleton key={i} index={i} />)
          : items.map((m, i) => <MediaCard key={m.id} media={m} index={i} />)}
      </div>
    </section>
  )
}
