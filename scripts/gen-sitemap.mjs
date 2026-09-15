#!/usr/bin/env node
/* ── gen-sitemap.mjs ─────────────────────────────────────────────────────
   Generates out/sitemap.xml as a REAL static asset.

   Why: GSC reported "Couldn't fetch" because an old poisoned edge entry
   kept serving the sitemap with `content-type: text/html` no matter what
   the worker returned. Shipping sitemap.xml as a first-class static asset
   makes every deployment carry its own correct, correctly-typed copy —
   the worker SEO route stays as a fallback for paths where the asset is
   absent (e.g. `wrangler dev` with a bare out/).

   Core routes are always included; title URLs are fetched from the live
   media API when reachable (graceful fallback → core routes only).     */

import { writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'out')
const ORIGIN = 'https://movies.invokeil.cfd'
const MAX_URLS = 1000

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const GENRES = [
  'action', 'adventure', 'animation', 'comedy', 'crime', 'documentary', 'drama',
  'family', 'fantasy', 'history', 'horror', 'music', 'mystery', 'romance',
  'sci-fi', 'thriller', 'war', 'western',
]

async function fetchIds(list) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 8000)
  try {
    const r = await fetch(`${ORIGIN}/api/media?list=${list}`, { signal: ctrl.signal })
    if (!r.ok) return []
    const j = await r.json()
    const items = Array.isArray(j) ? j : (j.results ?? [])
    return items
      .filter((m) => m?.posterPath && m?.overview && String(m.overview).trim().length >= 40 && (m.voteCount ?? 0) >= 5)
      .map((m) => `/${m.mediaType === 'tv' ? 'tv' : 'movie'}/${m.tmdbId}`)
  } catch {
    return []
  } finally {
    clearTimeout(t)
  }
}

const today = new Date().toISOString().slice(0, 10)
const urls = new Map()
for (const p of ['/', '/movies', '/tv', '/anime', ...GENRES.map((g) => `/genre/${g}`)]) urls.set(p, today)

const lists = await Promise.all([
  'trending', 'popular-movies', 'popular-tv', 'anime', 'top-rated', 'new-releases',
].map(fetchIds))
const live = lists.flat()
if (live.length === 0) console.warn('[sitemap] live API unreachable — shipping core routes only')
for (const p of live) {
  if (urls.size >= MAX_URLS) break
  if (!urls.has(p)) urls.set(p, today)
}

const xml =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  [...urls.entries()].map(([p, lm]) => `  <url><loc>${esc(ORIGIN)}${esc(p)}</loc><lastmod>${lm}</lastmod></url>`).join('\n') +
  `\n</urlset>\n`

await mkdir(OUT, { recursive: true })
await writeFile(join(OUT, 'sitemap.xml'), xml, 'utf8')
console.log(`[sitemap] wrote out/sitemap.xml — ${urls.size} URLs`)
