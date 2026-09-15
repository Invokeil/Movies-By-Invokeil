'use client'

import { useEffect, useState, useRef, useSyncExternalStore } from 'react'
import {
  Palette, Play, Database, Sparkles, Info, Trash2, Download, Upload,
  GlassWater, Sparkle, BadgeCheck, Tv, ShieldCheck, Monitor, Users,
  Link2, Copy, RefreshCw, CheckCircle2, XCircle,
} from 'lucide-react'
import { useApp } from '@/lib/store'
import { idb } from '@/lib/db/idb'
import {
  mediaStore, historyStore, progressStore,
  favoritesStore, watchlistStore, searchStore, aiStore,
} from '@/lib/db/stores'
import { GlassPanel, Chip } from '../ui-custom/glass'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { THEMES } from '@/lib/themes'
import { duo, saveNick, loadNick } from '@/lib/services/duo'
import { toast } from 'sonner'
import { cn, setPageTitle } from '@/lib/utils'

function Section({
  icon: Icon, title, subtitle, children,
}: {
  icon: React.ElementType
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <GlassPanel className="p-6">
      <div className="mb-5 flex items-start gap-3.5">
        <span className="glass rounded-2xl p-2.5 text-rose"><Icon size={19} /></span>
        <div>
          <h2 className="text-lg font-bold text-ink">{title}</h2>
          <p className="text-xs text-mauve">{subtitle}</p>
        </div>
      </div>
      <div className="flex flex-col gap-5">{children}</div>
    </GlassPanel>
  )
}

function Row({
  label, hint, children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-bold text-ink">{label}</p>
        {hint && <p className="text-xs text-mauve">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

export function SettingsView() {
  /* tab title sync */
  useEffect(() => {
    setPageTitle('Settings')
    return () => setPageTitle()
  }, [])
  const { prefs, setPrefs, navigate } = useApp()
  const [stats, setStats] = useState({ usageMB: 0, quotaMB: 0, entries: 0, history: 0, lists: 0 })
  const fileInput = useRef<HTMLInputElement>(null)

  const refreshStats = async () => {
    const [est, media, hist, favs, wl] = await Promise.all([
      idb.sizeEstimate(),
      mediaStore.stats(),
      historyStore.all(),
      favoritesStore.all(),
      watchlistStore.all(),
    ])
    setStats({ usageMB: est.usageMB, quotaMB: est.quotaMB, entries: media.entries, history: hist.length, lists: favs.length + wl.length })
  }

  useEffect(() => { refreshStats() }, [])

  const clearCache = async () => {
    await mediaStore.clear()
    await aiStore.clear()
    await searchStore.clear()
    await refreshStats()
    toast.success('Metadata cache cleared')
  }

  const exportData = async () => {
    const [history, favorites, watchlist, progress, prefsSaved] = await Promise.all([
      historyStore.all(), favoritesStore.all(), watchlistStore.all(), progressStore.all(), idb.get('settings', 'prefs'),
    ])
    const blob = new Blob(
      [JSON.stringify({ app: 'movies-by-invokeil', exportedAt: new Date().toISOString(), history, favorites, watchlist, progress, prefs: prefsSaved }, null, 2)],
      { type: 'application/json' }
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `invokeil-profile-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Profile exported — import it on any device')
  }

  const importData = async (file: File) => {
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      if (data.app !== 'movies-by-invokeil') throw new Error('not an InvokeIL export')
      for (const m of data.favorites ?? []) await favoritesStore.add(m)
      for (const m of data.watchlist ?? []) await watchlistStore.add(m)
      for (const h of data.history ?? []) await historyStore.add(h)
      for (const p of data.progress ?? []) await progressStore.save(p)
      await refreshStats()
      toast.success('Profile imported into IndexedDB')
    } catch {
      toast.error('Invalid export file')
    }
  }

  return (
    <div className="flex flex-col gap-5 pb-6">
      <h1 className="text-2xl font-extrabold tracking-tight text-ink">Settings</h1>

      <Section icon={Palette} subtitle="8 hand-tuned themes — instant switch, saved to this device" title="Theme">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => { setPrefs({ theme: t.id }); toast(`Theme: ${t.name}`, { description: t.description }) }}
              className={cn(
                'group flex flex-col items-start gap-2.5 rounded-2xl border p-3.5 text-left transition-all',
                prefs.theme === t.id
                  ? 'border-rose/60 bg-white/8 shadow-lg'
                  : 'border-white/10 bg-white/4 hover:bg-white/8'
              )}
              aria-pressed={prefs.theme === t.id}
            >
              <span
                className="flex h-9 w-full items-center justify-end rounded-xl px-2"
                style={{ background: `linear-gradient(120deg, ${t.swatch[0]} 0%, ${t.swatch[0]} 60%, ${t.swatch[1]}55 100%)`, border: '1px solid rgba(255,255,255,0.1)' }}
              >
                <span className="flex gap-1">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.swatch[1] }} />
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.swatch[2] }} />
                </span>
              </span>
              <span className="flex items-center gap-1.5 text-xs font-extrabold text-ink">
                {t.name}
                <span className={cn('rounded-full px-1.5 py-px text-[8px] font-black uppercase tracking-wider', t.dark ? 'bg-white/10 text-mauve' : 'bg-black/10 text-ink-soft')}>
                  {t.dark ? 'Dark' : 'Light'}
                </span>
              </span>
            </button>
          ))}
        </div>
        <Row label="Glass intensity" hint={`Surface opacity ${Math.round(prefs.glassIntensity * 100)}%`}>
          <Slider
            value={[prefs.glassIntensity * 100]}
            min={20}
            max={90}
            step={5}
            className="w-44"
            onValueChange={([v]) => setPrefs({ glassIntensity: v / 100 })}
            aria-label="Glass intensity"
          />
        </Row>
        <Row label="Animations" hint="Motion, hero rotation and progress ticks">
          <Switch checked={prefs.animations} onCheckedChange={(v) => setPrefs({ animations: v })} aria-label="Toggle animations" />
        </Row>
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Default', a: 0.5 },
            { label: 'Frosted', a: 0.7 },
            { label: 'Ethereal', a: 0.32 },
          ].map((p) => (
            <Chip key={p.label} active={prefs.glassIntensity === p.a} onClick={() => setPrefs({ glassIntensity: p.a })}>
              <span className="flex items-center gap-1.5"><Sparkle size={11} />{p.label}</span>
            </Chip>
          ))}
        </div>
      </Section>

      <Section icon={Tv} title="TV Mode" subtitle="10-foot interface for living-room screens and remotes">
        <Row label="TV Mode" hint="Bigger focus rings, arrow-key spatial navigation, always-visible play buttons">
          <Switch
            checked={prefs.tvMode}
            onCheckedChange={(v) => { setPrefs({ tvMode: v }); toast(v ? 'TV Mode on — use arrow keys + Enter' : 'TV Mode off') }}
            aria-label="Toggle TV Mode"
          />
        </Row>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-mauve">
          <Monitor size={13} className="text-mauve" />
          Works with any remote that emulates arrow keys (most Android TV / Fire TV browsers) — no pairing needed.
        </div>
      </Section>

      <Section icon={Play} title="Playback" subtitle="Player and autoplay behavior">
        <Row label="Autoplay next episode" hint="Episode chaining when one finishes (TV & anime)">
          <Switch checked={prefs.autoplayNext} onCheckedChange={(v) => setPrefs({ autoplayNext: v })} aria-label="Autoplay next" />
        </Row>
        <Row label="Player engine" hint="5 providers × verified mirrors with automatic failover">
          <Chip active>Auto-fallback</Chip>
        </Row>
      </Section>

      <Section icon={ShieldCheck} title="Privacy quick link" subtitle="Ad Shield, Secure DNS, Private Session & data tools live in the Privacy Center">
        <button
          onClick={() => navigate({ name: 'privacy' })}
          className="glass glass-hover flex w-fit items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-ink"
        >
          <ShieldCheck size={15} className="text-mint" /> Open Privacy Center
        </button>
      </Section>

      <PartnerShareSection />

      <Section icon={Database} title="Data & Storage" subtitle="Everything lives in IndexedDB — no account, no server">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { k: 'Cache entries', v: stats.entries },
            { k: 'History items', v: stats.history },
            { k: 'Saved lists', v: stats.lists },
            { k: 'Storage used', v: `${stats.usageMB} MB` },
          ].map((s) => (
            <div key={s.k} className="glass-subtle rounded-2xl p-3.5 text-center">
              <p className="text-xl font-extrabold text-ink">{s.v}</p>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-mauve">{s.k}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button onClick={exportData} className="glass glass-hover flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-ink">
            <Download size={15} /> Export profile
          </button>
          <button onClick={() => fileInput.current?.click()} className="glass glass-hover flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-ink">
            <Upload size={15} /> Import profile
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])}
          />
          <button onClick={clearCache} className="glass glass-hover flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-ink">
            <Trash2 size={15} /> Clear cache
          </button>
        </div>
      </Section>

      <Section icon={Sparkles} title="AI" subtitle="AI augments — it never replaces the local engine">
        <Row label="Enable AI features" hint="Natural language search, AI ranking, mood discovery">
          <Switch checked={prefs.enableAI} onCheckedChange={(v) => setPrefs({ enableAI: v })} aria-label="Enable AI" />
        </Row>
        <Row label="Personalization" hint="Send a minimal anonymized taste profile (genres, decades, ratings) — never raw history">
          <Switch checked={prefs.personalization} onCheckedChange={(v) => setPrefs({ personalization: v })} aria-label="Personalization" />
        </Row>
        <button
          onClick={async () => { await aiStore.clear(); toast.success('AI cache cleared') }}
          className="glass glass-hover flex w-fit items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-ink"
        >
          <Trash2 size={15} /> Clear AI cache
        </button>
      </Section>

      <Section icon={Info} title="About" subtitle="Movies by InvokeIL">
        <div className={cn('flex flex-col gap-3 text-sm leading-relaxed text-ink-soft')}>
          <p className="flex items-center gap-2">
            <BadgeCheck size={16} className="text-mint" />
            Local-first, no-login architecture — IndexedDB → Cloudflare Cache → R2 → External APIs.
          </p>
          <p>
            This product uses the TMDB API but is not endorsed or certified by TMDB.
            OMDb provides secondary metadata enrichment. Playback is served through a
            5-provider auto-fallback engine. AI ranking routes through a multi-provider
            router with graceful fallback to the on-device recommender.
          </p>
          <p className="text-xs text-mauve">
            InvokeIL · CinemaOS UI · Built with Next.js · React · Tailwind · IndexedDB
          </p>
        </div>
      </Section>
    </div>
  )
}

/* ── Partner Share — Duo Watch Party pairing ──────────────────────────
   Generates a fully private invite link (the secret rides in the URL
   fragment and never reaches any server). Regenerating requires the
   partner's permission when they're online — the request travels over
   the end-to-end encrypted channel.                                     */

function PartnerShareSection() {
  const d = useSyncExternalStoreDuo()
  const [showInvite, setShowInvite] = useState(false)
  const [copied, setCopied] = useState(false)
  const [nick, setNick] = useState(() => (typeof window !== 'undefined' ? loadNick() : ''))
  const invite = showInvite && duo.identityInfo ? duo.inviteUrl(duo.identityInfo) : null

  /* host: after the partner approves a regeneration, surface the new link */
  const lastRotated = useRef(0)
  useEffect(() => {
    if (d.inviteRotated > lastRotated.current) {
      lastRotated.current = d.inviteRotated
      queueMicrotask(() => {
        setShowInvite(true)
        toast.success('Link rotated — copy the new private link')
      })
    }
  }, [d.inviteRotated])

  const paired = !!duo.identityInfo?.paired

  const generate = () => {
    duo.generateInvite(nick.trim() || undefined)
    setShowInvite(true)
    toast.success('Private invite link created')
  }

  const regenerate = () => {
    if (d.partnerOnline) {
      duo.requestRegenerate()
      toast.info('Permission request sent to your partner…')
    } else {
      duo.generateInvite(nick.trim() || undefined)
      setShowInvite(true)
      toast.success('New private link created (old link no longer works)')
    }
  }

  const approve = (ok: boolean) => {
    duo.answerRegen(ok)
    if (!ok) toast.info('Denied — the current link stays active')
  }

  return (
    <Section
      icon={Users}
      title="Partner Share"
      subtitle="Duo Watch Party — watch together, time-synced, over a private encrypted tunnel"
    >
      {/* status row */}
      <div className="flex flex-wrap items-center gap-2">
        {paired ? (
          <span className="flex items-center gap-1.5 rounded-full bg-mint/15 px-3 py-1.5 text-xs font-bold text-mint">
            <CheckCircle2 size={13} /> Partner linked on this device
          </span>
        ) : (
          <span className="flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5 text-xs font-bold text-mauve">
            <XCircle size={13} /> No partner linked yet
          </span>
        )}
        {d.wsOnline && (
          <span className="flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5 text-xs font-bold text-mauve">
            <span className={cn('h-1.5 w-1.5 rounded-full', d.partnerOnline ? 'animate-pulse bg-mint' : 'bg-mauve')} />
            {d.partnerOnline ? 'Partner online now' : 'Waiting for partner'}
          </span>
        )}
        {d.call === 'live' && (
          <span className="rounded-full bg-rose/15 px-3 py-1.5 text-xs font-bold text-rose">Tunnel live</span>
        )}
      </div>

      {/* nick */}
      <Row label="Your display name" hint="Shown in the Duo overlay (stays on this device)">
        <input
          value={nick}
          onChange={(e) => {
            setNick(e.target.value)
            saveNick(e.target.value)
          }}
          placeholder="e.g. Ayan"
          maxLength={24}
          className="w-40 rounded-full border border-white/10 bg-white/5 px-3.5 py-2 text-sm font-semibold text-ink placeholder:text-mauve focus:border-rose/40 focus:outline-none"
        />
      </Row>

      {/* actions */}
      {!paired && !invite && (
        <button
          onClick={generate}
          className="glass glass-hover flex w-fit items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-ink"
        >
          <Link2 size={15} className="text-rose" /> Create private invite link
        </button>
      )}

      {paired && !d.regenRequest && (
        <button
          onClick={regenerate}
          className="glass glass-hover flex w-fit items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-ink"
        >
          <RefreshCw size={14} className="text-rose" /> Regenerate link
          {d.partnerOnline && <span className="text-xs font-semibold text-mauve">(needs partner permission)</span>}
        </button>
      )}

      {/* regen approval (partner side) */}
      {d.regenRequest && (
        <div className="rounded-2xl border border-rose/25 bg-rose/5 p-4">
          <p className="text-sm font-bold text-ink">Your partner wants to regenerate the invite link.</p>
          <p className="mt-0.5 text-xs text-mauve">Approving makes your current link invalid and creates a new one.</p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => approve(true)}
              className="rounded-full bg-gradient-rose px-4 py-2 text-xs font-extrabold text-white hover:brightness-110"
            >
              Approve & get new link
            </button>
            <button
              onClick={() => approve(false)}
              className="glass glass-hover rounded-full px-4 py-2 text-xs font-extrabold text-ink"
            >
              Deny
            </button>
          </div>
        </div>
      )}

      {/* the link itself */}
      {invite && (
        <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center">
          <input
            readOnly
            value={invite}
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 rounded-full border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-semibold text-ink"
          />
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(invite)
                setCopied(true)
                toast.success('Link copied — send it only to your partner')
                setTimeout(() => setCopied(false), 2500)
              } catch {
                toast.error('Copy failed — select the text manually')
              }
            }}
            className="flex shrink-0 items-center justify-center gap-2 rounded-full bg-gradient-rose px-4 py-2 text-xs font-extrabold text-white hover:brightness-110"
          >
            {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}

      {/* explainer */}
      <div className="rounded-2xl border border-white/10 bg-black/10 p-4 text-xs leading-relaxed text-mauve">
        <p className="mb-1.5 font-extrabold text-ink">How the private tunnel works</p>
        <p>
          The invite link carries a secret <span className="font-bold text-ink">only in the part after #</span> —
          browsers never send that part to any server. Your partner&apos;s device uses it to prove membership,
          then everything (chat, voice, video) flows directly between the two of you with end-to-end encryption.
          The relay server only sees that two anonymous devices are in the same room — never the secret,
          never a message, never your call.
        </p>
      </div>

      {/* unpair */}
      {paired && (
        <button
          onClick={() => {
            duo.unpair()
            setShowInvite(false)
            toast.info('Partner unlinked from this device')
          }}
          className="w-fit text-xs font-bold text-mauve underline-offset-2 hover:text-rose hover:underline"
        >
          Unlink partner &amp; wipe pairing from this device
        </button>
      )}
    </Section>
  )
}

function useSyncExternalStoreDuo() {
  return useSyncExternalStore(duo.subscribe, duo.getSnapshot, duo.getSnapshot)
}
