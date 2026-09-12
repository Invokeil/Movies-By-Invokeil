'use client'

import { useMemo } from 'react'
import type { UnifiedMedia } from '@/lib/types'
import { cn } from '@/lib/utils'

/* ── Procedural Poster / Backdrop Art ─────────────────────────────────
   Deterministic pastel "concept poster" generated per media id.
   Keeps the whole UI cohesive with the InvokeIL palette.               */

const THEMES: [string, string, string][] = [
  ['#FFE5D9', '#FFCAD4', '#F4ACB7'],
  ['#D8E2DC', '#C4D8CF', '#9D8189'],
  ['#FFCAD4', '#FFE5D9', '#F4ACB7'],
  ['#F4ACB7', '#FFCAD4', '#FFE5D9'],
  ['#D8E2DC', '#FFE5D9', '#F4ACB7'],
  ['#FFE5D9', '#D8E2DC', '#9D8189'],
  ['#FFCAD4', '#D8E2DC', '#F4ACB7'],
  ['#F4ACB7', '#D8E2DC', '#FFCAD4'],
]

function hashStr(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

interface ArtProps {
  media: UnifiedMedia
  variant?: 'poster' | 'backdrop'
  className?: string
}

export function PosterArt({ media, variant = 'poster', className }: ArtProps) {
  const h = useMemo(() => hashStr(media.id), [media.id])
  const [c1, c2, c3] = THEMES[h % THEMES.length]
  const variantIdx = h % 4
  const letter = media.title.replace(/^(The|A|An)\s+/i, '').charAt(0).toUpperCase()
  const angle = 100 + (h % 80)

  return (
    <div
      aria-hidden
      className={cn('relative overflow-hidden select-none', className)}
      style={{ background: `linear-gradient(${angle}deg, ${c1} 0%, ${c2} 55%, ${c3} 130%)` }}
    >
      {/* decorative blobs */}
      <div
        className="absolute -right-[18%] -top-[22%] h-[55%] w-[55%] rounded-full opacity-60 blur-2xl"
        style={{ background: c3 }}
      />
      <div
        className="absolute -bottom-[24%] -left-[18%] h-[50%] w-[50%] rounded-full opacity-45 blur-2xl"
        style={{ background: c1 === '#D8E2DC' ? '#FFE5D9' : '#D8E2DC' }}
      />
      {variantIdx >= 2 && (
        <div
          className="absolute right-[8%] top-[14%] h-[34%] w-[34%] rounded-full border-[3px] opacity-30"
          style={{ borderColor: '#44353B' }}
        />
      )}
      {variantIdx >= 1 && (
        <div
          className="absolute left-[10%] top-[30%] h-[18%] w-[45%] rounded-full opacity-25 blur-md"
          style={{ background: '#ffffff' }}
        />
      )}

      {/* giant letter watermark */}
      <span
        className={cn(
          'absolute font-extrabold leading-none tracking-tighter',
          variant === 'poster' ? 'left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2 text-[9rem]' : 'left-[4%] top-1/2 -translate-y-1/2 text-[16rem]'
        )}
        style={{ color: '#44353B', opacity: 0.12 }}
      >
        {letter}
      </span>

      {/* title block — poster variant only (backdrop is decorative art) */}
      {variant === 'poster' && (
        <div className="absolute inset-x-0 bottom-0 p-4">
          <div className="mb-1.5 h-1 w-8 rounded-full" style={{ background: '#44353B', opacity: 0.5 }} />
          <h3 className="text-xl font-extrabold leading-tight tracking-tight" style={{ color: '#44353B' }}>
            {media.title}
          </h3>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: '#44353B', opacity: 0.65 }}>
            {media.year} · {media.genres[0]}
          </p>
        </div>
      )}

      {/* subtle glass sheen */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/25 via-transparent to-black/[0.06]" />
    </div>
  )
}

/* Skeleton placeholder for cards loading */
export function PosterSkeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton-shimmer rounded-2xl', className)} aria-hidden />
}
