/* ── Movies by invokeil — TMDB image pipeline ────────────────────────────
   All artwork flows through the Worker's /api/img proxy, which stores every
   image in Cloudflare R2 on first load and serves subsequent requests from
   R2 + the edge cache. The browser never talks to image.tmdb.org directly,
   so posters/backdrops/cast photos always resolve (no client-side blocking,
   no third-party connection, fully CF-served after first load).           */

import { API_BASE } from './api'

export type ImgSize =
  | 'w92' | 'w154' | 'w185' | 'w300' | 'w342' | 'w500' | 'w780' | 'w1280' | 'original'

/** Build the same-origin (or worker-origin) proxied URL for a TMDB image path. */
export function tmdbImg(path: string | null | undefined, size: ImgSize = 'w500'): string {
  if (!path) return ''
  const base = API_BASE ?? ''
  return `${base}/api/img?p=${encodeURIComponent(path)}&s=${size}`
}
