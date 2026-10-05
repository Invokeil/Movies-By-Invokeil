/* ── Duo protocol smoke test (live worker) ────────────────────────────────
   Simulates both partners at the WebSocket protocol level and verifies:
     1. host hello-ok
     2. guest join with CORRECT proof   → hello-ok + cached state
     3. guest join with WRONG proof     → error + close
     4. host → guest watch-state relay
     5. WebRTC signaling relay (both directions)
     6. peer-offline on disconnect

   Run: bun scripts/duo-smoke.ts [origin]
   Origin defaults to https://movies.invokeil.cfd                     */

import { createHash } from 'node:crypto'

const ORIGIN = process.argv[2] ?? 'https://movies.invokeil.cfd'
const roomId = Array.from(crypto.getRandomValues(new Uint8Array(12)))
  .map((b) => b.toString(36))
  .join('')
  .replace(/[^a-zA-Z0-9_-]/g, '')
  .slice(0, 20)
const pairSecret = 'smoke-' + roomId

const proof = createHash('sha256')
  .update(`${pairSecret}|${roomId}`)
  .digest('hex')
  .slice(0, 48)
const wrongProof = 'f'.repeat(48)

const wsBase = ORIGIN.replace(/^http/, 'ws')
let pass = 0
let fail = 0
const ok = (name: string, cond: boolean) => {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name}`)
  }
}

function connect(role: 'host' | 'guest', p: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${wsBase}/api/duo/ws?room=${roomId}&role=${role}&p=${p}`)
    const msgs: any[] = []
    let opened = false
    ws.addEventListener('message', (ev) => msgs.push(JSON.parse(String(ev.data))))
    const api = Object.assign(ws, { msgs, waitFor: (t: string, timeout = 8000, fromIdx = 0) =>
      new Promise<any>((res, rej) => {
        const found = msgs.slice(fromIdx).find((m) => m.t === t)
        if (found) return res(found)
        const iv = setInterval(() => {
          const f = msgs.slice(fromIdx).find((m) => m.t === t)
          if (f) { clearInterval(iv); res(f) }
        }, 120)
        setTimeout(() => { clearInterval(iv); rej(new Error(`timeout waiting ${t}`)) }, timeout)
      }),
    })
    ws.addEventListener('open', () => {
      opened = true
      resolve(api as unknown as WebSocket)
    })
    /* a DO-initiated close (rejections use 4xxx codes) surfaces as an
       error in bun AFTER the handshake — only treat pre-open errors as
       failures */
    ws.addEventListener('error', () => {
      if (!opened) reject(new Error('ws error'))
    })
  })
}

console.log(`→ smoke room: ${roomId}\n`)

/* 1 — host connects */
const host = await connect('host', proof)
ok('host connected (websocket upgrade through worker → DO)', host.readyState === WebSocket.OPEN)
const hostHello = await (host as any).waitFor('hello-ok')
ok('host hello-ok', hostHello.role === 'host')

/* 2 — state relay: host publishes, guest (joined later) receives cache */
await host.send(JSON.stringify({
  t: 'state',
  state: { mediaId: 'movie-27205', title: 'Inception', pos: 300, playing: true, providerIdx: 0, tSent: Date.now() },
}))
await new Promise((r) => setTimeout(r, 500))

/* 3 — guest with WRONG proof is rejected */
const bad = await connect('guest', wrongProof)
const badErr = await (bad as any).waitFor('error')
ok('wrong-proof guest rejected', String(badErr.msg).length > 0)
await new Promise((r) => setTimeout(r, 300))
ok('wrong-proof socket closed by DO', bad.readyState !== WebSocket.OPEN)

/* 4 — guest with CORRECT proof joins + receives cached watch-state */
const guest = await connect('guest', proof)
const guestHello = await (guest as any).waitFor('hello-ok')
ok('guest hello-ok', guestHello.role === 'guest')
ok('host online reported to guest', guestHello.hostOnline === true)
ok('cached watch-state delivered on join', guestHello.state?.mediaId === 'movie-27205' && guestHello.state.pos === 300)

/* host sees the guest come online */
const hostPeer = await (host as any).waitFor('peer-online')
ok('host notified: peer-online', hostPeer.role === 'guest')

/* 5 — signaling relay both ways */
guest.send(JSON.stringify({ t: 'signal', data: { sdp: { type: 'answer', sdp: 'X' } } }))
const sigAtHost = await (host as any).waitFor('signal')
ok('signal guest → host relayed', sigAtHost.from === 'guest' && sigAtHost.data?.sdp?.type === 'answer')
host.send(JSON.stringify({ t: 'signal', data: { ice: 'candidate-1' } }))
const sigAtGuest = await (guest as any).waitFor('signal')
ok('signal host → guest relayed', sigAtGuest.from === 'host' && sigAtGuest.data?.ice === 'candidate-1')

/* 6 — live state update relay */
host.send(JSON.stringify({ t: 'state', state: { mediaId: 'movie-27205', pos: 420, playing: true, tSent: Date.now() } }))
const st = await (guest as any).waitFor('state')
ok('live watch-state relay (pos 300 → 420)', st.state?.pos === 420)

/* 7 — wipe */
const beforeWipe = (guest as any).msgs.length
host.send(JSON.stringify({ t: 'wipe' }))
const wiped = await (guest as any).waitFor('state', 8000, beforeWipe)
ok('wipe clears guest state', wiped.state === null)

/* 8 — guest disconnect → host gets peer-offline */
const beforeClose = (host as any).msgs.length
guest.close()
const offline = await (host as any).waitFor('peer-offline', 8000, beforeClose)
ok('host notified: peer-offline', offline.role === 'guest')

host.close()

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'}: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
