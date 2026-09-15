/* ── Movies by InvokeIL — Ad Shield Service Worker ─────────────────────
   A tiny, transparent request blocker (uBlock-style) that lives entirely
   on YOUR device:

   • Blocks network requests whose HOST matches a user-editable rule list
     (`||doubleclick.net^` syntax, one rule per line).
   • Counts every blocked request and reports the count to the page.
   • NEVER touches same-origin requests (the app + its API are always
     safe) and NEVER sees third-party iframe internals (browser sandbox).

   Rules are pushed from the page after activation via postMessage:
     { type: 'SHIELD_RULES', rules: '||x^ \n ||y^' }
   Stats are read back via:
     { type: 'SHIELD_STATS' }  →  { type: 'SHIELD_STATS', blocked: n }
   Increment push (fire-and-forget from SW):
     { type: 'SHIELD_BLOCKED', total: n }                                */

/* eslint-disable no-restricted-globals */
const self = self

const SAME_ORIGIN_OK = true // same-origin is always allowed through

let rules = []
let blocked = 0

function parseRuleLines(text) {
  const hosts = []
  for (const rawLine of String(text || '').split(/\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('!') || line.startsWith('#')) continue
    // only network rules are enforced here: ||domain^
    const m = line.match(/^\|\|([a-z0-9.-]+)\^?$/i)
    if (m) hosts.push(m[1].toLowerCase())
  }
  return hosts
}

function hostMatches(host) {
  for (const r of rules) {
    if (host === r || host.endsWith('.' + r)) return true
  }
  return false
}

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('message', (event) => {
  const msg = event.data || {}
  if (msg.type === 'SHIELD_RULES') {
    rules = parseRuleLines(msg.rules)
  } else if (msg.type === 'SHIELD_STATS') {
    event.source && event.source.postMessage({ type: 'SHIELD_STATS', blocked })
  } else if (msg.type === 'SHIELD_RESET') {
    blocked = 0
  }
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  let url
  try { url = new URL(req.url) } catch { return }
  if (SAME_ORIGIN_OK && url.origin === self.location.origin) return
  if (rules.length === 0) return
  if (hostMatches(url.hostname)) {
    blocked++
    event.respondWith(new Response('', { status: 200, statusText: 'blocked by InvokeIL Shield', headers: { 'Content-Type': 'text/plain' } }))
    self.clients.matchAll().then((cs) => {
      for (const c of cs) c.postMessage({ type: 'SHIELD_BLOCKED', total: blocked })
    })
  }
})
