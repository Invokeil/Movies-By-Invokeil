'use client'

import { useEffect } from 'react'
import { X, Maximize2, Film } from 'lucide-react'
import { useApp } from '@/lib/store'
import { mediaService } from '@/lib/services/media'
import { progressStore } from '@/lib/db/stores'

/* ── Global Mini Player ────────────────────────────────────────────────
   Floating glass bar shown when the user navigates away mid-playback.  */

export function MiniPlayer() {
  const view = useApp((s) => s.view)
  const media = useApp((s) => s.player.media)
  const minimized = useApp((s) => s.player.minimized)
  const position = useApp((s) => s.player.position)
  const duration = useApp((s) => s.player.duration)
  const season = useApp((s) => s.player.season)
  const episode = useApp((s) => s.player.episode)
  const navigate = useApp((s) => s.navigate)
  const closePlayer = useApp((s) => s.closePlayer)
  const updatePlayer = useApp((s) => s.updatePlayer)
  const bumpLibrary = useApp((s) => s.bumpLibrary)

  const visible = !!media && minimized && view.name !== 'watch'

  // keep persisting progress while minimized
  useEffect(() => {
    if (!media || !minimized) return
    const saver = setInterval(() => {
      mediaService.saveProgress(media, position, duration, season, episode)
      bumpLibrary()
    }, 10_000)
    return () => clearInterval(saver)
  }, [media, minimized, position, duration, season, episode, bumpLibrary])

  if (!media) return null

  const pct = Math.round((position / Math.max(duration, 1)) * 100)

  const expand = () => {
    updatePlayer({ minimized: false })
    navigate({ name: 'watch', id: media.id, season, episode }, true)
  }

  const closeAndSave = async () => {
    await mediaService.saveProgress(media, position, duration, season, episode)
    await progressStore.save({
      mediaId: media.id, tmdbId: media.tmdbId, mediaType: media.mediaType,
      title: media.title, season, episode,
      position, duration, updatedAt: Date.now(),
    })
    closePlayer()
    bumpLibrary()
  }

  if (!visible) return null

  return (
    <div
      className="anim-slide-up fixed inset-x-3 bottom-[86px] z-40 md:inset-x-auto md:bottom-5 md:right-5 md:w-[380px]"
      role="complementary"
      aria-label="Mini player"
    >
      <div className="glass-strong flex items-center gap-3 rounded-2xl p-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-rose text-white">
          <Film size={18} />
        </span>
        <button className="min-w-0 flex-1 text-left" onClick={expand}>
          <p className="truncate text-sm font-bold text-ink">{media.title}</p>
          <p className="truncate text-[11px] font-semibold text-mauve">
            {season ? `S${season} E${episode} · ` : ''}{fmt(position)} · {pct}%
          </p>
          <div className="progress-track mt-1.5 h-1">
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
        </button>
        <div className="flex items-center gap-1">
          <button onClick={expand} className="rounded-full p-2 text-ink hover:bg-white/10" aria-label="Expand player">
            <Maximize2 size={16} />
          </button>
          <button onClick={closeAndSave} className="rounded-full p-2 text-ink hover:bg-white/10" aria-label="Close and save progress">
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
