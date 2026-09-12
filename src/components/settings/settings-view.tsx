'use client'

import { useEffect, useState, useRef } from 'react'
import {
  Palette, Play, Database, Sparkles, Info, Trash2, Download, Upload,
  GlassWater, Sparkle, BadgeCheck,
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
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

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
  const { prefs, setPrefs } = useApp()
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
    await mediaStore.stats() // noop warm
    await idb.clear('media')
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

      <Section icon={GlassWater} title="Appearance" subtitle="Liquid Glass system — tune it to your taste">
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

      <Section icon={Play} title="Playback" subtitle="Player and autoplay behavior">
        <Row label="Autoplay next episode" hint="VidLink episode chaining when a season ends an episode">
          <Switch checked={prefs.autoplayNext} onCheckedChange={(v) => setPrefs({ autoplayNext: v })} aria-label="Autoplay next" />
        </Row>
        <Row label="Player provider" hint="Adapter pattern — swap providers without touching the UI">
          <Chip active>VidLink</Chip>
        </Row>
      </Section>

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
        <div className={cn('flex flex-col gap-3 text-sm leading-relaxed text-ink/80')}>
          <p className="flex items-center gap-2">
            <BadgeCheck size={16} className="text-mint-deep" />
            Local-first, no-login architecture — IndexedDB → Cloudflare Cache → D1 → External APIs.
          </p>
          <p>
            This product uses the TMDB API but is not endorsed or certified by TMDB.
            OMDb provides secondary metadata enrichment. Playback is served through the
            VidLink provider adapter. AI ranking routes through a multi-provider router
            with graceful fallback to the on-device recommender.
          </p>
          <p className="text-xs text-mauve">
            InvokeIL · Built with React · Next.js · Tailwind · Motion · Dexie-style IndexedDB layer
          </p>
        </div>
      </Section>
    </div>
  )
}
