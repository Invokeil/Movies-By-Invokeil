import type { UnifiedMedia, TasteProfile, HistoryEntry } from '../types'
import { CATALOG } from '../data/catalog'
import { historyStore, progressStore, buildTasteProfile, mediaStore } from '../db/stores'

/* ── Local Recommendation Engine (deterministic, pre-AI tier) ──────────
   User Profile → Candidate Pool → Ranking Engine → Recommendations     */

export interface Recommendation {
  media: UnifiedMedia
  score: number
  reason: string
}

export async function recommendForUser(limit = 12): Promise<Recommendation[]> {
  const profile = await buildTasteProfile()
  const [history, progress] = await Promise.all([historyStore.all(), progressStore.all()])
  const watchedIds = new Set(history.map((h) => h.mediaId))
  const inProgress = new Set(progress.map((p) => p.mediaId))

  const topGenres = Object.entries(profile.genreWeights)
    .sort((a, b) => b[1] - a[1]).slice(0, 4).map(([g]) => g)
  const topDecades = Object.entries(profile.decadeCounts)
    .sort((a, b) => b[1] - a[1]).slice(0, 2).map(([d]) => parseInt(d))
  const topPeople = Object.entries(profile.peopleWeights)
    .sort((a, b) => b[1] - a[1]).slice(0, 6).map(([p]) => p.toLowerCase())

  const scored: Recommendation[] = CATALOG.filter(
    (m) => !watchedIds.has(m.id) || (inProgress.has(m.id) && !watchedIds.has(m.id))
  )
    .filter((m) => !inProgress.has(m.id))
    .map((m) => {
      let score = m.voteAverage / 2 // baseline quality
      const reasons: string[] = []

      const genreHits = m.genres.filter((g) => topGenres.includes(g))
      if (genreHits.length) {
        score += genreHits.length * 2.4
        reasons.push(`matches your taste for ${genreHits[0]}`)
      }
      for (const d of topDecades) {
        if (Math.floor(m.year / 10) * 10 === d) { score += 1.2; reasons.push(`from your favorite era (${d}s)`); break }
      }
      for (const p of topPeople) {
        if (m.director?.toLowerCase().includes(p) || m.cast.some((c) => c.name.toLowerCase().includes(p))) {
          score += 2.0
          reasons.push(`features ${m.cast.find((c) => c.name.toLowerCase().includes(p))?.name ?? m.director}`)
          break
        }
      }
      if (profile.languageWeights[m.originalLanguage]) score += 0.8
      score += Math.min(m.popularity / 200, 1.5)

      return {
        media: m,
        score,
        reason: reasons[0] ?? `highly rated ${m.genres[0]?.toLowerCase() ?? 'pick'} you haven't seen`,
      }
    })
    .sort((a, b) => b.score - a.score)

  return scored.slice(0, limit)
}

/* "Because you watched X" — item-based collaborative-ish similarity */
export async function becauseYouWatched(limit = 12): Promise<{ seed: HistoryEntry; recs: UnifiedMedia[] } | null> {
  const history = await historyStore.all()
  const seedEntry = history[0]
  if (!seedEntry) return null
  const seed = await mediaStore.getDetail(seedEntry.mediaId)
  if (!seed) return null

  const watchedIds = new Set(history.map((h) => h.mediaId))
  const recs = CATALOG.filter((m) => m.id !== seed.media.id && !watchedIds.has(m.id))
    .map((m) => ({
      m,
      score:
        m.genres.filter((g) => seed.media.genres.includes(g)).length * 3 +
        (m.mediaType === seed.media.mediaType ? 0.5 : 0) +
        m.voteAverage * 0.4 -
        Math.abs(m.year - seed.media.year) / 15,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.m)

  return { seed: seedEntry, recs }
}

/* Deterministic explanation for "Why am I seeing this?" */
export async function explainRecommendation(m: UnifiedMedia): Promise<string> {
  const profile: TasteProfile = await buildTasteProfile()
  const topGenres = Object.entries(profile.genreWeights).sort((a, b) => b[1] - a[1])
  const hits = m.genres.filter((g) => topGenres.some(([g2]) => g2 === g))
  const bits: string[] = []
  if (hits.length) bits.push(`you watch a lot of ${hits.join(' & ')}`)
  if (m.voteAverage >= profile.avgRating) bits.push(`it's rated ${m.voteAverage} — above your usual ${profile.avgRating}`)
  if (profile.peopleWeights[m.director ?? '']) bits.push(`${m.director} appears in your history`)
  if (bits.length === 0) bits.push(`it's trending and popular with viewers like you`)
  return `Because ${bits.join(', and ')}.`
}
