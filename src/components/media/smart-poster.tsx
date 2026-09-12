'use client'

import { useState } from 'react'
import type { UnifiedMedia } from '@/lib/types'
import { tmdbImg, type ImgSize } from '@/lib/images'
import { PosterArt } from './poster'
import { cn } from '@/lib/utils'

/* ── SmartPoster — real TMDB artwork over procedural art ───────────────
   The procedural PosterArt stays as the loading/fallback layer (on-brand
   pastel concept poster); the real poster/backdrop fades in on top once
   it arrives through the /api/img proxy (R2 + edge cache). Any load
   error hides the <img> permanently, leaving the procedural art.

   SmartAvatar: circular cast photo with an initials fallback drawn on
   the #F4ACB7→#9D8189 palette gradient.                                */

type LoadState = 'loading' | 'loaded' | 'error'

interface SmartPosterProps {
  media: UnifiedMedia
  variant?: 'poster' | 'backdrop'
  size?: ImgSize
  className?: string
}

export function SmartPoster({ media, variant = 'poster', size, className }: SmartPosterProps) {
  const path = variant === 'poster' ? media.posterPath : media.backdropPath
  const resolvedSize = size ?? (variant === 'poster' ? 'w342' : 'w780')
  const src = tmdbImg(path, resolvedSize)

  // Reset load state when the artwork (media) changes without a remount
  const [prevSrc, setPrevSrc] = useState(src)
  const [state, setState] = useState<LoadState>(src ? 'loading' : 'error')
  if (prevSrc !== src) {
    setPrevSrc(src)
    setState(src ? 'loading' : 'error')
  }

  return (
    <div className={cn('relative select-none overflow-hidden', className)}>
      {/* procedural fallback layer (poster variant carries the title overlay) */}
      <PosterArt media={media} variant={variant} className="absolute inset-0" />

      {/* real artwork — fades in on top once loaded */}
      {src && state !== 'error' && (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={() => setState('loaded')}
          onError={() => setState('error')}
          className={cn(
            'absolute inset-0 h-full w-full object-cover transition-opacity duration-500',
            state === 'loaded' ? 'opacity-100' : 'opacity-0'
          )}
        />
      )}
    </div>
  )
}

interface SmartAvatarProps {
  name: string
  profilePath?: string
  size?: ImgSize
  className?: string
}

export function SmartAvatar({ name, profilePath, size = 'w185', className }: SmartAvatarProps) {
  const src = tmdbImg(profilePath, size)

  const [prevSrc, setPrevSrc] = useState(src)
  const [state, setState] = useState<LoadState>(src ? 'loading' : 'error')
  if (prevSrc !== src) {
    setPrevSrc(src)
    setState(src ? 'loading' : 'error')
  }

  return (
    <span
      className={cn(
        'relative inline-flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-b from-[#F4ACB7] to-[#9D8189]',
        className
      )}
    >
      {src && state !== 'error' && (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={() => setState('loaded')}
          onError={() => setState('error')}
          className={cn(
            'absolute inset-0 h-full w-full object-cover transition-opacity duration-500',
            state === 'loaded' ? 'opacity-100' : 'opacity-0'
          )}
        />
      )}
      <span
        aria-hidden
        className={cn(
          'text-sm font-extrabold leading-none text-[#44353B] transition-opacity duration-500',
          state === 'loaded' ? 'opacity-0' : 'opacity-100'
        )}
      >
        {name.charAt(0).toUpperCase()}
      </span>
    </span>
  )
}
