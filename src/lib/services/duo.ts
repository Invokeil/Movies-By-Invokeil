'use client'

/* ── DuoService — two-person watch-together over a private tunnel ────────
   Architecture (privacy-first):

     Pairing   invite link carries the pair secret in the URL FRAGMENT
               (#…) — browsers never send fragments to any server, so the
               secret exists only inside the two partners' browsers.
     Presence  a Cloudflare Durable Object room relays WebSocket presence
               + the host's watch-state. Peers authenticate with
               proof = SHA-256(secret|roomId); the relay sees the proof
               but can never invert it.
     Tunnel    WebRTC peer-to-peer (DTLS-SRTP by default). Chat messages
               are additionally AES-GCM encrypted with a key derived from
               the pair secret — even a relay that broke WebRTC would only
               see ciphertext. Voice/video get spatial (HRTF) mixing.
     Sync      the host publishes {title, position, playing} heartbeats;
               the guest auto-jumps to the host's exact time on join and
               can re-jump whenever drift grows.

   All state lives in memory/localStorage. Nothing about the Duo session
   (chat text, call history, watch positions) is persisted server-side. */

import { PROVIDERS } from './player'

/* ── identity ────────────────────────────────────────────────────────── */

export interface DuoIdentity {
  roomId: string // room key in the DO namespace (public)
  pairSecret: string // shared secret — NEVER leaves the two devices
  isHost: boolean // true = generated the invite
  createdAt: number
  paired: boolean // partner completed joining at least once
  nick: string
}

const ID_KEY = 'il:duo:identity'
const NICK_KEY = 'il:duo:nick'
const HOST_LOCK = 'il:duo:host-lock'

function randId(bytes: number): string {
  const b = new Uint8Array(bytes)
  crypto.getRandomValues(b)
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function loadIdentity(): DuoIdentity | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(ID_KEY)
    if (!raw) return null
    const id = JSON.parse(raw) as DuoIdentity
    return id.roomId && id.pairSecret ? id : null
  } catch {
    return null
  }
}

function saveIdentity(id: DuoIdentity | null) {
  if (typeof window === 'undefined') return
  try {
    if (id) localStorage.setItem(ID_KEY, JSON.stringify(id))
    else localStorage.removeItem(ID_KEY)
  } catch { /* private mode */ }
}

export function loadNick(): string {
  if (typeof window === 'undefined') return ''
  try { return localStorage.getItem(NICK_KEY) ?? '' } catch { return '' }
}
export function saveNick(n: string) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(NICK_KEY, n) } catch { /* ignore */ }
}

/* proof = SHA-256(secret|room) — the ONLY trace of the secret the relay sees */
async function proofOf(roomId: string, secret: string): Promise<string> {
  const data = new TextEncoder().encode(`${secret}|${roomId}`)
  const hex = [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('')
  return hex.slice(0, 48)
}

/* ── chat crypto (AES-GCM over the DataChannel) ──────────────────────── */

let chatKeyP: Promise<CryptoKey> | null = null
function chatKey(secret: string): Promise<CryptoKey> {
  if (!chatKeyP) {
    chatKeyP = (async () => {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${secret}|chat-key`))
      return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt'])
    })()
  }
  return chatKeyP
}

async function seal(text: string, secret: string): Promise<{ i: string; c: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await chatKey(secret),
    new TextEncoder().encode(text),
  )
  return {
    i: btoa(String.fromCharCode(...iv)),
    c: btoa(String.fromCharCode(...new Uint8Array(ct))),
  }
}

async function unseal(m: { i: string; c: string }, secret: string): Promise<string | null> {
  try {
    const iv = Uint8Array.from(atob(m.i), (ch) => ch.charCodeAt(0))
    const ct = Uint8Array.from(atob(m.c), (ch) => ch.charCodeAt(0))
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await chatKey(secret), ct)
    return new TextDecoder().decode(pt)
  } catch {
    return null
  }
}

/* ── public state shape ──────────────────────────────────────────────── */

export interface DuoChatMsg {
  from: 'me' | 'partner'
  text: string
  at: number
}

export interface WatchState {
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
  dur?: number
}

export interface DuoState {
  paired: boolean
  isHost: boolean
  wsOnline: boolean
  partnerOnline: boolean
  call: 'idle' | 'connecting' | 'live'
  voiceOn: boolean
  videoOn: boolean
  spatial: boolean
  chat: DuoChatMsg[]
  unread: number
  chatOpen: boolean
  hostState: WatchState | null // last known watch-state of the HOST (guest side)
  drift: number | null // seconds — local vs host (guest side)
  jumpTick: number // increments → watch-view reloads at host position
  regenRequest: boolean // partner asks permission to regenerate the link
  inviteRotated: number // increments when the host rotates the invite (new link ready)
  error: string | null
  version: number
}

const EMPTY: DuoState = {
  paired: false,
  isHost: true,
  wsOnline: false,
  partnerOnline: false,
  call: 'idle',
  voiceOn: false,
  videoOn: false,
  spatial: true,
  chat: [],
  unread: 0,
  chatOpen: false,
  hostState: null,
  drift: null,
  jumpTick: 0,
  regenRequest: false,
  inviteRotated: 0,
  error: null,
  version: 0,
}

/* ── service ─────────────────────────────────────────────────────────── */

const STUN: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: ['stun:stun.cloudflare.com:3478'] },
]

class DuoService {
  private state: DuoState = { ...EMPTY, chat: [] }
  private listeners = new Set<() => void>()
  private identity: DuoIdentity | null = null
  private ws: WebSocket | null = null
  private wsTimer: ReturnType<typeof setTimeout> | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private rtt = 0
  private permanentReject = false // invalid invite → never reconnect
  private tabId = randId(6) // per-tab id — arbitrates the host role across tabs

  private pc: RTCPeerConnection | null = null
  private dc: DataChannel | null = null
  private makingOffer = false
  private ignoreOffer = false
  private localStream: MediaStream | null = null
  private audioCtx: AudioContext | null = null
  private panner: PannerNode | null = null
  private remoteSrc: MediaStreamAudioSourceNode | null = null
  private remoteVideoStream: MediaStream | null = null

  private lastPublished: string | null = null
  private localPlayback: { pos: number; playing: boolean; providerIdx: number; dur: number } = {
    pos: 0,
    playing: false,
    providerIdx: 0,
    dur: 0,
  }

  constructor() {
    this.identity = loadIdentity()
    if (this.identity) {
      this.state = { ...this.state, paired: this.identity.paired, isHost: this.identity.isHost }
    }
  }

  /* react binding */
  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  getSnapshot = (): DuoState => this.state
  private set(patch: Partial<DuoState>) {
    this.state = { ...this.state, ...patch, version: this.state.version + 1 }
    this.listeners.forEach((l) => l())
  }

  get identityInfo(): DuoIdentity | null {
    return this.identity
  }

  /* ── pairing ─────────────────────────────────────────────────────── */

  /* host side — create a fresh invite. The secret lives in the fragment. */
  generateInvite(nick?: string): string {
    const id: DuoIdentity = {
      roomId: randId(16),
      pairSecret: randId(32),
      isHost: true,
      createdAt: Date.now(),
      paired: false,
      nick: nick ?? loadNick() ?? 'Host',
    }
    this.identity = id
    saveIdentity(id)
    this.teardownRtc()
    this.closeWs()
    this.state = { ...EMPTY, chat: [], paired: false, isHost: true }
    this.set({})
    void this.connect()
    return this.inviteUrl(id)
  }

  inviteUrl(id: DuoIdentity): string {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    return `${origin}/duo/join#r=${id.roomId}&k=${id.pairSecret}`
  }

  /* partner permission flow (host side): ask over the room relay */
  requestRegenerate(): void {
    this.wsSend({ t: 'regen-req' })
    this.set({ error: null })
  }

  /* partner side — approve or decline the regeneration request */
  answerRegen(ok: boolean): void {
    this.set({ regenRequest: false })
    this.wsSend({ t: ok ? 'regen-ack' : 'regen-deny' })
  }

  /* guest side — join from the invite link fragment. */
  async joinFromHash(hash: string, nick?: string): Promise<{ ok: boolean; error?: string }> {
    const m = /r=([a-zA-Z0-9_-]+)&k=([a-zA-Z0-9_-]+)/.exec(hash)
    if (!m) return { ok: false, error: 'Invalid invite link' }
    const [, roomId, pairSecret] = m
    const existing = loadIdentity()
    if (existing && existing.roomId === roomId && existing.pairSecret === pairSecret) {
      this.identity = existing // re-join, nothing to rotate
    } else {
      this.identity = {
        roomId,
        pairSecret,
        isHost: false,
        createdAt: Date.now(),
        paired: false,
        nick: nick ?? loadNick() ?? 'Partner',
      }
      saveIdentity(this.identity)
      this.teardownRtc()
      this.closeWs()
      this.state = { ...EMPTY, chat: [], paired: false, isHost: false }
    }
    this.set({ paired: this.identity.paired, isHost: false })
    return this.connect()
  }

  unpair(): void {
    this.teardownRtc()
    this.closeWs()
    this.identity = null
    saveIdentity(null)
    this.state = { ...EMPTY, chat: [] }
    this.set({})
  }

  /* ── websocket (presence + relay) ────────────────────────────────── */

  async connect(): Promise<{ ok: boolean; error?: string }> {
    if (!this.identity || typeof window === 'undefined') return { ok: false, error: 'Not paired' }
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return { ok: true }
    }
    const { roomId, pairSecret, isHost } = this.identity
    const proof = await proofOf(roomId, pairSecret)
    const proto = location.protocol === 'http:' && /localhost|127\.0\.0\.1/.test(location.hostname) ? 'ws' : 'wss'
    const url = `${proto}://${location.host}/api/duo/ws?room=${encodeURIComponent(roomId)}&role=${isHost ? 'host' : 'guest'}&p=${proof}`

    try {
      const ws = new WebSocket(url)
      this.ws = ws
      this.permanentReject = false
      if (isHost) {
        try { localStorage.setItem(HOST_LOCK, `${this.tabId}:${Date.now()}`) } catch { /* private mode */ }
      }
      this.set({ wsOnline: false, error: null })
      ws.onopen = () => {
        this.set({ wsOnline: true })
        this.startPing()
      }
      ws.onmessage = (ev) => this.onWsMessage(ev.data)
      ws.onclose = () => {
        this.set({ wsOnline: false, partnerOnline: false })
        this.teardownRtc()
        if (!this.permanentReject) this.scheduleReconnect()
      }
      ws.onerror = () => {
        try { ws.close() } catch { /* ignore */ }
      }
      return { ok: true }
    } catch (e) {
      this.set({ error: 'Tunnel unavailable — retrying' })
      this.scheduleReconnect()
      return { ok: false, error: 'connect failed' }
    }
  }

  private scheduleReconnect() {
    if (this.wsTimer || !this.identity) return
    this.wsTimer = setTimeout(() => {
      this.wsTimer = null
      if (!this.identity) return
      /* the pairing may have been replaced/rotated elsewhere in this
         browser (invite opened on the host's own device, link rotation)
         — adopt the stored identity instead of fighting over the room  */
      const stored = loadIdentity()
      if (stored && (stored.roomId !== this.identity.roomId || stored.pairSecret !== this.identity.pairSecret)) {
        this.identity = stored
        this.teardownRtc()
        this.state = { ...EMPTY, chat: [], paired: stored.paired, isHost: stored.isHost }
        this.set({})
      }
      /* host arbitration: another tab of THIS browser currently owns the
         host seat (fresh lock) → stay passive until it lets go */
      if (this.identity.isHost) {
        try {
          const lock = localStorage.getItem(HOST_LOCK) // "tabId:ts"
          const [tid, ts] = lock?.split(':') ?? []
          if (tid && tid !== this.tabId && Date.now() - Number(ts) < 12000) return
        } catch { /* ignore */ }
      }
      void this.connect()
    }, 4000)
  }

  private closeWs() {
    if (this.wsTimer) clearTimeout(this.wsTimer)
    this.wsTimer = null
    if (this.pingTimer) clearInterval(this.pingTimer)
    this.pingTimer = null
    try { this.ws?.close() } catch { /* ignore */ }
    this.ws = null
  }

  private startPing() {
    if (this.pingTimer) clearInterval(this.pingTimer)
    this.lastPongAt = Date.now()
    this.pingTimer = setInterval(() => {
      /* watchdog: a socket can die without ever firing onclose (network
         reset, device sleep). Silence > 70 s → force-close; onclose then
         runs the normal reconnect path. */
      if (Date.now() - this.lastPongAt > 70000) {
        try { this.ws?.close() } catch { /* ignore */ }
        return
      }
      this.lastPingAt = Date.now()
      this.wsSend({ t: 'ping' })
    }, 25000)
  }

  private onWsMessage(raw: string) {
    let msg: { t?: string; [k: string]: unknown }
    try { msg = JSON.parse(raw) } catch { return }
    switch (msg.t) {
      case 'hello-ok': {
        const guestOnline = msg.guestOnline === true
        const hostOnline = msg.hostOnline === true
        /* the relay reports the peer's presence in the handshake itself */
        this.set({ partnerOnline: guestOnline || hostOnline })
        if (this.identity && !this.identity.paired && (guestOnline || hostOnline)) {
          this.identity = { ...this.identity, paired: true }
          saveIdentity(this.identity)
        }
        this.set({ paired: this.identity?.paired ?? false })
        if (msg.state) this.applyHostState(msg.state as WatchState)
        if (this.identity?.isHost && guestOnline) this.beginPeer()
        if (!this.identity?.isHost && hostOnline) this.beginPeer() // offer may already be coming
        break
      }
      case 'peer-online': {
        this.set({ partnerOnline: true })
        if (this.identity && !this.identity.paired) {
          /* first successful contact → the invite worked, mark paired */
          this.identity = { ...this.identity, paired: true }
          saveIdentity(this.identity)
          this.set({ paired: true })
        }
        if (this.identity?.isHost) this.beginPeer() // host always initiates WebRTC
        break
      }
      case 'peer-offline': {
        this.set({ partnerOnline: false })
        this.teardownRtc()
        break
      }
      case 'state': {
        if (msg.state) this.applyHostState(msg.state as WatchState)
        else this.set({ hostState: null, drift: null })
        break
      }
      case 'signal': {
        void this.onSignal(msg.data as SignalData)
        break
      }
      case 'regen-req': {
        this.set({ regenRequest: true })
        break
      }
      case 'regen-ack': {
        /* host: partner approved → rotate now */
        this.identity = this.identity
          ? { ...this.identity, roomId: randId(16), pairSecret: randId(32), createdAt: Date.now() }
          : null
        if (this.identity) saveIdentity(this.identity)
        this.teardownRtc()
        this.closeWs()
        this.state = { ...EMPTY, chat: this.state.chat, paired: true, isHost: true }
        this.set({ error: null, inviteRotated: this.state.inviteRotated + 1 })
        void this.connect()
        break
      }
      case 'regen-deny': {
        this.set({ error: 'Partner declined the link regeneration' })
        break
      }
      case 'error': {
        const m = String(msg.msg ?? 'Room error')
        this.set({ error: m })
        if (m === 'Invalid invite') {
          /* permanent — never retry a bad link */
          this.permanentReject = true
          this.closeWs()
        }
        break
      }
      case 'pong': {
        this.lastPongAt = Date.now()
        this.rtt = Math.max(0, Date.now() - (this.lastPingAt ?? Date.now()))
        break
      }
      default:
        break
    }
  }

  private lastPingAt = 0
  private lastPongAt = 0
  private wsSend(obj: unknown) {
    try {
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj))
    } catch { /* ignore */ }
  }

  /* ── watch-state sync ────────────────────────────────────────────── */

  /* watch-view calls this on load + every second */
  reportPlayback(p: { mediaId: string; mediaType: string; title: string; poster?: string; season?: number; episode?: number; providerIdx: number; pos: number; playing: boolean; dur: number }) {
    this.localPlayback = { pos: p.pos, playing: p.playing, providerIdx: p.providerIdx, dur: p.dur }
    if (!this.identity?.isHost || !this.state.wsOnline) return
    const st: WatchState = {
      mediaId: p.mediaId,
      mediaType: p.mediaType,
      title: p.title,
      poster: p.poster,
      season: p.season,
      episode: p.episode,
      providerIdx: p.providerIdx,
      pos: Math.round(p.pos),
      playing: p.playing,
      dur: Math.round(p.dur),
      tSent: Date.now(),
    }
    const sig = JSON.stringify(st)
    if (sig === this.lastPublished) return
    this.lastPublished = sig
    this.wsSend({ t: 'state', state: st })
  }

  /* host changed title/closed player → clear the guest's copy */
  stopPublishing() {
    if (this.identity?.isHost) this.wsSend({ t: 'wipe' })
  }

  private applyHostState(st: WatchState) {
    this.set({ hostState: st })
  }

  /* guest: current estimated host position (compensates transit + RTT) */
  hostEstimatedPos(): number | null {
    const st = this.state.hostState
    if (!st || typeof st.pos !== 'number') return null
    const elapsed = st.playing ? (Date.now() - (st.tSent ?? Date.now())) / 1000 + this.rtt / 2000 : 0
    return st.pos + elapsed
  }

  /* guest: compare local playback vs host — called by watch-view ticker */
  measureDrift(localPos: number) {
    if (this.identity?.isHost) return
    const host = this.hostEstimatedPos()
    if (host == null) {
      if (this.state.drift !== null) this.set({ drift: null })
      return
    }
    const d = Math.round(localPos - host)
    if (d !== this.state.drift) this.set({ drift: d })
  }

  /* guest asks the player to re-align at the host position */
  jumpToHost() {
    this.set({ jumpTick: this.state.jumpTick + 1 })
  }

  /* ── WebRTC tunnel ───────────────────────────────────────────────── */

  private beginPeer() {
    if (this.pc || !this.identity) return
    void this.setupPeer()
  }

  private async setupPeer() {
    const isHost = this.identity?.isHost ?? true
    const pc = new RTCPeerConnection({ iceServers: STUN })
    this.pc = pc
    this.set({ call: 'connecting' })

    if (isHost) {
      this.dc = pc.createDataChannel('duo', { ordered: true }) as DataChannel
      this.wireDataChannel(this.dc)
    } else {
      pc.ondatachannel = (ev) => {
        this.dc = ev.channel as DataChannel
        this.wireDataChannel(this.dc)
      }
    }

    pc.onicecandidate = (ev) => {
      if (ev.candidate) this.wsSend({ t: 'signal', data: { ice: ev.candidate.toJSON() } })
    }
    pc.onnegotiationneeded = async () => {
      try {
        this.makingOffer = true
        await pc.setLocalDescription()
        this.wsSend({ t: 'signal', data: { sdp: pc.localDescription?.toJSON() } })
      } catch { /* ignore */ } finally {
        this.makingOffer = false
      }
    }
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') this.set({ call: 'live' })
      else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        if (pc === this.pc) this.set({ call: 'idle', voiceOn: false, videoOn: false })
      }
    }
    pc.ontrack = (ev) => this.onRemoteTrack(ev)

    /* perfect negotiation: host is impolite, guest is polite */
    ;(pc as RTCPeerConnection & { __polite?: boolean }).__polite = !isHost
  }

  private async onSignal(data: SignalData | null) {
    if (!data || !this.identity) return
    if (data.sdp && !this.pc) await this.setupPeer()
    const pc = this.pc
    if (!pc) return
    const polite = (pc as RTCPeerConnection & { __polite?: boolean }).__polite ?? false

    try {
      if (data.sdp) {
        const desc = data.sdp as RTCSessionDescriptionInit
        const offerCollision = desc.type === 'offer' && (this.makingOffer || pc.signalingState !== 'stable')
        this.ignoreOffer = !polite && offerCollision
        if (this.ignoreOffer) return
        if (desc.type === 'answer' && pc.signalingState === 'have-local-offer') {
          /* normal answer path */
        }
        await pc.setRemoteDescription(desc)
        if (desc.type === 'offer') {
          await pc.setLocalDescription()
          this.wsSend({ t: 'signal', data: { sdp: pc.localDescription?.toJSON() } })
        }
      } else if (data.ice) {
        try {
          await pc.addIceCandidate(data.ice as RTCIceCandidateInit)
        } catch (e) {
          if (!this.ignoreOffer) throw e
        }
      }
    } catch { /* malformed signal — ignored */ }
  }

  private onRemoteTrack(ev: RTCTrackEvent) {
    const kind = ev.track.kind
    if (kind === 'audio') {
      this.hookSpatial(ev.streams[0])
    } else if (kind === 'video') {
      this.remoteVideoStream = ev.streams[0] ?? new MediaStream([ev.track])
      this.set({}) // tile renders from remoteVideoStreamRef
    }
  }

  getRemoteVideoStream(): MediaStream | null {
    return this.remoteVideoStream
  }

  /* ── chat ────────────────────────────────────────────────────────── */

  async sendChat(text: string) {
    const t = text.trim().slice(0, 800)
    if (!t || !this.identity || !this.dc || this.dc.readyState !== 'open') return
    const payload = await seal(t, this.identity.pairSecret)
    this.dcSend({ k: 'chat', m: payload })
    this.set({ chat: [...this.state.chat, { from: 'me' as const, text: t, at: Date.now() }].slice(-200) })
  }

  openChat(open: boolean) {
    this.set({ chatOpen: open, unread: open ? 0 : this.state.unread })
  }

  private wireDataChannel(dc: DataChannel) {
    dc.onopen = () => this.set({ call: this.state.call === 'idle' ? 'connecting' : this.state.call })
    dc.onmessage = async (ev) => {
      let env: { k?: string; m?: { i: string; c: string } }
      try { env = JSON.parse(String(ev.data)) } catch { return }
      if (env.k === 'chat' && env.m && this.identity) {
        const text = await unseal(env.m, this.identity.pairSecret)
        if (text) {
          const chatOpen = this.state.chatOpen
          this.set({
            chat: [...this.state.chat, { from: 'partner' as const, text, at: Date.now() }].slice(-200),
            unread: chatOpen ? 0 : this.state.unread + 1,
          })
        }
      } else if (env.k === 'regen-req') {
        this.set({ regenRequest: true })
      } else if (env.k === 'regen-ack') {
        this.onWsMessage(JSON.stringify({ t: 'regen-ack' }))
      } else if (env.k === 'regen-deny') {
        this.set({ error: null })
      }
    }
    dc.onclose = () => {
      if (this.dc === dc) this.dc = null
    }
  }

  private dcSend(obj: unknown) {
    try {
      if (this.dc?.readyState === 'open') this.dc.send(JSON.stringify(obj))
    } catch { /* ignore */ }
  }

  /* ── voice / video ───────────────────────────────────────────────── */

  async toggleVoice(on: boolean): Promise<void> {
    if (on) {
      try {
        this.set({ call: this.state.call === 'live' ? 'live' : 'connecting' })
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        })
        if (this.localStream) {
          this.localStream.getAudioTracks().forEach((t) => {
            t.stop()
            this.localStream?.removeTrack(t)
          })
        }
        this.localStream = stream
        const track = stream.getAudioTracks()[0]
        if (this.pc) {
          const sender = this.pc.getSenders().find((s) => s.track?.kind === 'audio')
          if (sender) await sender.replaceTrack(track)
          else this.pc.addTrack(track, stream)
        }
        this.set({ voiceOn: true, call: this.state.call === 'idle' ? 'connecting' : this.state.call })
      } catch {
        this.set({ error: 'Microphone permission denied', voiceOn: false })
      }
    } else {
      this.localStream?.getAudioTracks().forEach((t) => {
        t.stop()
        this.localStream?.removeTrack(t)
      })
      const sender = this.pc?.getSenders().find((s) => s.track?.kind === 'audio')
      if (sender && this.pc) await sender.replaceTrack(null).catch(() => undefined)
      this.set({ voiceOn: false })
    }
  }

  async toggleVideo(on: boolean): Promise<void> {
    if (on) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        })
        const track = stream.getVideoTracks()[0]
        if (!this.localStream) this.localStream = stream
        else stream.getVideoTracks().forEach((t) => this.localStream?.addTrack(t))
        if (this.pc) {
          const sender = this.pc.getSenders().find((s) => s.track?.kind === 'video')
          if (sender) await sender.replaceTrack(track)
          else this.pc.addTrack(track, stream)
        }
        this.set({ videoOn: true, call: this.state.call === 'idle' ? 'connecting' : this.state.call })
      } catch {
        this.set({ error: 'Camera permission denied', videoOn: false })
      }
    } else {
      this.localStream?.getVideoTracks().forEach((t) => {
        t.stop()
        this.localStream?.removeTrack(t)
      })
      const sender = this.pc?.getSenders().find((s) => s.track?.kind === 'video')
      if (sender && this.pc) await sender.replaceTrack(null).catch(() => undefined)
      this.remoteVideoStream = null
      this.set({ videoOn: false })
    }
  }

  /* ── spatial (3D) audio ──────────────────────────────────────────── */

  private hookSpatial(stream: MediaStream) {
    try {
      if (!this.audioCtx) this.audioCtx = new AudioContext()
      const ctx = this.audioCtx
      void ctx.resume()
      this.remoteSrc?.disconnect()
      this.panner?.disconnect()
      this.remoteSrc = ctx.createMediaStreamSource(stream)
      if (this.state.spatial) {
        const panner = ctx.createPanner()
        panner.panningModel = 'HRTF'
        panner.distanceModel = 'inverse'
        panner.refDistance = 0.7
        panner.setPosition(0.85, 0, -0.55) // partner sits just right-of-screen, in front
        this.panner = panner
        this.remoteSrc.connect(panner)
        panner.connect(ctx.destination)
      } else {
        this.remoteSrc.connect(ctx.destination)
      }
      /* route the raw stream away from default output (avoid double audio) */
      this.ensureSilentAudioEl(stream)
    } catch { /* spatial is a bonus — never break the call over it */ }
  }

  private silentEl: HTMLAudioElement | null = null
  private ensureSilentAudioEl(stream: MediaStream) {
    if (!this.silentEl) {
      this.silentEl = document.createElement('audio')
      this.silentEl.muted = true
      this.silentEl.autoplay = true
      document.body.appendChild(this.silentEl)
    }
    this.silentEl.srcObject = stream
    void this.silentEl.play().catch(() => undefined)
  }

  setSpatial(on: boolean) {
    this.set({ spatial: on })
    if (this.remoteSrc && this.audioCtx) {
      this.remoteSrc.disconnect()
      this.panner?.disconnect()
      if (on) {
        const panner = this.audioCtx.createPanner()
        panner.panningModel = 'HRTF'
        panner.refDistance = 0.7
        panner.setPosition(0.85, 0, -0.55)
        this.panner = panner
        this.remoteSrc.connect(panner)
        panner.connect(this.audioCtx.destination)
      } else {
        this.panner = null
        this.remoteSrc.connect(this.audioCtx.destination)
      }
    }
  }

  /* ── teardown ────────────────────────────────────────────────────── */

  private teardownRtc() {
    try { this.dc?.close() } catch { /* ignore */ }
    this.dc = null
    try { this.pc?.close() } catch { /* ignore */ }
    this.pc = null
    this.localStream?.getTracks().forEach((t) => t.stop())
    this.localStream = null
    this.remoteVideoStream = null
    try {
      this.remoteSrc?.disconnect()
      this.panner?.disconnect()
      void this.audioCtx?.close()
    } catch { /* ignore */ }
    this.remoteSrc = null
    this.panner = null
    this.audioCtx = null
    if (this.silentEl) {
      this.silentEl.srcObject = null
    }
    if (this.state.call !== 'idle' || this.state.voiceOn || this.state.videoOn) {
      this.set({ call: 'idle', voiceOn: false, videoOn: false })
    }
  }

  /* page lifecycle */
  handleUnload() {
    this.stopPublishing()
    this.teardownRtc()
    this.closeWs()
  }

  /* helper for watch-view: VidLink accepts a ?progress= start fraction */
  embedUrlWithProgress(url: string, providerIdx: number, sec: number, dur: number): string {
    if (dur <= 0 || sec <= 5) return url
    const name = PROVIDERS[Math.max(0, Math.min(PROVIDERS.length - 1, providerIdx))]?.name
    if (name !== 'VidLink') return url
    try {
      const u = new URL(url)
      u.searchParams.set('progress', String(Math.min(0.99, Math.max(0.001, sec / dur))))
      return u.toString()
    } catch {
      return url
    }
  }
}

interface SignalData {
  sdp?: RTCSessionDescriptionInit
  ice?: RTCIceCandidateInit
}
/* minimal DataChannel typing (DOM lib lacks readyState narrowing helpers) */
type DataChannel = RTCDataChannel

/* globalThis singleton — one instance across the module graph */
const key = '__invokeil_duo__'
const g = globalThis as unknown as { [key]?: DuoService }
if (!g[key]) g[key] = new DuoService()
export const duo = g[key]

/* auto-lifecycle: keep presence alive across the SPA; wipe state on unload.
   Returning visitors reconnect automatically (idle-deferred so it never
   competes with first paint). */
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => duo.handleUnload())
  window.addEventListener('beforeunload', () => duo.handleUnload())
  const boot = () =>
    setTimeout(() => {
      if (duo.identityInfo) void duo.connect()
    }, 1200)
  if (document.readyState === 'complete') boot()
  else window.addEventListener('load', boot, { once: true })
}
