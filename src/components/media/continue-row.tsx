'use client'

import { useEffect, useState } from 'react'
import { Play, X, Tv } from 'lucide-react'
import type { WatchProgress, UnifiedMedia } from '@/lib/types'
import { useApp } from '@/lib/store'
import { progressStore } from '@/lib/db/stores'
import { mediaService } from '@/lib/services/media'
import { SmartPoster } from './smart-poster'
import { SectionTitle, EmptyState } from '../ui-custom/glass'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

function fmtTime(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export function ContinueRow({ compact = false }: { compact?: boolean }) {
  const { openPlayer, bumpLibrary } = useApp()
  const [rows, setRows] = useState<{ p: WatchProgress; media?: UnifiedMedia }[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    const all = await progressStore.all()
    const hydrated = await Promise.all(
      all.slice(0, 12).map(async (p) => ({ p, media: await mediaService.detail(p.mediaId) ?? undefined }))
    )
    setRows(hydrated.filter((r) => r.media && r.p.position / Math.max(r.p.duration, 1) < 0.97))
    setLoading(false)
  }

  useEffect(() => {
    const t = setTimeout(load, 0)
    const iv = setInterval(load, 30_000) // keeps bar fresh while watching
    return () => { clearTimeout(t); clearInterval(iv) }
  }, [])

  if (loading) {
    return (
      <section>
        <SectionTitle title="Continue Watching" />
        <div className="no-scrollbar flex gap-4 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton-shimmer h-40 w-64 shrink-0 rounded-2xl" />
          ))}
        </div>
      </section>
    )
  }

  if (rows.length === 0) return null

  return (
    <section>
      <SectionTitle
        title="Continue Watching"
        subtitle="Saved on this device — no account, no sync, no tracking"
      />
      <div className="row-scroll no-scrollbar -mx-1 grid auto-cols-[16rem] grid-flow-col gap-3.5 overflow-x-auto px-1 pb-2 pt-1 md:auto-cols-[18rem]">
        {rows.map(({ p, media }) => {
          const pct = Math.round((p.position / Math.max(p.duration, 1)) * 100)
          const epLabel = p.season && p.episode ? `S${p.season} E${p.episode}` : mediaType(p.mediaType)
          return (
            <div
              key={`${p.mediaId}:${p.season ?? 0}:${p.episode ?? 0}`}
              className={cn('group glass glass-hover relative shrink-0 overflow-hidden rounded-2xl', compact ? 'w-56' : 'w-full')}
            >
              <div className="relative cursor-pointer" onClick={() => openPlayer(media!, p.season, p.episode)}>
                <SmartPoster media={media!} variant="backdrop" className="h-32 w-full md:h-36" />
                <div className="absolute inset-0 flex items-center justify-center bg-black/25 opacity-0 transition-opacity group-hover:opacity-100">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-rose text-white shadow-xl">
                    <Play size={20} fill="currentColor" />
                  </span>
                </div>
                <span className="absolute right-2 top-2 rounded-full border border-white/10 bg-black/45 px-2 py-0.5 text-[10px] font-extrabold text-white backdrop-blur-md">
                  {epLabel}
                </span>
              </div>
              <div className="px-3.5 pb-3.5 pt-2.5">
                <h4 className="truncate text-sm font-bold text-ink">{media?.title ?? p.title}</h4>
                <div className="progress-track mt-2 h-1.5">
                  <div className="progress-fill" style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[11px] font-semibold text-mauve">
                  <span>{pct}% · {fmtTime(p.duration - p.position)} left</span>
                  <button
                    className="rounded-full p-1 hover:bg-white/10 hover:text-rose"
                    aria-label="Remove from Continue Watching"
                    onClick={async (e) => {
                      e.stopPropagation()
                      await progressStore.remove(p.mediaId, p.season, p.episode)
                      bumpLibrary()
                      toast('Removed from Continue Watching')
                      load()
                    }}
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function mediaType(t: string) {
  return t === 'movie' ? 'Movie' : t === 'tv' ? 'TV' : 'Anime'
}

export function ContinueEmpty() {
  return (
    <EmptyState
      icon={<Tv size={26} />}
      title="Nothing in progress"
      body="Start watching something and it will appear here — progress is stored privately in your browser's IndexedDB."
    />
  )
}
