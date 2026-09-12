'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Search, X, Clock, Sparkles, Loader2 } from 'lucide-react'
import type { UnifiedMedia } from '@/lib/types'
import { mediaService } from '@/lib/services/media'
import { searchStore } from '@/lib/db/stores'
import { useApp } from '@/lib/store'
import { MediaCard, CardSkeleton } from '../media/media-card'
import { GlassPanel, GlassButton, Chip, EmptyState, SectionTitle } from '../ui-custom/glass'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { API_BASE } from '@/lib/api'

const AI_HINTS = [
  'dark sci-fi with a mystery vibe',
  'cozy animated films for a rainy night',
  'mind-bending thrillers like Inception',
  'heartwarming anime about friendship',
  'smart heist movies with twists',
]

export function SearchView({ initialQuery = '' }: { initialQuery?: string }) {
  const { navigate, prefs } = useApp()
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<UnifiedMedia[]>([])
  const [recent, setRecent] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [aiMode, setAiMode] = useState(false)
  const [aiReasons, setAiReasons] = useState<Record<string, string>>({})
  const [aiLoading, setAiLoading] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => { searchStore.recent().then(setRecent) }, [])

  const runAiSearch = useCallback(async (q: string) => {
    if (!q.trim()) return
    setAiLoading(true)
    setLoading(true)
    try {
      const { buildTasteProfile, aiStore } = await import('@/lib/db/stores')
      const cacheKey = `nlsearch:${q.toLowerCase()}`
      let data: { results?: { id: string; reason?: string }[] } | null = prefs.enableAI
        ? (await aiStore.get(cacheKey)) as typeof data
        : null

      if (!data) {
        const profile = prefs.personalization ? await buildTasteProfile() : {}
        const res = await fetch(`${API_BASE}/api/ai`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'nlsearch', query: q, profile }),
        })
        const j = await res.json()
        if (!j.ok || !j.results?.length) throw new Error(j.error ?? 'ai unavailable')
        data = j
        aiStore.put(cacheKey, j)
      }

      const ids = data?.results?.map((r) => r.id) ?? []
      const detailed = await Promise.all(ids.map((id) => mediaService.detail(id)))
      const items = detailed.filter(Boolean) as UnifiedMedia[]
      setResults(items)
      setAiReasons(Object.fromEntries((data?.results ?? []).map((r) => [r.id, r.reason ?? ''])))
      searchStore.add(q)
      searchStore.recent().then(setRecent)
      if (items.length === 0) toast('No matches found — try different words')
    } catch {
      toast.error('AI search unavailable — falling back to keyword search')
      setAiMode(false)
      const kw = await mediaService.search(q)
      setResults(kw)
    } finally {
      setAiLoading(false)
      setLoading(false)
    }
  }, [prefs.enableAI, prefs.personalization])

  useEffect(() => {
    if (aiMode) return // AI mode searches on Enter only
    if (debounce.current) clearTimeout(debounce.current)
    if (!query.trim()) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    debounce.current = setTimeout(async () => {
      const r = await mediaService.search(query)
      setResults(r)
      setLoading(false)
      if (r.length > 0) {
        searchStore.add(query)
        searchStore.recent().then(setRecent)
      }
    }, 350)
    return () => { if (debounce.current) clearTimeout(debounce.current) }
  }, [query, aiMode])

  return (
    <div className="flex flex-col gap-6 pb-6">
      <GlassPanel variant="strong" className="flex items-center gap-3 px-5 py-3.5">
        {aiLoading ? <Loader2 size={20} className="animate-spin text-rose" /> : (
          <Sparkles size={20} className={cn('shrink-0', aiMode ? 'text-rose' : 'text-mauve')} />
        )}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && aiMode && runAiSearch(query)}
          placeholder={aiMode ? 'Describe the vibe… "dark sci-fi with a mystery vibe"' : 'Search movies, TV shows, anime…'}
          className="w-full bg-transparent text-base font-medium text-ink outline-none placeholder:text-mauve/70"
          aria-label="Search"
        />
        {query && (
          <button onClick={() => { setQuery(''); setResults([]) }} aria-label="Clear search" className="rounded-full p-1.5 text-mauve hover:bg-white/50 hover:text-ink">
            <X size={17} />
          </button>
        )}
        <div className="h-6 w-px bg-white/70" />
        <button
          onClick={() => { setAiMode(!aiMode); setResults([]); setQuery('') }}
          className={cn(
            'shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all',
            aiMode ? 'bg-gradient-rose text-ink shadow' : 'text-mauve hover:bg-white/50'
          )}
          aria-pressed={aiMode}
        >
          AI Mode
        </button>
      </GlassPanel>

      {/* Recent searches */}
      {recent.length > 0 && !query && (
        <section>
          <SectionTitle title="Recent Searches" subtitle="Stored locally in IndexedDB" />
          <div className="flex flex-wrap gap-2">
            {recent.map((q) => (
              <Chip key={q} onClick={() => setQuery(q)}>
                <span className="flex items-center gap-1.5"><Clock size={11} />{q}</span>
              </Chip>
            ))}
          </div>
        </section>
      )}

      {/* AI hints */}
      {aiMode && !query && (
        <section>
          <SectionTitle title="Try asking for…" subtitle="Natural language search — interpreted by AI, ranked from the catalog" />
          <div className="flex flex-wrap gap-2">
            {AI_HINTS.map((h) => (
              <Chip key={h} onClick={() => { setQuery(h); runAiSearch(h) }}>{h}</Chip>
            ))}
          </div>
        </section>
      )}

      {/* Results */}
      {loading || aiLoading ? (
        <div className="flex flex-wrap gap-4">
          {Array.from({ length: 8 }).map((_, i) => <CardSkeleton key={i} index={i} />)}
        </div>
      ) : results.length > 0 ? (
        <>
          <SectionTitle
            title={`${results.length} result${results.length > 1 ? 's' : ''}`}
            subtitle={aiMode ? 'AI-ranked with personalized reasons' : 'Cached in IndexedDB for instant recall'}
          />
          <div className="flex flex-wrap gap-4">
            {results.map((m, i) => (
              <div key={m.id} className="relative">
                <MediaCard media={m} index={i} />
                {aiMode && aiReasons[m.id] && (
                  <p className="mt-1 w-40 text-[11px] font-medium leading-snug text-mauve md:w-44">
                    ✦ {aiReasons[m.id]}
                  </p>
                )}
              </div>
            ))}
          </div>
        </>
      ) : query && !loading ? (
        <EmptyState
          icon={<Search size={26} />}
          title={`No results for "${query}"`}
          body="Check spelling, or switch on AI Mode and describe what you feel like watching instead."
          action={
            <GlassButton variant="rose" onClick={() => setAiMode(true)}>
              <Sparkles size={15} /> Try AI Mode
            </GlassButton>
          }
        />
      ) : (
        <EmptyState
          icon={<Search size={26} />}
          title="Search the catalog"
          body="Movies, TV and anime — every search is cached locally so repeat lookups are instant, even offline."
        />
      )}

      {/* popular suggestions while empty */}
      {!query && !aiMode && (
        <section>
          <SectionTitle title="Popular searches" />
          <div className="flex flex-wrap gap-2">
            {['Inception', 'anime', 'Dune', 'thriller', 'Breaking Bad', 'Pixar'].map((q) => (
              <Chip key={q} onClick={() => setQuery(q)}>{q}</Chip>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
