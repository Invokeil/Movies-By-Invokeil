'use client'

/* ── Shield + Privacy service (page side) ─────────────────────────────
   Owns the built-in Ad Shield lifecycle:

   1. Filter engine — parses uBlock-style lines:
        ||doubleclick.net^          network rule (host block via SW)
        ##.ad-banner                cosmetic rule (CSS hide, this app only)
        example.com##.selector      cosmetic rule scoped to a host
        ! comment / # comment       ignored
   2. SW registration — /shield-sw.js receives the merged rule list via
      postMessage and blocks matching third-party GET requests.
   3. Stats — blocked count flows back via postMessage; mirrored to prefs.
   4. Cosmetic enforcement — hides matched selectors in this document.
   5. Cloudflare DoH check — queries 1.1.1.1 over HTTPS-JSON to verify a
      private, encrypted DNS path is available on this network.

   Scope honesty (also shown in the UI): the Shield blocks requests made
   by THIS app's own pages. Cross-origin player iframes are browser-
   sandboxed; their internals cannot be modified by any website — the
   player itself is ad-managed by its provider.                         */

import type { AdShieldPrefs } from '../db/stores'

/* Curated defaults — common ad / tracker / telemetry hosts (no bloat) */
export const DEFAULT_FILTER_LINES: string[] = [
  '! InvokeIL Shield — default filter list (editable)',
  '! Network rules: ||domain^ — cosmetic: ##selector',
  '||doubleclick.net^',
  '||googlesyndication.com^',
  '||googletagservices.com^',
  '||google-analytics.com^',
  '||analytics.google.com^',
  '||googletagmanager.com^',
  '||adservice.google.com^',
  '||pagead2.googlesyndication.com^',
  '||connect.facebook.net^',
  '||facebook.com/tr^',
  '||graph.facebook.com^',
  '||scorecardresearch.com^',
  '||quantserve.com^',
  '||quantcount.com^',
  '||adnxs.com^',
  '||adsystem.amazon.com^',
  '||amazon-adsystem.com^',
  '||criteo.com^',
  '||criteo.net^',
  '||taboola.com^',
  '||outbrain.com^',
  '||pubmatic.com^',
  '||rubiconproject.com^',
  '||openx.net^',
  '||moatads.com^',
  '||ads.yahoo.com^',
  '||hotjar.com^',
  '||mixpanel.com^',
  '||segment.io^',
  '||segment.com^',
  '||amplitude.com^',
  '||fullstory.com^',
  '||clarity.ms^',
  '||bat.bing.com^',
  '||snap.licdn.com^',
  '||tiktok.com/i18n^',
  '||cdn.onesignal.com^',
  '||onesignal.com^',
]

export interface ParsedRules {
  networkHosts: string[]
  cosmetic: { host: string | null; selector: string }[]
}

export function parseRules(lines: string[]): ParsedRules {
  const networkHosts: string[] = []
  const cosmetic: { host: string | null; selector: string }[] = []
  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith('!') || line.startsWith('#')) continue
    const net = line.match(/^\|\|([a-z0-9.-]+)\^?$/i)
    if (net) {
      networkHosts.push(net[1].toLowerCase())
      continue
    }
    const cos = line.match(/^(?:([a-z0-9.-]+)\^*)?##(.+)$/i)
    if (cos && cos[2]) {
      const host = cos[1] ? cos[1].toLowerCase() : null
      cosmetic.push({ host, selector: cos[2].trim() })
    }
  }
  return { networkHosts, cosmetic }
}

/* ── SW lifecycle ───────────────────────────────────────────────────── */

let swReg: ServiceWorkerRegistration | null = null
let statsHandler: ((total: number) => void) | null = null

function fullFilterText(custom: string[]): string {
  return [...DEFAULT_FILTER_LINES, ...custom].join('\n')
}

export async function syncShield(prefs: AdShieldPrefs): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

  if (!prefs.enabled) {
    /* off → unregister so zero fetch interception happens */
    try {
      const reg = await navigator.serviceWorker.getRegistration('/shield-sw.js')
      if (reg) await reg.unregister()
    } catch { /* ignore */ }
    swReg = null
    applyCosmetic([]) // clear cosmetic hides
    return
  }

  try {
    swReg = await navigator.serviceWorker.register('/shield-sw.js', { scope: '/' })
    await navigator.serviceWorker.ready
    const pushRules = () => {
      swReg?.active?.postMessage({ type: 'SHIELD_RULES', rules: fullFilterText(prefs.customRules) })
    }
    pushRules()
    /* SW updates (new deploy) re-push rules on activation */
    swReg.addEventListener?.('updatefound', () => {
      const nw = swReg?.installing
      nw?.addEventListener('statechange', () => {
        if (nw.state === 'activated') pushRules()
      })
    })
  } catch {
    /* SW unavailable (private mode, sandbox) — shield silently inactive */
  }
}

export function onShieldStats(handler: (total: number) => void): () => void {
  statsHandler = handler
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return () => {}
  const listener = (e: MessageEvent) => {
    const d = e.data || {}
    if (d.type === 'SHIELD_STATS' && typeof d.blocked === 'number') handler(d.blocked)
    if (d.type === 'SHIELD_BLOCKED' && typeof d.total === 'number') handler(d.total)
  }
  navigator.serviceWorker.addEventListener('message', listener)
  return () => {
    navigator.serviceWorker.removeEventListener('message', listener)
    if (statsHandler === handler) statsHandler = null
  }
}

export function queryShieldStats(): void {
  swReg?.active?.postMessage({ type: 'SHIELD_STATS' })
}

export function resetShieldStats(): void {
  swReg?.active?.postMessage({ type: 'SHIELD_RESET' })
}

/* ── Cosmetic filtering (this document only) ────────────────────────── */

let cosmeticStyle: HTMLStyleElement | null = null

export function applyCosmetic(cosmetic: { host: string | null; selector: string }[]) {
  if (typeof document === 'undefined') return
  if (!cosmeticStyle) {
    cosmeticStyle = document.createElement('style')
    cosmeticStyle.id = 'il-shield-cosmetic'
    document.head.appendChild(cosmeticStyle)
  }
  const here = location.hostname
  const lines = cosmetic
    .filter((r) => !r.host || here === r.host || here.endsWith('.' + r.host))
    .filter((r) => r.selector.length < 300 && !/[{}@]/.test(r.selector)) // stay declarative & safe
    .map((r) => `${r.selector}{display:none !important}`)
  cosmeticStyle.textContent = lines.join('\n')
}

/** Parse + apply cosmetic rules for the current prefs (called by UI) */
export function enforceCosmetic(custom: string[]) {
  applyCosmetic(parseRules([...DEFAULT_FILTER_LINES, ...custom]).cosmetic)
}

/* ── Cloudflare Secure DNS (DoH) connectivity test ──────────────────── */

export interface DnsCheck {
  ok: boolean
  ms: number
  resolver: string
  answer?: string
  error?: string
}

/** Query Cloudflare 1.1.1.1 via DoH-JSON to verify encrypted DNS works. */
export async function checkSecureDns(name = 'movies.invokeil.cfd'): Promise<DnsCheck> {
  const t0 = performance.now()
  try {
    const ctrl = new AbortController()
    const kill = setTimeout(() => ctrl.abort(), 5000)
    const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=A`, {
      headers: { accept: 'application/dns-json' },
      signal: ctrl.signal,
    })
    clearTimeout(kill)
    if (!r.ok) return { ok: false, ms: Math.round(performance.now() - t0), resolver: 'Cloudflare 1.1.1.1', error: `HTTP ${r.status}` }
    const j = (await r.json()) as { Answer?: { data: string }[] }
    return {
      ok: true,
      ms: Math.round(performance.now() - t0),
      resolver: 'Cloudflare 1.1.1.1',
      answer: j.Answer?.find((a) => /^\d+\.\d+\.\d+\.\d+$/.test(a.data))?.data,
    }
  } catch (e) {
    return {
      ok: false,
      ms: Math.round(performance.now() - t0),
      resolver: 'Cloudflare 1.1.1.1',
      error: e instanceof Error ? e.message : 'unreachable',
    }
  }
}

/** Best-effort local IP guess via DoH PTR is overkill; expose nothing.
    Privacy: this module never exfiltrates anything — all checks are
    one-shot HTTPS GETs the user explicitly triggers in the UI. */
