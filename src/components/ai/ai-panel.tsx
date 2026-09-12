'use client'

import { useState, useCallback, useEffect } from 'react'
import { X, Sparkles, Loader2, Wand2, Brain, RefreshCw } from 'lucide-react'
import type { UnifiedMedia } from '@/lib/types'
import { useApp } from '@/lib/store'
import { mediaService } from '@/lib/services/media'
import { recommendForUser, type Recommendation } from '@/lib/services/recommend'
import { buildTasteProfile, aiStore } from '@/lib/db/stores'
import { GlassPanel, Chip, EmptyState } from '../ui-custom/glass'
import { SmartPoster } from '../media/smart-poster'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { API_BASE } from '@/lib/api'

const MOODS = [
  'mind-bending', 'cozy', 'feel-good', 'dark', 'romantic',
  'thrilling', 'epic', 'weird', 'dramatic', 'animated',
]

export function AIPanel() {
  const { aiPanelOpen, setAiPanel, prefs, bumpLibrary } = useApp()
  const [selected, setSelected] = useState<string[]>([])
  const [results, setResults] = useState<UnifiedMedia[]>([])
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [provider, setProvider] = useState<string | null>(null)
  const [localRecs, setLocalRecs] = useState<Recommendation[]>([])

  const loadLocal = useCallback(async () => {
    setLocalRecs(await recommendForUser(8))
  }, [])

  useEffect(() => {
    if (aiPanelOpen) loadLocal()
  }, [aiPanelOpen, loadLocal, prefs.enableAI])

  const runMood = async () => {
    if (selected.length === 0) {
      toast('Pick at least one mood first')
      return
    }
    setLoading(true)
    setResults([])
    try {
      const cacheKey = `mood:${selected.sort().join(',')}`
      let items: UnifiedMedia[] | null = null

      if (prefs.enableAI) {
        const cached = (await aiStore.get(cacheKey)) as { results?: { id: string; reason?: string }[] } | null
        if (cached?.results) {
          const ids = cached.results.map((r) => r.id)
          const detailed = await Promise.all(ids.map((id) => mediaService.detail(id)))
          items = detailed.filter(Boolean) as UnifiedMedia[]
          setReasons(Object.fromEntries((cached.results ?? []).map((r) => [r.id, r.reason ?? ''])))
          setProvider('cache')
        }
      }

      if (!items) {
        if (prefs.enableAI) {
          const profile = prefs.personalization ? await buildTasteProfile() : {}
          const res = await fetch(`${API_BASE}/api/ai`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'mood', query: selected.join(', '), profile }),
          })
          const j = await res.json()
          if (j.ok && j.results?.length) {
            const ids: string[] = j.results.map((r: { id: string; reason?: string }) => r.id)
            const detailed = await Promise.all(ids.map((id) => mediaService.detail(id)))
            items = detailed.filter(Boolean) as UnifiedMedia[]
            setReasons(Object.fromEntries(j.results.map((r: { id: string; reason?: string }) => [r.id, r.reason ?? ''])))
            setProvider(j.provider ?? 'ai')
            aiStore.put(cacheKey, j)
          }
        }
      }

      if (!items) {
        /* local deterministic fallback — engine tier 2 */
        items = await mediaService.mood(selected)
        setProvider('local engine')
      }

      setResults(items)
      bumpLibrary()
    } catch {
      const local = await mediaService.mood(selected)
      setResults(local)
      setProvider('local engine')
      toast.error('AI unavailable — used the local mood engine instead')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {aiPanelOpen && (
        <>
          <div
            onClick={() => setAiPanel(false)}
            className="anim-fade fixed inset-0 z-50 bg-[#44353b]/25 backdrop-blur-sm"
          />
          <aside
            className="anim-panel-right fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col p-3 md:p-4"
            aria-label="AI Discovery"
          >
            <div className="glass-strong flex h-full flex-col overflow-hidden rounded-3xl">
              {/* header */}
              <div className="flex items-center justify-between gap-3 border-b border-white/60 p-5">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-rose text-ink shadow-lg shadow-rose/30">
                    <Wand2 size={20} />
                  </span>
                  <div>
                    <h2 className="text-lg font-extrabold text-ink">AI Discovery</h2>
                    <p className="text-[11px] font-semibold text-mauve">
                      {prefs.enableAI ? 'Gemini-class router · falls back to local engine' : 'AI disabled — local engine only'}
                    </p>
                  </div>
                </div>
                <button onClick={() => setAiPanel(false)} className="glass rounded-full p-2.5 text-ink" aria-label="Close AI panel">
                  <X size={17} />
                </button>
              </div>

              <div className="scrollbar-thin flex-1 overflow-y-auto p-5">
                {/* mood picker */}
                <h3 className="mb-2.5 text-sm font-bold uppercase tracking-wider text-mauve">What&apos;s your mood?</h3>
                <div className="flex flex-wrap gap-2">
                  {MOODS.map((m) => (
                    <Chip
                      key={m}
                      active={selected.includes(m)}
                      onClick={() => setSelected((s) => s.includes(m) ? s.filter((x) => x !== m) : [...s, m])}
                    >
                      {m}
                    </Chip>
                  ))}
                </div>

                <button
                  onClick={runMood}
                  disabled={loading}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-rose py-3.5 text-sm font-extrabold text-ink shadow-lg shadow-rose/30 transition-transform hover:scale-[1.01] active:scale-95 disabled:opacity-60"
                >
                  {loading ? <Loader2 size={17} className="animate-spin" /> : <Sparkles size={17} />}
                  {loading ? 'Ranking the catalog…' : 'Discover for this mood'}
                </button>

                {provider && results.length > 0 && (
                  <p className="mt-2.5 text-center text-[11px] font-bold uppercase tracking-widest text-mint-deep">
                    Ranked by {provider}
                  </p>
                )}

                {/* AI results */}
                {results.length > 0 && (
                  <div className="mt-5 flex flex-col gap-4">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-mauve">Picked for you</h3>
                    {results.map((m, i) => (
                      <div
                        key={m.id}
                        className="anim-rise flex gap-3.5"
                        style={{ animationDelay: `${i * 50}ms` }}
                      >
                        <div className="w-[92px] shrink-0 overflow-hidden rounded-2xl glass">
                          <SmartPoster media={m} size="w154" className="aspect-[2/3] w-full" />
                        </div>
                        <div className="min-w-0 flex-1 rounded-2xl bg-white/40 p-3">
                          <p className="truncate text-sm font-bold text-ink">{m.title}</p>
                          <p className="text-[11px] font-semibold text-mauve">{m.year} · {m.genres.join(' · ')}</p>
                          {reasons[m.id] && (
                            <p className="mt-1.5 flex items-start gap-1 text-xs leading-snug text-ink/75">
                              <Brain size={12} className="mt-0.5 shrink-0 text-rose" />
                              {reasons[m.id]}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {loading && results.length === 0 && (
                  <div className="mt-6 flex flex-col gap-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="skeleton-shimmer h-24 w-full rounded-2xl" />
                    ))}
                  </div>
                )}

                {/* local recommendations */}
                {!loading && results.length === 0 && localRecs.length > 0 && (
                  <div className="mt-6">
                    <h3 className="mb-1 text-sm font-bold uppercase tracking-wider text-mauve">From your local taste profile</h3>
                    <p className="mb-3 text-[11px] text-mauve">Deterministic engine — works fully offline</p>
                    <div className="flex flex-col gap-2">
                      {localRecs.map((r) => (
                        <div key={r.media.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white/40 px-4 py-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-ink">{r.media.title}</p>
                            <p className="truncate text-[11px] font-semibold text-mauve">{r.reason}</p>
                          </div>
                          <span className={cn('shrink-0 rounded-full bg-gradient-mint px-2.5 py-1 text-[10px] font-extrabold text-ink')}>
                            {r.score.toFixed(1)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!loading && results.length === 0 && localRecs.length === 0 && (
                  <div className="mt-6">
                    <EmptyState
                      icon={<Sparkles size={24} />}
                      title="Your profile is still warming up"
                      body="Watch a few titles or add some to your watchlist — the local engine starts recommending immediately, no AI needed."
                    />
                  </div>
                )}
              </div>

              {/* footer */}
              <div className="flex items-center justify-between gap-2 border-t border-white/60 p-4">
                <p className="text-[10px] leading-snug text-mauve">
                  Privacy: raw history never leaves this device — AI receives an anonymized taste profile only.
                </p>
                <button
                  onClick={loadLocal}
                  className="glass shrink-0 rounded-full p-2 text-ink"
                  aria-label="Refresh local recommendations"
                >
                  <RefreshCw size={14} />
                </button>
              </div>
            </div>
          </aside>
        </>
      )}
    </>
  )
}

