'use client'

import { useMemo } from 'react'
import type { UnifiedMedia } from '@/lib/types'
import { cn } from '@/lib/utils'

/* ── Procedural Poster / Backdrop Art (CinemaOS) ──────────────────────
   Deterministic dark "concept poster" generated per media id.
   Deep cinema gradients with the active theme's accent — keeps every
   fallback card cohesive with whatever theme the user has chosen.      */

const DARK_THEMES: [string, string, string][] = [
  ['#181824', '#241a2e', '#3b1d33'],  // plum dusk
  ['#12141f', '#1a1f33', '#232b4a'],  // deep slate  (subtle, not blue-forward)
  ['#1a1220', '#2a1830', '#40203a'],  // amethyst
  ['#151a16', '#1e2a20', '#2c3d2e'],  // forest
  ['#1d1610', '#2d2013', '#453017'],  // amber leather
  ['#141418', '#202028', '#30303c'],  // charcoal
  ['#1f1216', '#331c24', '#4c2733'],  // wine
  ['#101c1a', '#17302c', '#20453f'],  // teal noir
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
  const [c1, c2, c3] = DARK_THEMES[h % DARK_THEMES.length]
  const variantIdx = h % 4
  const letter = media.title.replace(/^(The|A|An)\s+/i, '').charAt(0).toUpperCase()
  const angle = 100 + (h % 80)

  return (
    <div
      aria-hidden
      className={cn('relative overflow-hidden select-none', className)}
      style={{ background: `linear-gradient(${angle}deg, ${c1} 0%, ${c2} 55%, ${c3} 130%)` }}
    >
      {/* decorative blobs — glow in the theme accent */}
      <div
        className="absolute -right-[18%] -top-[22%] h-[55%] w-[55%] rounded-full opacity-35 blur-2xl"
        style={{ background: 'var(--rose)' }}
      />
      <div
        className="absolute -bottom-[24%] -left-[18%] h-[50%] w-[50%] rounded-full opacity-20 blur-2xl"
        style={{ background: 'var(--accent-2)' }}
      />
      {variantIdx >= 2 && (
        <div
          className="absolute right-[8%] top-[14%] h-[34%] w-[34%] rounded-full border-2 opacity-25"
          style={{ borderColor: 'var(--rose)' }}
        />
      )}
      {variantIdx >= 1 && (
        <div
          className="absolute left-[10%] top-[30%] h-[18%] w-[45%] rounded-full opacity-15 blur-md"
          style={{ background: '#ffffff' }}
        />
      )}

      {/* giant letter watermark */}
      <span
        className={cn(
          'absolute font-extrabold leading-none tracking-tighter',
          variant === 'poster' ? 'left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2 text-[9rem]' : 'left-[4%] top-1/2 -translate-y-1/2 text-[16rem]'
        )}
        style={{ color: '#ffffff', opacity: 0.07 }}
      >
        {letter}
      </span>

      {/* title block — poster variant only (backdrop is decorative art) */}
      {variant === 'poster' && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent p-4 pt-8">
          <div className="mb-1.5 h-1 w-8 rounded-full bg-gradient-rose" />
          <h3 className="text-xl font-extrabold leading-tight tracking-tight text-white">
            {media.title}
          </h3>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
            {media.year} · {media.genres[0]}
          </p>
        </div>
      )}

      {/* subtle glass sheen */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.06] via-transparent to-black/25" />
    </div>
  )
}

/* Skeleton placeholder for cards loading */
export function PosterSkeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton-shimmer rounded-2xl', className)} aria-hidden />
}
