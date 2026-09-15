/* ── Duo Watch Party — Durable Object room ────────────────────────────────
   One DuoRoom instance per couple (idFromName(roomId)). The room is a
   THIN, BLIND relay:

     • routes WebSockets  (host ↔ guest, max 2 peers)
     • relays WebRTC SDP/ICE offers so the two browsers can build their own
       DIRECT DTLS-SRTP encrypted channel (chat, voice, video never touch
       this server)
     • caches the host's latest watch-state so a joining partner lands at
       the host's exact position

   Privacy model:
     • the invite secret (pairSecret) lives ONLY in the two browsers — the
       invite link carries it in the URL fragment (#…), which browsers
       never send to servers
     • peers authenticate by presenting proof = SHA-256(pairSecret|roomId);
       the DO stores only that proof — it can verify membership but can
       never derive the secret, join the WebRTC channel, or read chat
     • nothing is persisted except the proof hash + last watch-state blob,
       both wiped when the host clears them

   Uses the WebSocket HIBERNATION API: idle rooms cost nothing (no
   duration billing while hibernating) — the cheapest 2-person design on
   the free plan.                                                          */

/* minimal runtime surfaces (worker has no workers-types dependency) */
interface DOState {
  acceptWebSocket(ws: WebSocket): void
  getWebSockets(): WebSocket[]
  storage: {
    get<T>(key: string): Promise<T | undefined>
    put(key: string, value: unknown): Promise<void>
    delete(key: string): Promise<void>
    deleteAll(): Promise<void>
  }
}
interface DurableSocket extends WebSocket {
  serializeAttachment(a: unknown): void
  deserializeAttachment(): unknown
}
declare const WebSocketPair: { new (): { 0: WebSocket; 1: WebSocket } }

type Role = 'host' | 'guest'
interface PeerMeta {
  role: Role
  proof: string
}

interface WatchState {
  mediaId?: string
  mediaType?: string
  title?: string
  poster?: string
  season?: number
  episode?: number
  providerIdx?: number
  pos?: number
  playing?: boolean
  tSent?: number
}

export class DuoRoom {
  private state: DOState
  private hostProof: string | null = null
  private lastState: WatchState | null = null
  private ready: Promise<void>

  constructor(state: DOState, _env: unknown) {
    this.state = state
    /* hibernation wipes memory — reload the proof + watch-state blob */
    this.ready = (async () => {
      this.hostProof = (await state.storage.get<string>('proof')) ?? null
      this.lastState = (await state.storage.get<WatchState>('state')) ?? null
    })()
  }

  async fetch(req: Request): Promise<Response> {
    await this.ready
    const url = new URL(req.url)
    const role = url.searchParams.get('role') === 'guest' ? 'guest' : 'host'
    const proof = url.searchParams.get('p') ?? ''

    if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('websocket upgrade required', { status: 426 })
    }
    if (!/^[a-zA-Z0-9_-]{8,128}$/.test(proof)) {
      return new Response('bad proof', { status: 403 })
    }

    /* single-host / single-guest rooms — a fresh same-role peer replaces
       the stale one (reconnects, device switches) */
    const existing = this.peer(role)
    if (existing) {
      try { existing.close(4000, 'replaced') } catch { /* already gone */ }
    }

    const pair = new WebSocketPair()
    const meta: PeerMeta = { role, proof }
    this.state.acceptWebSocket(pair[1])
    ;(pair[1] as DurableSocket).serializeAttachment(meta)

    if (role === 'host') {
      const proofChanged = this.hostProof !== proof
      this.hostProof = proof
      if (proofChanged) {
        this.lastState = null
        await this.state.storage.put('proof', proof)
        await this.state.storage.delete('state')
      }
      this.send(pair[1], { t: 'hello-ok', role, guestOnline: !!this.peer('guest') })
      this.sendTo('guest', { t: 'peer-online', role: 'host' })
    } else {
      /* guest must present the proof the host registered. Rejections are
         delivered AFTER the 101 completes (queued) so the client can read
         the error message instead of seeing a raw handshake failure.    */
      if (!this.hostProof) {
        queueMicrotask(() => {
          this.send(pair[1], { t: 'error', msg: 'Host has never connected to this room' })
          try { pair[1].close(4001, 'no-host') } catch { /* ignore */ }
        })
        return new Response(null, { status: 101, webSocket: pair[0] } as ResponseInit & { webSocket: WebSocket })
      }
      if (proof !== this.hostProof) {
        queueMicrotask(() => {
          this.send(pair[1], { t: 'error', msg: 'Invalid invite' })
          try { pair[1].close(4003, 'bad-proof') } catch { /* ignore */ }
        })
        return new Response(null, { status: 101, webSocket: pair[0] } as ResponseInit & { webSocket: WebSocket })
      }
      this.send(pair[1], {
        t: 'hello-ok',
        role,
        hostOnline: !!this.peer('host'),
        state: this.lastState,
      })
      this.sendTo('host', { t: 'peer-online', role: 'guest' })
    }

    return new Response(null, { status: 101, webSocket: pair[0] } as ResponseInit & { webSocket: WebSocket })
  }

  /* ── hibernation callbacks ─────────────────────────────────────────── */

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    await this.ready
    const sock = ws as DurableSocket
    let meta = sock.deserializeAttachment() as PeerMeta | undefined
    if (!meta) return
    let msg: { t?: string; [k: string]: unknown }
    try {
      msg = typeof raw === 'string' ? JSON.parse(raw) : {}
    } catch {
      return
    }
    if (!msg || typeof msg.t !== 'string') return

    switch (msg.t) {
      case 'state': {
        /* host-authoritative watch-state: cache + forward to the guest */
        if (meta.role !== 'host') return
        const st = (msg.state ?? null) as WatchState | null
        this.lastState = st
        await this.state.storage.put('state', st)
        this.sendTo('guest', { t: 'state', state: st })
        return
      }
      case 'signal': {
        /* opaque WebRTC signaling blob — relayed verbatim, never parsed */
        this.sendTo(meta.role === 'host' ? 'guest' : 'host', {
          t: 'signal',
          from: meta.role,
          data: msg.data ?? null,
        })
        return
      }
      case 'regen-req': {
        /* partner-permission flow: host asks, guest approves over the E2E
           channel — the DO just ferries the notification */
        if (meta.role === 'host') this.sendTo('guest', { t: 'regen-req' })
        return
      }
      case 'regen-ack': {
        if (meta.role === 'guest') this.sendTo('host', { t: 'regen-ack' })
        return
      }
      case 'regen-deny': {
        if (meta.role === 'guest') this.sendTo('host', { t: 'regen-deny' })
        return
      }
      case 'wipe': {
        /* host left the title / closed the player → clear watch-state */
        if (meta.role === 'host') {
          this.lastState = null
          await this.state.storage.delete('state')
          this.sendTo('guest', { t: 'state', state: null })
        }
        return
      }
      case 'ping': {
        this.send(ws, { t: 'pong', now: Date.now() })
        return
      }
      default:
        return
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.ready
    const meta = (ws as DurableSocket).deserializeAttachment() as PeerMeta | undefined
    if (!meta) return
    /* notify only if this socket was the ACTIVE peer for its role. The
       closing socket is already CLOSING/CLOSED — so "current" means: no
       OTHER open socket exists for this role (that would be a replacement
       superseding us, and its close must not fake a disconnect).        */
    const replaced = this.state
      .getWebSockets()
      .some((w) => w !== ws && (w as DurableSocket).deserializeAttachment()?.role === meta.role && w.readyState === WebSocket.OPEN)
    if (replaced) return
    if (meta.role === 'host') {
      this.sendTo('guest', { t: 'peer-offline', role: 'host' })
    } else {
      this.sendTo('host', { t: 'peer-offline', role: 'guest' })
    }
  }

  /* ── helpers ───────────────────────────────────────────────────────── */

  private peer(role: Role): DurableSocket | null {
    for (const ws of this.state.getWebSockets()) {
      const m = (ws as DurableSocket).deserializeAttachment() as PeerMeta | undefined
      if (m?.role === role && ws.readyState === WebSocket.OPEN) return ws as DurableSocket
    }
    return null
  }

  private send(ws: WebSocket, msg: unknown) {
    try {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.send(JSON.stringify(msg))
    } catch { /* hibernated peer — ignored */ }
  }

  private sendTo(role: Role, msg: unknown) {
    const ws = this.peer(role)
    if (ws) this.send(ws, msg)
  }
}
