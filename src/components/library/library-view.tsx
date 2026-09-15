'use client'

import { useEffect, useState, useCallback } from 'react'
import { setPageTitle } from '@/lib/utils'
import { BookmarkCheck, Heart, History as HistoryIcon, PlayCircle, Trash2, Clock } from 'lucide-react'
import type { UnifiedMedia, HistoryEntry } from '@/lib/types'
import { useApp } from '@/lib/store'
import { watchlistStore, favoritesStore, historyStore } from '@/lib/db/stores'
import { MediaCard, CardSkeleton } from '../media/media-card'
import { ContinueRow, ContinueEmpty } from '../media/continue-row'
import { GlassPanel, EmptyState, Chip, SectionTitle } from '../ui-custom/glass'
import { toast } from 'sonner'

type Tab = 'watchlist' | 'favorites' | 'history' | 'continue'

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'continue', label: 'Continue', icon: PlayCircle },
  { id: 'watchlist', label: 'Watchlist', icon: BookmarkCheck },
  { id: 'favorites', label: 'Favorites', icon: Heart },
  { id: 'history', label: 'History', icon: HistoryIcon },
]

function timeAgo(ts: number): string {
  const d = Date.now() - ts
  const m = Math.floor(d / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function LibraryView({ tab = 'continue' }: { tab?: Tab }) {
  /* tab title sync */
  useEffect(() => {
    setPageTitle('Your Library')
    return () => setPageTitle()
  }, [])
  const { navigate, libraryVersion } = useApp()
  const [active, setActive] = useState<Tab>(tab)
  const [items, setItems] = useState<UnifiedMedia[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    if (active === 'watchlist') setItems(await watchlistStore.all())
    else if (active === 'favorites') setItems(await favoritesStore.all())
    else if (active === 'history') setHistory(await historyStore.all())
    setLoading(false)
  }, [active])

  useEffect(() => { load() }, [load, libraryVersion])
  useEffect(() => { setActive(tab) }, [tab])

  const clearHistory = async () => {
    await historyStore.clear()
    toast.success('Watch history cleared from IndexedDB')
    load()
  }

  return (
    <div className="flex flex-col gap-6 pb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle title="Your Library" subtitle="Private to this browser — export anytime from Privacy Center" />
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map(({ id, label, icon: Icon }) => (
          <Chip key={id} active={active === id} onClick={() => { setActive(id); navigate({ name: 'library', tab: id }, true) }}>
            <span className="flex items-center gap-1.5"><Icon size={13} />{label}</span>
          </Chip>
        ))}
      </div>

      {active === 'continue' && <ContinueRow />}

      {active === 'continue' && (
        <ContinueEmpty />
      )}

      {loading && active !== 'continue' && (
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 md:gap-4">
          {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} index={i} />)}
        </div>
      )}

      {!loading && (active === 'watchlist' || active === 'favorites') && (
        items.length > 0 ? (
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 md:gap-4">
            {items.map((m, i) => <MediaCard key={m.id} media={m} index={i} />)}
          </div>
        ) : (
          <EmptyState
            icon={active === 'watchlist' ? <BookmarkCheck size={26} /> : <Heart size={26} />}
            title={active === 'watchlist' ? 'Watchlist is empty' : 'No favorites yet'}
            body={
              active === 'watchlist'
                ? 'Hover any poster and press + to save it here. Everything stays on this device.'
                : 'Tap the heart on any title you love — favorites weigh your taste profile 3× stronger.'
            }
          />
        )
      )}

      {!loading && active === 'history' && (
        history.length > 0 ? (
          <GlassPanel className="overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4">
              <p className="text-sm font-bold text-ink">{history.length} entries in IndexedDB</p>
              <button
                onClick={clearHistory}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold text-mauve transition-colors hover:bg-rose/15 hover:text-rose"
              >
                <Trash2 size={13} /> Clear history
              </button>
            </div>
            <div className="scrollbar-thin max-h-[520px] overflow-y-auto border-t border-white/8">
              {history.map((h) => (
                <button
                  key={`${h.mediaId}:${h.season ?? 0}:${h.episode ?? 0}:${h.watchedAt}`}
                  onClick={() => navigate({ name: 'detail', id: h.mediaId })}
                  className="flex w-full items-center gap-4 border-b border-white/5 px-5 py-3.5 text-left transition-colors last:border-0 hover:bg-white/5"
                >
                  <span className="glass flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-ink">
                    <Clock size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink">
                      {h.title}
                      {h.season ? <span className="ml-2 text-xs font-semibold text-mauve">S{h.season} E{h.episode}</span> : null}
                    </p>
                    <p className="text-xs text-mauve">{h.mediaType === 'movie' ? 'Movie' : h.mediaType === 'tv' ? 'TV' : 'Anime'} · {timeAgo(h.watchedAt)}</p>
                  </div>
                  {h.completed && <span className="rounded-full bg-gradient-mint px-2.5 py-0.5 text-[10px] font-extrabold text-black">COMPLETED</span>}
                </button>
              ))}
            </div>
          </GlassPanel>
        ) : (
          <EmptyState
            icon={<HistoryIcon size={26} />}
            title="No watch history"
            body="Anything you open in the Watch page is recorded here — strictly on this device. Turn on Private Session in the Privacy Center to pause recording."
          />
        )
      )}
    </div>
  )
}
