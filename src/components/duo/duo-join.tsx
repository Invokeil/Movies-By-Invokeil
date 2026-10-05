'use client'

/* ── DuoJoinView — landing page for the private partner invite link ──────
   /duo/join#r=<room>&k=<secret>

   The fragment (#…) never reaches any server. This view pairs the device,
   then:
     • host currently watching → navigate straight into their title at
       the host's exact position (the core promise of Duo)
     • host idle → land on home with presence armed; the moment the host
       starts something, the partner is pulled in.                        */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Users, Check, Loader2, ArrowRight, Heart } from 'lucide-react'
import { duo } from '@/lib/services/duo'
import { useApp } from '@/lib/store'
import { GlassPanel, GlassButton } from '../ui-custom/glass'
import { setPageTitle } from '@/lib/utils'

export function DuoJoinView() {
  const navigate = useApp((s) => s.navigate)
  const openPlayer = useApp((s) => s.openPlayer)
  const [phase, setPhase] = useState<'joining' | 'idle' | 'error'>('joining')
  const [errorMsg, setErrorMsg] = useState('')
  const jumpedRef = useRef(false)
  const d = useSyncExternalStore(duo.subscribe, duo.getSnapshot, duo.getSnapshot)

  useEffect(() => {
    setPageTitle('Duo — joining your partner')
  }, [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      const res = await duo.joinFromHash(window.location.hash)
      if (!alive) return
      if (!res.ok) {
        setPhase('error')
        setErrorMsg(res.error ?? 'Could not join')
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  /* once connected: follow the host immediately if they're watching */
  useEffect(() => {
    if (phase === 'error' || jumpedRef.current) return
    if (!d.wsOnline) return
    const st = d.hostState
    if (st?.mediaId) {
      jumpedRef.current = true
      void import('@/lib/services/media').then(({ mediaService }) =>
        mediaService.detail(st.mediaId as string).then((m) => {
          if (m) openPlayer(m, st.season, st.episode)
          else navigate({ name: 'watch', id: st.mediaId as string, season: st.season, episode: st.episode })
        }),
      )
    } else {
      setPhase('idle') // tunnel armed — will follow when the host presses play
    }
  }, [d.paired, d.wsOnline, d.hostState, navigate, openPlayer, phase])

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-6 px-4 py-20 text-center">
      <span className="glass flex h-20 w-20 items-center justify-center rounded-3xl text-rose">
        {phase === 'joining' ? <Loader2 size={34} className="animate-spin" /> : phase === 'idle' ? <Heart size={34} /> : <Users size={34} />}
      </span>

      {phase === 'joining' && (
        <>
          <h1 className="text-2xl font-extrabold text-ink">Joining your partner&apos;s Duo…</h1>
          <p className="text-sm font-semibold text-mauve">
            Pairing this device through an encrypted private tunnel. If they&apos;re watching something right now,
            you&apos;ll drop in at their exact moment.
          </p>
        </>
      )}

      {phase === 'idle' && (
        <>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-ink">
            <Check size={22} className="text-mint" /> Paired!
          </h1>
          <p className="text-sm font-semibold text-mauve">
            Your partner isn&apos;t watching anything at the moment. The moment they press play, you&apos;ll be
            pulled into the same title at the same second — with encrypted chat, voice and video in the player.
          </p>
          <GlassButton variant="rose" onClick={() => navigate({ name: 'home' })} className="!px-6 !py-3">
            Browse while waiting <ArrowRight size={16} />
          </GlassButton>
        </>
      )}

      {phase === 'error' && (
        <>
          <h1 className="text-2xl font-extrabold text-ink">Couldn&apos;t join</h1>
          <GlassPanel variant="subtle" className="p-4 text-sm font-semibold text-mauve">
            {errorMsg}. Ask your partner for a fresh invite link from Settings → Partner Share.
          </GlassPanel>
          <GlassButton variant="rose" onClick={() => navigate({ name: 'home' })}>
            Go home
          </GlassButton>
        </>
      )}
    </div>
  )
}
