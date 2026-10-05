'use client'

/* ── DuoOverlay — the in-player watch-party cockpit ──────────────────────
   Appears inside the player container (absolute, never reflows layout):

     • partner video tile  (top-right corner, PiP style, when video is on)
     • 3 glass buttons     (Chat · Voice · Video) bottom-right when the
                           two partners are connected — exactly the spec
     • encrypted chat drawer (right side over the player)
     • drift banner        (guest side: "behind partner → Jump")
     • status pill         (offline / waiting / live tunnel)             */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { MessageCircle, Mic, MicOff, Video, VideoOff, X, Send, Users, Timer, Volume2, VolumeX, Loader2 } from 'lucide-react'
import { duo, type DuoState } from '@/lib/services/duo'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

function useDuo(): DuoState {
  return useSyncExternalStore(duo.subscribe, duo.getSnapshot, duo.getSnapshot)
}

function fmt(sec: number): string {
  const s = Math.abs(Math.round(sec))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

export function DuoOverlay() {
  const d = useDuo()
  const [camStream, setCamStream] = useState<MediaStream | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  /* remote camera → tile */
  useEffect(() => {
    const t = setInterval(() => {
      const s = duo.getRemoteVideoStream()
      setCamStream((prev) => (prev !== s ? s : prev))
    }, 700)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    if (videoRef.current && camStream && videoRef.current.srcObject !== camStream) {
      videoRef.current.srcObject = camStream
      void videoRef.current.play().catch(() => undefined)
    }
  }, [camStream])

  /* error toasts */
  useEffect(() => {
    if (d.error) toast.error(d.error, { id: 'duo-err' })
  }, [d.error])

  if (!d.paired && !d.wsOnline) return null

  const connected = d.call === 'live' && d.partnerOnline

  return (
    <>
      {/* partner camera tile — corner of the video player */}
      {connected && d.videoOn && camStream && (
        <div className="absolute top-3 right-3 z-30 w-32 overflow-hidden rounded-2xl border border-white/15 bg-black/60 shadow-2xl backdrop-blur-md sm:w-44">
          <video ref={videoRef} muted playsInline className="aspect-video w-full object-cover" />
          <div className="flex items-center justify-between px-2 py-1">
            <span className="flex items-center gap-1 text-[10px] font-bold text-white/80">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-mint" /> Partner
            </span>
            <button
              onClick={() => void duo.toggleVideo(false)}
              className="rounded-full p-0.5 text-white/60 hover:text-white"
              aria-label="Close partner video"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      )}

      {/* chat drawer */}
      {d.chatOpen && connected && (
        <div className="absolute top-3 right-3 z-30 flex h-[78%] w-[86%] max-w-90 flex-col overflow-hidden rounded-2xl border border-white/15 bg-black/70 shadow-2xl backdrop-blur-xl sm:w-88">
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
            <span className="flex items-center gap-2 text-xs font-bold text-white/90">
              <MessageCircle size={13} className="text-mauve" /> Duo chat
              <span className="rounded-full bg-mint/15 px-2 py-0.5 text-[9px] font-bold text-mint">E2E encrypted</span>
            </span>
            <button onClick={() => duo.openChat(false)} className="rounded-full p-1 text-white/60 hover:text-white" aria-label="Close chat">
              <X size={14} />
            </button>
          </div>
          <ChatBody d={d} />
        </div>
      )}

      {/* drift banner (guest) */}
      {!d.isHost && d.hostState && d.drift !== null && Math.abs(d.drift) > 8 && (
        <div className="absolute bottom-3 left-3 z-30 flex items-center gap-2 rounded-full border border-white/15 bg-black/70 px-3 py-1.5 text-[11px] font-bold text-white/90 shadow-xl backdrop-blur-md">
          <Timer size={12} className={d.drift < 0 ? 'text-rose' : 'text-mint'} />
          {d.drift < 0 ? `You're ${fmt(d.drift)} behind your partner` : `You're ahead by ${fmt(d.drift)}`}
          <button
            onClick={() => duo.jumpToHost()}
            className="rounded-full bg-gradient-rose px-2.5 py-1 text-[10px] font-extrabold text-white hover:brightness-110"
          >
            Jump to partner
          </button>
        </div>
      )}

      {/* status pill + controls */}
      <div className="absolute bottom-3 right-3 z-30 flex items-center gap-2">
        {!connected && (
          <span className="flex items-center gap-1.5 rounded-full border border-white/15 bg-black/70 px-3 py-1.5 text-[11px] font-bold text-white/85 shadow-xl backdrop-blur-md">
            {d.call === 'connecting' ? (
              <Loader2 size={12} className="animate-spin text-mauve" />
            ) : (
              <Users size={12} className={d.partnerOnline ? 'text-mint' : 'text-mauve'} />
            )}
            {d.call === 'connecting'
              ? 'Connecting tunnel…'
              : d.partnerOnline
                ? 'Partner online'
                : d.isHost
                  ? 'Waiting for your partner…'
                  : 'Partner offline'}
          </span>
        )}

        {connected && (
          <>
            <span className="hidden items-center gap-1.5 rounded-full border border-mint/25 bg-mint/10 px-3 py-1.5 text-[11px] font-bold text-mint shadow-xl sm:flex">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-mint" /> Duo live · P2P encrypted
            </span>
            <OverlayBtn
              active={d.chatOpen}
              label="Chat"
              onClick={() => duo.openChat(!d.chatOpen)}
              badge={d.unread > 0 ? d.unread : undefined}
            >
              <MessageCircle size={17} />
            </OverlayBtn>
            <OverlayBtn
              active={d.voiceOn}
              label={d.voiceOn ? 'Mute' : 'Voice'}
              onClick={() => void duo.toggleVoice(!d.voiceOn)}
            >
              {d.voiceOn ? <Mic size={17} /> : <MicOff size={17} />}
            </OverlayBtn>
            <OverlayBtn
              active={d.videoOn}
              label={d.videoOn ? 'Cam off' : 'Video'}
              onClick={() => void duo.toggleVideo(!d.videoOn)}
            >
              {d.videoOn ? <Video size={17} /> : <VideoOff size={17} />}
            </OverlayBtn>
            <OverlayBtn active={d.spatial} label={d.spatial ? '3D' : '2D'} onClick={() => duo.setSpatial(!d.spatial)}>
              {d.spatial ? <Volume2 size={17} /> : <VolumeX size={17} />}
            </OverlayBtn>
          </>
        )}
      </div>
    </>
  )
}

function OverlayBtn({
  children,
  label,
  active,
  onClick,
  badge,
}: {
  children: React.ReactNode
  label: string
  active?: boolean
  onClick: () => void
  badge?: number
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        'relative flex h-10 w-10 items-center justify-center rounded-full border shadow-xl backdrop-blur-md transition-all hover:scale-105 active:scale-95',
        active ? 'border-rose/40 bg-gradient-rose text-white' : 'border-white/15 bg-black/70 text-white/85 hover:text-white',
      )}
    >
      {children}
      {badge != null && badge > 0 && (
        <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose px-1 text-[9px] font-extrabold text-white">
          {badge}
        </span>
      )}
    </button>
  )
}

/* ── DuoFollower — global guest-side companion ─────────────────────────
   When the host starts (or switches) a title while the partner is NOT in
   the player, the partner gets a one-tap "Join" toast. Mounted once in
   the SPA shell.                                                        */
export function DuoFollower() {
  const d = useDuo()
  const navigate = useApp((s) => s.navigate)
  const view = useApp((s) => s.view)
  const lastKey = useRef('')
  useEffect(() => {
    if (d.isHost || !d.partnerOnline || !d.hostState?.mediaId) return
    if (view.name === 'watch' && (view as { id?: string }).id === d.hostState.mediaId) return
    const key = `${d.hostState.mediaId}|${view.name}`
    if (lastKey.current === key) return
    lastKey.current = key
    const st = d.hostState
    toast(`Your partner is watching “${st.title ?? 'something'}”`, {
      id: 'duo-follow',
      duration: 12000,
      action: {
        label: 'Join',
        onClick: () =>
          navigate({ name: 'watch', id: st.mediaId as string, season: st.season, episode: st.episode }),
      },
    })
  }, [d.isHost, d.partnerOnline, d.hostState, view, navigate])
  return null
}

function ChatBody({ d }: { d: DuoState }) {
  const [text, setText] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [d.chat.length])

  return (
    <>
      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {d.chat.length === 0 && (
          <p className="px-2 py-8 text-center text-[11px] font-semibold text-white/40">
            Messages are encrypted between you two — even the server can&apos;t read them. Nothing is saved.
          </p>
        )}
        {d.chat.map((m, i) => (
          <div key={i} className={cn('flex', m.from === 'me' ? 'justify-end' : 'justify-start')}>
            <div
              className={cn(
                'max-w-[80%] rounded-2xl px-3 py-2 text-xs font-semibold leading-relaxed',
                m.from === 'me' ? 'rounded-br-sm bg-gradient-rose text-white' : 'rounded-bl-sm bg-white/10 text-white/90',
              )}
            >
              {m.text}
              <span className="mt-0.5 block text-[9px] font-bold opacity-50">
                {new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form
        className="flex items-center gap-2 border-t border-white/10 px-3 py-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!text.trim()) return
          void duo.sendChat(text)
          setText('')
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a secret message…"
          maxLength={800}
          className="min-h-9 flex-1 rounded-full border border-white/10 bg-white/5 px-3.5 text-xs font-semibold text-white placeholder:text-white/35 focus:border-rose/40 focus:outline-none"
        />
        <button
          type="submit"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-rose text-white shadow-lg hover:brightness-110"
          aria-label="Send message"
        >
          <Send size={14} />
        </button>
      </form>
    </>
  )
}
