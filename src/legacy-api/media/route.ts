import { NextRequest, NextResponse } from 'next/server'
import {
  trending, popularMovies, popularTV, topRated, newReleases,
  byGenre, similar, search, moodPool, byId, CATALOG,
} from '@/lib/data/catalog'
import type { UnifiedMedia } from '@/lib/types'

export const dynamic = 'force-dynamic'

/* ── Worker API Gateway equivalent ────────────────────────────────────
   Simulates: edge Cache API + KV hot cache in front of the "database".
   Every response carries X-Cache: HIT|MISS so the cache layer is
   observable from the client.                                           */

type CacheEntry = { body: unknown; at: number; ttl: number }
const edgeCache = new Map<string, CacheEntry>()

function cacheGet(key: string): CacheEntry | null {
  const e = edgeCache.get(key)
  if (!e) return null
  if (Date.now() - e.at > e.ttl) {
    edgeCache.delete(key)
    return null
  }
  return e
}

function cacheSet(key: string, body: unknown, ttl = 5 * 60_000) {
  edgeCache.set(key, { body, at: Date.now(), ttl })
}

function slim(m: UnifiedMedia) {
  return { ...m, cast: m.cast.slice(0, 6) }
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const list = sp.get('list')
  const action = sp.get('action')
  const q = sp.get('q') ?? ''
  const id = sp.get('id') ?? ''
  const genre = sp.get('genre') ?? ''
  const moods = sp.get('moods') ?? ''

  const key = req.nextUrl.search
  const hit = cacheGet(key)
  if (hit) {
    return NextResponse.json(hit.body, {
      headers: { 'X-Cache': 'HIT', 'X-Cache-Entries': String(edgeCache.size) },
    })
  }

  let body: unknown = { results: [] }

  try {
    if (list) {
      switch (list) {
        case 'trending': body = { results: trending().map(slim) }; break
        case 'popular-movies': body = { results: popularMovies().map(slim) }; break
        case 'popular-tv': body = { results: popularTV().map(slim) }; break
        case 'anime': body = { results: CATALOG.filter((m) => m.mediaType === 'anime').sort((a, b) => b.popularity - a.popularity).map(slim) }; break
        case 'top-rated': body = { results: topRated().map(slim) }; break
        case 'new-releases': body = { results: newReleases().map(slim) }; break
        case 'genre': body = { results: byGenre(genre).map(slim) }; break
        default: body = { results: [] }
      }
      cacheSet(key, body, 3 * 60_000)
    } else if (action === 'search') {
      body = { results: search(q).map(slim) }
      cacheSet(key, body, 60_000)
    } else if (action === 'detail') {
      const m = byId(id)
      body = m ? { result: slim(m) } : { error: 'not found' }
      cacheSet(key, body, 10 * 60_000)
    } else if (action === 'similar') {
      body = { results: similar(id).map(slim) }
      cacheSet(key, body, 5 * 60_000)
    } else if (action === 'mood') {
      body = { results: moodPool(moods.split(',').filter(Boolean)).map(slim) }
      cacheSet(key, body, 60_000)
    } else {
      body = { error: 'bad request' }
    }
  } catch {
    /* resilience: never 500 the client hard */
    body = { results: [], error: 'upstream unavailable — showing cached data' }
  }

  return NextResponse.json(body, {
    headers: { 'X-Cache': 'MISS', 'X-Cache-Entries': String(edgeCache.size) },
  })
}
