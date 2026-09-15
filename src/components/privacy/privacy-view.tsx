'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import {
  ShieldCheck, ShieldOff, Globe, Lock, Download, Upload, Trash2,
  Eye, EyeOff, Server, ListFilter, Plus, Loader2, Sparkles, Timer,
} from 'lucide-react'
import type { DnsCheck } from '@/lib/services/shield'
import { useApp } from '@/lib/store'
import {
  DEFAULT_FILTER_LINES, syncShield, queryShieldStats, resetShieldStats,
  onShieldStats, checkSecureDns, enforceCosmetic, parseRules,
} from '@/lib/services/shield'
import { historyStore, progressStore, favoritesStore, watchlistStore, searchStore, mediaStore, aiStore } from '@/lib/db/stores'
import { GlassPanel, GlassButton, Chip, SectionTitle } from '../ui-custom/glass'
import { Switch } from '@/components/ui/switch'
import { cn, setPageTitle } from '@/lib/utils'
import { toast } from 'sonner'

/* ── Privacy Center — the control room for everything local ───────────
   Four stations:
   1. Ad Shield   — built-in uBlock-style blocker, editable rules
   2. Secure DNS  — Cloudflare 1.1.1.1 over HTTPS (DoH) status + guide
   3. Session     — Private Session toggle (pause all recording)
   4. Data Vault  — export / import / wipe every local byte             */

const DNS_GUIDES: { platform: string; steps: string }[] = [
  { platform: 'Windows 10/11', steps: 'Settings → Network & Internet → your connection → DNS server assignment → Edit → Manual → IPv4 On → Preferred DNS 1.1.1.1, Alternate 1.0.0.1. Turn "Preferred DNS encryption" on (DoH).' },
  { platform: 'macOS', steps: 'System Settings → Network → your Wi-Fi → Details → DNS → add 1.1.1.1 and 1.0.0.1. For encrypted DNS install the Cloudflare 1.1.1.1 app or a DoH profile.' },
  { platform: 'iOS / iPadOS', steps: 'Settings → Wi-Fi → (i) next to your network → Configure DNS → Manual → add 1.1.1.1, 1.0.0.1 — or install the 1.1.1.1 app for one-tap WARP + DoH.' },
  { platform: 'Android', steps: 'Settings → Network & Internet → Private DNS → "Private DNS provider hostname" → enter one-dot-one-dot-one-dot-one.cloudflare-dns.com — that gives you encrypted DNS system-wide.' },
  { platform: 'Router (whole home)', steps: 'Router admin → LAN/DHCP → DNS 1 & DNS 2 → 1.1.1.1 and 1.0.0.1. Use 1.1.1.2/1.0.0.2 (or .3) to also block malware (family variant blocks adult sites).' },
]

export function PrivacyView() {
  /* tab title sync */
  useEffect(() => {
    setPageTitle('Privacy Center')
    return () => setPageTitle()
  }, [])
  const { prefs, setPrefs } = useApp()
  const [blocked, setBlocked] = useState(prefs.adShield.blockedCount)
  const [rulesDraft, setRulesDraft] = useState('')
  const [rulesOpen, setRulesOpen] = useState(false)
  const [dns, setDns] = useState<DnsCheck | null>(null)
  const [dnsTesting, setDnsTesting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  /* seed the rules editor with current rules (defaults + custom) */
  useEffect(() => {
    setRulesDraft([...DEFAULT_FILTER_LINES, ...prefs.adShield.customRules].join('\n'))
  }, [])  

  /* live blocked counter from the SW */
  useEffect(() => {
    if (!prefs.adShield.enabled) return
    const off = onShieldStats((total) => {
      setBlocked(total)
      if (total > prefs.adShield.blockedCount) {
        setPrefs({ adShield: { ...prefs.adShield, blockedCount: total } })
      }
    })
    queryShieldStats()
    const iv = setInterval(queryShieldStats, 5000)
    return () => { off(); clearInterval(iv) }
  }, [prefs.adShield, setPrefs])

  const setShield = (enabled: boolean) => {
    const next = { ...prefs.adShield, enabled }
    setPrefs({ adShield: next })
    void syncShield(next)
    toast(enabled ? 'Ad Shield armed — filter list active' : 'Ad Shield disarmed', {
      description: enabled ? 'Requests matching your rules are blocked on this device.' : undefined,
    })
  }

  const saveRules = () => {
    const defaults = DEFAULT_FILTER_LINES.map((d) => d.trim())
    const custom = rulesDraft
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('!'))
      .filter((l) => !defaults.includes(l))
    const next = { ...prefs.adShield, customRules: custom }
    setPrefs({ adShield: next })
    enforceCosmetic(custom)
    void syncShield(next)
    const parsed = parseRules([...DEFAULT_FILTER_LINES, ...custom])
    toast('Filter list saved', {
      description: `${parsed.networkHosts.length} network rules · ${parsed.cosmetic.length} cosmetic rules`,
    })
  }

  const addQuickRule = (line: string) => {
    if (prefs.adShield.customRules.includes(line)) return
    const custom = [...prefs.adShield.customRules, line]
    const next = { ...prefs.adShield, customRules: custom }
    setPrefs({ adShield: next })
    setRulesDraft((d) => `${d}\n${line}`)
    void syncShield(next)
    toast(`Rule added: ${line}`)
  }

  const testDns = useCallback(async () => {
    setDnsTesting(true)
    setDns(null)
    const r = await checkSecureDns()
    setDns(r)
    setDnsTesting(false)
  }, [])

  const exportData = async () => {
    setExporting(true)
    try {
      const [history, favorites, watchlist, recentSearches] = await Promise.all([
        historyStore.all(), favoritesStore.all(), watchlistStore.all(), searchStore.recent(),
      ])
      const blob = new Blob(
        [JSON.stringify({ app: 'Movies by InvokeIL', exportedAt: new Date().toISOString(), history, favorites, watchlist, recentSearches, prefs }, null, 2)],
        { type: 'application/json' },
      )
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `invokeil-movies-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Backup downloaded — everything in one JSON file')
    } catch {
      toast.error('Export failed')
    } finally {
      setExporting(false)
    }
  }

  const importData = async (file: File) => {
    setImporting(true)
    try {
      const text = await file.text()
      const j = JSON.parse(text) as {
        history?: Parameters<typeof historyStore.add>[0][]
        favorites?: Parameters<typeof favoritesStore.add>[0][]
        watchlist?: Parameters<typeof watchlistStore.add>[0][]
        recentSearches?: string[]
        prefs?: Parameters<typeof setPrefs>[0]
      }
      let n = 0
      for (const h of j.history ?? []) { if (h?.mediaId) { await historyStore.add(h); n++ } }
      for (const m of j.favorites ?? []) { if (m?.id) { await favoritesStore.add(m); n++ } }
      for (const m of j.watchlist ?? []) { if (m?.id) { await watchlistStore.add(m); n++ } }
      for (const q of j.recentSearches ?? []) { await searchStore.add(q); n++ }
      if (j.prefs) setPrefs(j.prefs)
      toast.success(`Imported ${n} items + settings`)
    } catch {
      toast.error('Import failed — is that a backup file from this app?')
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const wipeAll = async () => {
    await Promise.all([
      historyStore.clear(), progressStore.clear(), favoritesStore.clear(),
      watchlistStore.clear(), searchStore.clear(), aiStore.clear(),
      mediaStore.clear(),
    ])
    toast.success('All local data wiped — you start fresh')
  }

  return (
    <div className="flex flex-col gap-6 pb-6">
      <SectionTitle
        title="Privacy Center"
        subtitle="Local-first by design — nothing leaves this device unless you ask. One toggle each, plain-language everywhere."
      />

      {/* 1 — Ad Shield */}
      <GlassPanel className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <span className={cn('glass flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl', prefs.adShield.enabled ? 'text-mint' : 'text-mauve')}>
              {prefs.adShield.enabled ? <ShieldCheck size={22} /> : <ShieldOff size={22} />}
            </span>
            <div className="max-w-xl">
              <h2 className="flex items-center gap-2 text-lg font-extrabold text-ink">
                Ad Shield
                <span className={cn('rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-widest', prefs.adShield.enabled ? 'bg-mint/15 text-mint' : 'bg-white/10 text-mauve')}>
                  {prefs.adShield.enabled ? 'On' : 'Off'}
                </span>
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-mauve">
                A built-in, uBlock-style request blocker that lives entirely on your device.
                It blocks ad &amp; tracker domains before they load, using an editable rule list —
                the same <code className="rounded bg-white/10 px-1 font-mono text-[11px]">||domain^</code> syntax you know.
              </p>
            </div>
          </div>
          <Switch checked={prefs.adShield.enabled} onCheckedChange={setShield} aria-label="Toggle Ad Shield" />
        </div>

        {prefs.adShield.enabled && (
          <div className="mt-5 grid gap-3 border-t border-white/8 pt-5 sm:grid-cols-3">
            <div className="glass-subtle rounded-2xl p-4">
              <p className="text-2xl font-black text-mint">{blocked.toLocaleString()}</p>
              <p className="mt-0.5 text-xs font-bold uppercase tracking-wider text-mauve">Requests blocked</p>
            </div>
            <div className="glass-subtle rounded-2xl p-4">
              <p className="text-2xl font-black text-ink">
                {parseRules([...DEFAULT_FILTER_LINES, ...prefs.adShield.customRules]).networkHosts.length}
              </p>
              <p className="mt-0.5 text-xs font-bold uppercase tracking-wider text-mauve">Network rules</p>
            </div>
            <div className="glass-subtle rounded-2xl p-4">
              <p className="text-2xl font-black text-ink">
                {parseRules([...DEFAULT_FILTER_LINES, ...prefs.adShield.customRules]).cosmetic.length}
              </p>
              <p className="mt-0.5 text-xs font-bold uppercase tracking-wider text-mauve">Cosmetic rules</p>
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <GlassButton variant={rulesOpen ? 'glass' : 'rose'} onClick={() => setRulesOpen((o) => !o)}>
            <ListFilter size={15} /> {rulesOpen ? 'Hide filter editor' : 'Edit filter list'}
          </GlassButton>
          {prefs.adShield.enabled && (
            <GlassButton
              variant="ghost"
              onClick={() => {
                resetShieldStats()
                setBlocked(0)
                const next = { ...prefs.adShield, blockedCount: 0 }
                setPrefs({ adShield: next })
              }}
            >
              <Timer size={15} /> Reset counter
            </GlassButton>
          )}
        </div>

        {rulesOpen && (
          <div className="mt-4 flex flex-col gap-3">
            <textarea
              value={rulesDraft}
              onChange={(e) => setRulesDraft(e.target.value)}
              spellCheck={false}
              rows={10}
              className="scrollbar-thin max-h-80 min-h-52 w-full resize-y rounded-2xl border border-white/10 bg-black/30 p-4 font-mono text-xs leading-relaxed text-ink outline-none focus:border-rose/50"
              aria-label="Ad Shield filter rules"
            />
            <div className="flex flex-wrap items-center gap-2">
              <GlassButton variant="rose" onClick={saveRules}><Plus size={15} /> Save list</GlassButton>
              <button
                onClick={() => setRulesDraft([...DEFAULT_FILTER_LINES, ...prefs.adShield.customRules].join('\n'))}
                className="rounded-full px-3.5 py-1.5 text-xs font-bold text-mauve hover:text-ink"
              >
                Restore defaults
              </button>
              <span className="text-[11px] leading-snug text-mauve">
                Network: <code className="rounded bg-white/10 px-1 font-mono">||doubleclick.net^</code> ·
                Cosmetic (this app only): <code className="rounded bg-white/10 px-1 font-mono">##.ad-banner</code> ·
                Comments: <code className="rounded bg-white/10 px-1 font-mono">! note</code>
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-white/8 pt-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-mauve">Quick add:</span>
              {['||googletagmanager.com^', '||scorecardresearch.com^', '##[class*="banner-ad"]'].map((r) => (
                <Chip key={r} onClick={() => addQuickRule(r)}>{r}</Chip>
              ))}
            </div>
          </div>
        )}

        <p className="mt-4 rounded-2xl bg-white/5 p-3.5 text-[11px] leading-relaxed text-mauve">
          <ShieldCheck size={12} className="mr-1 inline text-mint" />
          <b className="text-ink-soft">Honest scope:</b> the Shield filters requests made by this app&apos;s own pages.
          Video provider iframes (VidLink etc.) are cross-origin — browsers sandbox them from any website,
          including ours. For those, use DNS-level blocking below (1.1.1.3 blocks ad domains system-wide).
        </p>
      </GlassPanel>

      {/* 2 — Secure DNS */}
      <GlassPanel className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <span className="glass flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-rose">
              <Globe size={22} />
            </span>
            <div className="max-w-xl">
              <h2 className="text-lg font-extrabold text-ink">Cloudflare Secure DNS (1.1.1.1)</h2>
              <p className="mt-1 text-sm leading-relaxed text-mauve">
                Encrypted DNS stops your internet provider from logging which sites you visit.
                Run the in-app check to see if Cloudflare&apos;s encrypted resolver is reachable from
                this network, then follow the 60-second guide for your device.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {dnsTesting ? (
              <span className="flex items-center gap-2 text-xs font-bold text-mauve"><Loader2 size={14} className="animate-spin" /> Testing…</span>
            ) : dns ? (
              <span className={cn('flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-extrabold', dns.ok ? 'bg-mint/15 text-mint' : 'bg-rose/15 text-rose')}>
                {dns.ok ? `DoH OK · ${dns.ms} ms` : 'DoH unreachable'}
              </span>
            ) : null}
            <GlassButton variant="rose" onClick={testDns} disabled={dnsTesting}>
              <Server size={15} /> Run DNS check
            </GlassButton>
          </div>
        </div>

        {dns?.ok && dns.answer && (
          <p className="mt-3 text-[11px] text-mauve">
            Resolved <code className="rounded bg-white/10 px-1 font-mono">movies.invokeil.cfd</code> → <b className="text-ink-soft">{dns.answer}</b> in {dns.ms} ms via Cloudflare 1.1.1.1.
          </p>
        )}
        {dns && !dns.ok && (
          <p className="mt-3 text-[11px] text-mauve">
            The DoH endpoint couldn&apos;t be reached ({dns.error}). Some networks block it — the setup guides below still work via the WARP app or system DNS.
          </p>
        )}

        <div className="mt-5 grid gap-3 border-t border-white/8 pt-5 md:grid-cols-2">
          {DNS_GUIDES.map((g) => (
            <div key={g.platform} className="glass-subtle rounded-2xl p-4">
              <p className="text-sm font-extrabold text-ink">{g.platform}</p>
              <p className="mt-1 text-xs leading-relaxed text-mauve">{g.steps}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[11px] leading-relaxed text-mauve">
          <b className="text-ink-soft">Family-safe variant:</b> use <code className="rounded bg-white/10 px-1 font-mono">1.1.1.3</code> (or <code className="rounded bg-white/10 px-1 font-mono">1.0.0.3</code>) instead —
          it blocks malware <i>and</i> adult content across every app on the device. DNS is applied at the OS/router
          level; no app can force-override it for you.
        </p>
      </GlassPanel>

      {/* 3 — Private Session */}
      <GlassPanel className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <span className="glass flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-ink-soft">
              {prefs.privateSession ? <EyeOff size={22} className="text-rose" /> : <Eye size={22} />}
            </span>
            <div className="max-w-xl">
              <h2 className="flex items-center gap-2 text-lg font-extrabold text-ink">
                Private Session
                {prefs.privateSession && (
                  <span className="rounded-full bg-rose/15 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-widest text-rose">Recording paused</span>
                )}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-mauve">
                While on, nothing new is written to your watch history, continue-watching progress
                or search history. Recommendations stay frozen at whatever they were before.
                One tap when you&apos;re done — like incognito, but for this app.
              </p>
            </div>
          </div>
          <Switch
            checked={prefs.privateSession}
            onCheckedChange={(v) => { setPrefs({ privateSession: v }); toast(v ? 'Private Session on — nothing new is recorded' : 'Private Session off — recording resumed') }}
            aria-label="Toggle Private Session"
          />
        </div>
      </GlassPanel>

      {/* 4 — Data Vault */}
      <GlassPanel className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <span className="glass flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-mint">
              <Lock size={22} />
            </span>
            <div className="max-w-xl">
              <h2 className="text-lg font-extrabold text-ink">Local Data Vault</h2>
              <p className="mt-1 text-sm leading-relaxed text-mauve">
                Your library, history and settings live in this browser&apos;s IndexedDB — no account,
                no cloud, no sync. Export a portable backup file, restore it on any device, or wipe
                everything in one tap.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <GlassButton onClick={exportData} disabled={exporting}>
              <Download size={15} /> {exporting ? 'Exporting…' : 'Export backup'}
            </GlassButton>
            <GlassButton onClick={() => fileRef.current?.click()} disabled={importing}>
              <Upload size={15} /> {importing ? 'Importing…' : 'Import'}
            </GlassButton>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              aria-label="Import backup file"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void importData(f) }}
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2 border-t border-white/8 pt-5">
          {[
            { label: 'Wipe history', run: () => historyStore.clear() },
            { label: 'Wipe progress', run: () => progressStore.clear() },
            { label: 'Wipe searches', run: () => searchStore.clear() },
            { label: 'Clear cached metadata', run: () => mediaStore.clear() },
            { label: 'Clear AI cache', run: () => aiStore.clear() },
          ].map(({ label, run }) => (
            <button
              key={label}
              onClick={async () => { await run(); toast.success(`${label.replace(/^Wipe |^Clear /, '')} done`) }}
              className="glass-subtle rounded-full px-4 py-2 text-xs font-bold text-ink-soft transition-colors hover:text-rose"
            >
              <Trash2 size={12} className="mr-1.5 inline" /> {label}
            </button>
          ))}
          <button
            onClick={() => { void wipeAll() }}
            className="rounded-full border border-rose/40 bg-rose/10 px-4 py-2 text-xs font-extrabold text-rose transition-colors hover:bg-rose/20"
          >
            <Trash2 size={12} className="mr-1.5 inline" /> Wipe EVERYTHING
          </button>
        </div>
      </GlassPanel>

      {/* What we don't do */}
      <section>
        <SectionTitle title="What this app never does" subtitle="The boring promises that make the fun stuff safe" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { t: 'No accounts, ever', d: 'Nothing to log into, nothing to leak. Your identity is your device.' },
            { t: 'No analytics or telemetry', d: 'Zero beacons, zero pixels. The only network calls are catalog data and artwork.' },
            { t: 'No cloud sync', d: 'Library and progress live in IndexedDB. Export a file if you want them elsewhere.' },
            { t: 'No profiling for sale', d: 'The taste profile is computed on-device and only ever sent anonymized to the AI endpoint when you use AI features.' },
            { t: 'HTTPS + strict referrers', d: 'Everything runs over HTTPS; the player frame sends a minimal referrer.' },
            { t: 'Open about data flows', d: 'Catalog data: movies.invokeil.cfd (TMDB-sourced). Artwork: R2 edge cache. AI: anonymized taste only.' },
          ].map((c) => (
            <div key={c.t} className="glass-subtle rounded-2xl p-4">
              <p className="flex items-center gap-2 text-sm font-extrabold text-ink">
                <Sparkles size={13} className="text-mint" /> {c.t}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-mauve">{c.d}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
