import type { UnifiedMedia } from '../types'

/* ── Smart Search Engine — typo-tolerant, genre-aware, AI-assisted ───────
   Local-first intent detection that wraps the worker /api/media search:

     1. GENRE      "horror", "scifi", "comedies"… → catalog browse by genre
     2. TITLE      normal keyword search (worker ranks exact > prefix > fuzzy)
     3. TYPO       zero results → generate spelling variants and retry,
                   plus "did you mean" against recent searches + genres
     4. DESCRIPTIVE "dark sci-fi with a mystery vibe" → AI Mode (built in)

   Everything runs on-device; only the final TMDB/AI calls leave the phone. */

export type SearchScope = 'auto' | 'movie' | 'tv' | 'anime' | 'genre'

/* genre key (worker-compatible, normKey'd) → display label + aliases */
export const GENRE_INDEX: { key: string; label: string; aliases: string[] }[] = [
  { key: 'action', label: 'Action', aliases: ['action', 'actions', 'actionsj'] },
  { key: 'adventure', label: 'Adventure', aliases: ['adventure', 'adventures'] },
  { key: 'animation', label: 'Animation', aliases: ['animation', 'animated', 'cartoon', 'cartoons'] },
  { key: 'comedy', label: 'Comedy', aliases: ['comedy', 'comedies', 'funny'] },
  { key: 'crime', label: 'Crime', aliases: ['crime', 'crimes', 'gangster'] },
  { key: 'documentary', label: 'Documentary', aliases: ['documentary', 'documentaries', 'docs'] },
  { key: 'drama', label: 'Drama', aliases: ['drama', 'dramas'] },
  { key: 'family', label: 'Family', aliases: ['family', 'kids', 'children'] },
  { key: 'fantasy', label: 'Fantasy', aliases: ['fantasy', 'fantasies'] },
  { key: 'history', label: 'History', aliases: ['history', 'historical', 'historic'] },
  { key: 'horror', label: 'Horror', aliases: ['horror', 'horrors', 'scary'] },
  { key: 'music', label: 'Music', aliases: ['music', 'musical', 'musicals'] },
  { key: 'mystery', label: 'Mystery', aliases: ['mystery', 'mysteries', 'whodunit'] },
  { key: 'romance', label: 'Romance', aliases: ['romance', 'romantic', 'romcom', 'love'] },
  { key: 'scifi', label: 'Sci-Fi', aliases: ['scifi', 'scify', 'syfy', 'sciencefiction', 'space'] },
  { key: 'thriller', label: 'Thriller', aliases: ['thriller', 'thrillers', 'suspense'] },
  { key: 'war', label: 'War', aliases: ['war'] },
  { key: 'western', label: 'Western', aliases: ['western', 'westerns', 'cowboy'] },
]

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/* ── Levenshtein distance (small strings only — O(nm) is fine here) ── */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const curr = [i]
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1), // substitution
      )
    }
    prev = curr
  }
  return prev[b.length]
}

/* tolerance scales with word length: "horrro" (6→≤2), "acton" (5→≤1) */
function typoTolerance(len: number): number {
  if (len >= 7) return 2
  if (len >= 4) return 1
  return 0
}

/* ── Genre detection: exact alias first, then typo-tolerant ────────────
   Multi-word queries match any token ("funny horror" → comedy+horror).  */
export function detectGenres(q: string): { key: string; label: string; word: string }[] {
  const tokens = q.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  const hits: { key: string; label: string; word: string }[] = []
  const seen = new Set<string>()
  for (const tok of tokens) {
    const t = norm(tok)
    if (!t) continue
    let best: { key: string; label: string; d: number } | null = null
    for (const g of GENRE_INDEX) {
      for (const alias of g.aliases) {
        if (alias === t) { best = { key: g.key, label: g.label, d: 0 }; break }
        const d = levenshtein(alias, t)
        const tol = typoTolerance(alias.length)
        if (d > 0 && d <= tol && (!best || d < best.d)) best = { key: g.key, label: g.label, d }
      }
    }
    if (best && !seen.has(best.key)) {
      seen.add(best.key)
      hits.push({ key: best.key, label: best.label, word: tok })
    }
    if (hits.length >= 2) break
  }
  return hits
}

/* ── "Did you mean" against a vocabulary (recent searches + genres) ─── */
export function didYouMean(q: string, vocab: string[]): string | null {
  const nq = norm(q)
  if (!nq) return null
  const tol = typoTolerance(nq.length)
  if (!tol) return null
  let best: { cand: string; d: number } | null = null
  for (const raw of vocab) {
    const c = norm(raw)
    if (!c || c === nq) continue
    const d = levenshtein(c, nq)
    if (d > 0 && d <= tol && (!best || d < best.d)) best = { cand: raw, d }
  }
  return best?.cand ?? null
}

/* ── Spelling-variant generator for zero-result retries ─────────────────
   Cheap deterministic transforms that fix the most common typing mistakes:
   doubled letters ("incepttion"), adjacent transposition ("incepiton"),
   and a trailing stray character ("inceptionn"). Capped at 8 variants.  */
export function typoVariants(q: string): string[] {
  const out = new Set<string>()
  const push = (s: string) => { if (s && s.toLowerCase() !== q.toLowerCase()) out.add(s) }

  // 1 — collapse doubled letters (keep one)
  let collapsed = ''
  for (let i = 0; i < q.length; i++) {
    if (i > 0 && q[i].toLowerCase() === q[i - 1].toLowerCase()) continue
    collapsed += q[i]
  }
  if (collapsed !== q) push(collapsed)

  // 2 — adjacent transposition (each pair swapped)
  if (q.length >= 4 && q.length <= 24) {
    for (let i = 0; i < q.length - 1; i++) {
      if (q[i].toLowerCase() === q[i + 1].toLowerCase()) continue
      push(q.slice(0, i) + q[i + 1] + q[i] + q.slice(i + 2))
      if (out.size >= 8) break
    }
  }

  // 3 — drop trailing stray char ("inceptionn" → "inception")
  if (q.length >= 4) push(q.slice(0, -1))

  return Array.from(out).slice(0, 8)
}

/* ── Descriptive-query heuristic: does this read like a vibe request? ── */
const VIBE_WORDS = /\b(like|similar|vibe|vibes|mood|feel|feels|about|where|with|good|best|great|cozy|dark|mindless|mindbending|rainy|night|weekend|something|anything|recommend|suggest|watch)\b/

export function looksDescriptive(q: string): boolean {
  const words = q.trim().split(/\s+/).filter(Boolean)
  if (words.length >= 4) return true
  if (words.length >= 2 && VIBE_WORDS.test(q.toLowerCase())) return true
  return false
}

/* ── Merge two result lists (title matches first, dedup by id) ───────── */
export function mergeResults(primary: UnifiedMedia[], extra: UnifiedMedia[], cap = 24): UnifiedMedia[] {
  const seen = new Set<string>()
  const out: UnifiedMedia[] = []
  for (const m of [...primary, ...extra]) {
    if (seen.has(m.id)) continue
    seen.add(m.id)
    out.push(m)
    if (out.length >= cap) break
  }
  return out
}

export const SCOPE_LABELS: Record<SearchScope, string> = {
  auto: 'Auto',
  movie: 'Movies',
  tv: 'TV',
  anime: 'Anime',
  genre: 'Genre',
}
