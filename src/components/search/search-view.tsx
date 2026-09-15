'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Search, X, Clock, Sparkles, Loader2, Film, Tv, Popcorn, Wand2, Tag,
} from 'lucide-react'
import type { UnifiedMedia } from '@/lib/types'
import { mediaService } from '@/lib/services/media'
import { searchStore } from '@/lib/db/stores'
import { useApp } from '@/lib/store'
import {
  detectGenres, didYouMean, typoVariants, looksDescriptive, mergeResults,
  GENRE_INDEX, type SearchScope,
} from '@/lib/services/search-engine'
import { MediaCard, CardSkeleton } from '../media/media-card'
import { GlassButton, Chip, EmptyState, SectionTitle } from '../ui-custom/glass'
import { cn, setPageTitle } from '@/lib/utils'
import { toast } from 'sonner'
import { API_BASE } from '@/lib/api'

const AI_HINTS = [
  'dark sci-fi with a mystery vibe',
  'cozy animated films for a rainy night',
  'mind-bending thrillers like Inception',
  'heartwarming anime about friendship',
  'smart heist movies with twists',
]

const POPULAR = ['Inception', 'anime', 'Dune', 'thriller', 'Breaking Bad', 'Pixar']

type Notice =
  | { kind: 'genre'; text: string }
  | { kind: 'fixed'; text: string }
  | { kind: 'ai'; text: string }
  | null

/* ── Smart Search — one pill, every way to find something ────────────────
   The pill uses the same glass classes as the desktop utility bar so the
   two read as ONE search entry point (no third heavy input row). Inside:
   a real input with typo-tolerant auto-detect, genre search, scope chips
   (Auto · Movies · TV · Anime · Genre) and a built-in AI Mode toggle.   */
export function SearchView({ initialQuery = '' }: { initialQuery?: string }) {
  const { prefs } = useApp()
  const [query, setQuery] = useState(initialQuery)
  const [scope, setScope] = useState<SearchScope>('auto')
  const [genrePick, setGenrePick] = useState<string | null>(null)
  const [results, setResults] = useState<UnifiedMedia[]>([])
  const [recent, setRecent] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [aiMode, setAiMode] = useState(false)
  const [aiReasons, setAiReasons] = useState<Record<string, string>>({})
  const [aiLoading, setAiLoading] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [didMean, setDidMean] = useState<string | null>(null)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => { searchStore.recent().then(setRecent) }, [])
  /* tab title sync — shows the active query */
  useEffect(() => {
    setPageTitle(query.trim() ? `Search: ${query.trim()}` : 'Search')
    return () => setPageTitle()
  }, [query])

  /* keep the URL in sync: /search?q=… becomes a shareable, history-friendly
     deep link (replaceState — no history spam while typing)                */
  useEffect(() => {
    const url = query.trim() ? `/search?q=${encodeURIComponent(query.trim())}` : '/search'
    if (location.pathname + location.search !== url) {
      history.replaceState({ view: 'search' }, '', url)
    }
  }, [query])

  /* `/` focuses the pill from anywhere on the page (when not typing) */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
      if (e.key === '/' && !typing) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /* ── AI Mode (built in) — natural language, ranked with reasons ────── */
  const runAiSearch = useCallback(async (q: string, auto = false) => {
    if (!q.trim()) return
    setAiLoading(true)
    setLoading(true)
    setDidMean(null)
    setNotice(auto ? { kind: 'ai', text: 'Reads like a description — switched to AI Mode' } : null)
    try {
      const { buildTasteProfile, aiStore } = await import('@/lib/db/stores')
      /* v2 prefix invalidates poisoned payloads cached by older builds;
         entries are { at, data } so we can expire stale ones */
      const cacheKey = `v2:nlsearch:${q.toLowerCase()}`
      type AiPayload = { results?: { id?: string; reason?: string }[] }
      let data: AiPayload | null = null

      if (prefs.enableAI) {
        try {
          const raw = (await aiStore.get(cacheKey)) as { at?: number; data?: AiPayload } | AiPayload | null
          const wrapped = raw && typeof raw === 'object' && 'data' in (raw as object) ? (raw as { at?: number; data?: AiPayload }) : null
          const cand = wrapped ? wrapped.data : (raw as AiPayload | null)
          if (cand && Array.isArray(cand.results) && cand.results.length > 0) {
            const fresh = !wrapped || !wrapped.at || Date.now() - wrapped.at < 86_400_000 // 24 h
            if (fresh) data = cand
          }
        } catch { /* cache read failure → live fetch */ }
      }

      if (!data) {
        let profile: Record<string, unknown> | import('@/lib/types').TasteProfile = {}
        if (prefs.personalization) {
          try { profile = await buildTasteProfile() } catch { profile = {} } // profile must never kill AI mode
        }
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 30_000) // hard ceiling — no infinite spinners
        try {
          const res = await fetch(`${API_BASE}/api/ai`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'nlsearch', query: q, profile }),
            signal: ctrl.signal,
          })
          const j = (await res.json()) as AiPayload & { ok?: boolean; error?: string }
          if (!j.ok || !j.results?.length) throw new Error(j.error ?? 'ai unavailable')
          data = j
          if (prefs.enableAI) {
            try { aiStore.put(cacheKey, { at: Date.now(), data: j }) } catch { /* best-effort */ }
          }
        } finally {
          clearTimeout(timer)
        }
      }

      const ids = (data?.results ?? []).map((r) => String(r.id ?? '')).filter(Boolean)
      /* per-id isolation: one bad/unreleased title can't kill the batch */
      const settled = await Promise.allSettled(ids.map((id) => mediaService.detail(id)))
      const items = settled
        .map((s) => (s.status === 'fulfilled' ? s.value : null))
        .filter(Boolean) as UnifiedMedia[]
      if (items.length === 0) throw new Error('no resolvable results')

      setResults(items)
      setAiReasons(
        Object.fromEntries(
          (data?.results ?? []).map((r) => [String(r.id ?? ''), r.reason ?? '']),
        ),
      )
      searchStore.add(q)
      searchStore.recent().then(setRecent)
    } catch {
      toast.error('AI search unavailable — falling back to keyword search')
      setAiMode(false)
      const kw = await mediaService.search(q)
      setResults(kw)
      if (kw.length === 0) toast('No matches found — try different words')
    } finally {
      setAiLoading(false)
      setLoading(false)
    }
  }, [prefs.enableAI, prefs.personalization])

  /* ── Auto-detect pipeline: genre → title → typo retry → AI ─────────── */
  const runSmartSearch = useCallback(async (q: string, sc: SearchScope) => {
    const raw = q.trim()
    if (!raw) { setResults([]); setNotice(null); setDidMean(null); return }
    setLoading(true)
    setDidMean(null)
    try {
      const type = sc === 'movie' ? 'movie' as const : sc === 'tv' ? 'tv' as const : sc === 'anime' ? 'anime' as const : undefined

      /* 1 — title search (worker ranks exact > prefix > word overlap) */
      let r = await mediaService.search(raw, type)
      let finalNotice: Notice = null

      /* 2 — genre detection (only in Auto scope; explicit scopes stay literal) */
      if (sc === 'auto') {
        const genres = detectGenres(raw)
        if (genres.length > 0) {
          const genreItems = await mediaService.byGenre(genres[0].key)
          r = mergeResults(r, genreItems)
          finalNotice = { kind: 'genre', text: genres[0].label }
        }
      }

      /* 3 — typo tolerance: zero hits → "did you mean" + variant retries */
      if (r.length === 0 && sc !== 'genre') {
        const recent = await searchStore.recent()
        const fix = didYouMean(raw, [...recent, ...GENRE_INDEX.map((g) => g.label)])
        if (fix && fix.toLowerCase() !== raw.toLowerCase()) {
          const fr = await mediaService.search(fix, type)
          if (fr.length > 0) {
            r = fr
            setDidMean(fix)
          }
        }
        if (r.length === 0) {
          for (const v of typoVariants(raw)) {
            const vr = await mediaService.search(v, type)
            if (vr.length > 0) {
              r = vr
              setDidMean(v)
              break
            }
          }
        }
      }

      /* 4 — descriptive query with thin keyword results → AI takes over */
      if (sc === 'auto' && r.length < 3 && looksDescriptive(raw) && prefs.enableAI) {
        setResults(r)
        setLoading(false)
        await runAiSearch(raw, true)
        return
      }

      setResults(r)
      setNotice(finalNotice)
      if (r.length > 0) {
        searchStore.add(raw)
        searchStore.recent().then(setRecent)
      }
    } finally {
      setLoading(false)
    }
  }, [prefs.enableAI, runAiSearch])

  /* debounced live search (keyword mode only — AI searches on Enter) */
  useEffect(() => {
    if (aiMode || scope === 'genre') return
    if (debounce.current) clearTimeout(debounce.current)
    if (!query.trim()) {
      setResults([]); setLoading(false); setNotice(null); setDidMean(null)
      return
    }
    setLoading(true)
    debounce.current = setTimeout(() => { void runSmartSearch(query, scope) }, 350)
    return () => { if (debounce.current) clearTimeout(debounce.current) }
  }, [query, scope, aiMode, runSmartSearch])

  /* genre browser: fetch on pick / clear on unpick */
  useEffect(() => {
    if (scope !== 'genre' || !genrePick) return
    setLoading(true)
    mediaService.byGenre(genrePick)
      .then((items) => { setResults(items); setNotice(null); setDidMean(null) })
      .finally(() => setLoading(false))
  }, [scope, genrePick])

  const submit = () => {
    if (aiMode) { void runAiSearch(query); return }
    if (scope === 'genre') {
      const g = detectGenres(query)
      if (g.length > 0) { setGenrePick(g[0].key); return }
    }
    if (debounce.current) clearTimeout(debounce.current)
    void runSmartSearch(query, scope)
  }

  const scopeChips: { id: SearchScope; label: string; icon: React.ElementType }[] = [
    { id: 'auto', label: 'Auto', icon: Wand2 },
    { id: 'movie', label: 'Movies', icon: Film },
    { id: 'tv', label: 'TV', icon: Tv },
    { id: 'anime', label: 'Anime', icon: Popcorn },
    { id: 'genre', label: 'Genre', icon: Tag },
  ]

  const searching = loading || aiLoading
  const showAiReasons = aiMode || notice?.kind === 'ai'

  return (
    <div className="flex flex-col gap-6 pb-6">
      {/* ── THE PILL — same glass classes as the desktop utility bar, now live ── */}
      <div className="flex">
        <div
          className={cn(
            'glass glass-hover group flex w-full max-w-md min-w-56 items-center gap-3 rounded-full px-4 py-2.5 text-left text-sm text-mauve transition-all',
            'focus-within:text-ink focus-within:ring-1 focus-within:ring-rose/40',
            aiMode && 'ring-1 ring-rose/40',
          )}
        >
          {searching ? (
            <Loader2 size={16} className="shrink-0 animate-spin text-rose" />
          ) : (
            <Search size={16} className={cn('shrink-0', (aiMode || notice?.kind === 'ai') && 'text-rose')} />
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder={aiMode ? 'Describe the vibe… "dark sci-fi, mystery"' : 'Search movies, TV, anime…'}
            className="w-full flex-1 truncate bg-transparent text-sm font-medium text-ink outline-none placeholder:text-mauve"
            aria-label="Search movies, TV shows and anime"
          />
          {query && (
            <button
              onClick={() => { setQuery(''); setResults([]); setNotice(null); setDidMean(null); inputRef.current?.focus() }}
              aria-label="Clear search"
              className="shrink-0 rounded-full p-1 text-mauve hover:bg-white/10 hover:text-ink"
            >
              <X size={14} />
            </button>
          )}
          {!query && (
            <kbd className="hidden rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-bold text-mauve lg:inline">/</kbd>
          )}
          {/* AI Mode — built in, one tap */}
          <button
            onClick={() => { setAiMode(!aiMode); setResults([]); setQuery(''); setNotice(null); setDidMean(null) }}
            className={cn(
              'shrink-0 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider transition-all',
              aiMode ? 'bg-gradient-rose text-white shadow' : 'bg-white/5 text-mauve hover:bg-white/10 hover:text-ink',
            )}
            aria-pressed={aiMode}
            aria-label="Toggle AI Mode — describe what you feel like watching"
          >
            <Sparkles size={11} className="mr-1 inline" />AI
          </button>
        </div>
      </div>

      {/* ── Scope chips — search on the user's terms ── */}
      <div className="flex flex-wrap items-center gap-2">
        {scopeChips.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => { setScope(id); setResults([]); setNotice(null); setDidMean(null) }}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all',
              scope === id ? 'bg-gradient-rose text-white shadow' : 'glass text-mauve hover:text-ink',
            )}
            aria-pressed={scope === id}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {/* genre picker (Genre scope) */}
      {scope === 'genre' && (
        <section>
          <SectionTitle title="Browse by genre" subtitle="Pick a genre — or type one above, typos included" />
          <div className="flex flex-wrap gap-2">
            {GENRE_INDEX.map((g) => (
              <Chip key={g.key} onClick={() => setGenrePick(g.key === genrePick ? null : g.key)}>
                <span className={cn(genrePick === g.key && 'font-extrabold text-ink')}>{g.label}</span>
              </Chip>
            ))}
          </div>
        </section>
      )}

      {/* auto-detect notices */}
      {notice?.kind === 'genre' && (
        <p className="flex items-center gap-2 text-xs font-bold text-mauve">
          <Tag size={13} className="text-rose" />
          Showing <span className="text-ink">{notice.text}</span> — detected from your search
        </p>
      )}
      {notice?.kind === 'ai' && (
        <p className="flex items-center gap-2 text-xs font-bold text-mauve">
          <Sparkles size={13} className="text-rose" /> {notice.text}
        </p>
      )}
      {didMean && (
        <p className="text-xs font-bold text-mauve">
          Auto-corrected <s className="text-mauve">{query.trim()}</s> →{' '}
          <button onClick={() => { setQuery(didMean); void runSmartSearch(didMean, scope) }} className="text-rose underline-offset-2 hover:underline">
            {didMean}
          </button>
        </p>
      )}

      {/* Recent searches */}
      {recent.length > 0 && !query && scope !== 'genre' && (
        <section>
          <SectionTitle title="Recent Searches" subtitle="Stored locally in IndexedDB" />
          <div className="flex flex-wrap gap-2">
            {recent.map((q) => (
              <Chip key={q} onClick={() => { setQuery(q); if (aiMode) void runAiSearch(q); else void runSmartSearch(q, scope) }}>
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
      {searching ? (
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 md:gap-4">
          {Array.from({ length: 12 }).map((_, i) => <CardSkeleton key={i} index={i} />)}
        </div>
      ) : results.length > 0 ? (
        <>
          <SectionTitle
            title={`${results.length} result${results.length > 1 ? 's' : ''}`}
            subtitle={
              showAiReasons
                ? 'AI-ranked with personalized reasons'
                : scope === 'genre' && genrePick
                  ? `${GENRE_INDEX.find((g) => g.key === genrePick)?.label ?? genrePick} · cached on Cloudflare edge + KV for instant recall`
                  : 'Cached on Cloudflare edge + KV, and locally for instant recall'
            }
          />
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 md:gap-4">
            {results.map((m, i) => (
              <div key={m.id} className="relative">
                <MediaCard media={m} index={i} />
                {showAiReasons && aiReasons[m.id] && (
                  <p className="mt-1 line-clamp-3 text-[11px] font-medium leading-snug text-mauve">
                    ✦ {aiReasons[m.id]}
                  </p>
                )}
              </div>
            ))}
          </div>
        </>
      ) : query && !searching && scope !== 'genre' ? (
        <EmptyState
          icon={<Search size={26} />}
          title={`No results for "${query}"`}
          body={
            looksDescriptive(query)
              ? 'Nothing matched the words — but your description looks perfect for AI Mode.'
              : 'Check spelling, or switch on AI Mode and describe what you feel like watching instead.'
          }
          action={
            <GlassButton variant="rose" onClick={() => { setAiMode(true); runAiSearch(query) }}>
              <Sparkles size={15} /> Try AI Mode
            </GlassButton>
          }
        />
      ) : scope !== 'genre' ? (
        <EmptyState
          icon={<Search size={26} />}
          title="Search the catalog"
          body="Movies, TV and anime — typos auto-corrected, genres auto-detected, and every search is cached on Cloudflare for instant recall."
        />
      ) : null}

      {/* popular suggestions while empty */}
      {!query && !aiMode && scope !== 'genre' && (
        <section>
          <SectionTitle title="Popular searches" />
          <div className="flex flex-wrap gap-2">
            {POPULAR.map((q) => (
              <Chip key={q} onClick={() => { setQuery(q); void runSmartSearch(q, scope) }}>{q}</Chip>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
