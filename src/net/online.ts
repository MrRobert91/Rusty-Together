import { Client, type Room } from '@colyseus/sdk'
import { create } from 'zustand'
import { ROOM_NAME, normalizeCode, type Relay, type Slot } from '../../shared/protocol'
import { Emitter, type Session } from './session'

export interface LobbyPlayerView {
  sessionId: string
  name: string
  slot: Slot
  ready: boolean
  connected: boolean
  isHost: boolean
}

export interface LobbyView {
  status: 'idle' | 'connecting' | 'lobby' | 'playing' | 'error'
  error: string
  code: string
  phase: string
  level: string
  players: LobbyPlayerView[]
  mySessionId: string
  peerDropped: boolean
}

export const useLobby = create<LobbyView>(() => ({
  status: 'idle', error: '', code: '', phase: 'lobby', level: 'level1', players: [], mySessionId: '', peerDropped: false,
}))

function endpoint() {
  const env = import.meta.env.VITE_SERVER_URL as string | undefined
  if (env) return env
  if (import.meta.env.DEV) return `${location.protocol}//${location.hostname}:2567`
  return location.origin
}

/* ------------------------------------------------------------ Shared clock
 * Both peers sync to the *server* clock (NTP-style, lowest-RTT sample wins).
 * It starts the moment you enter the lobby, so it is already converged when
 * the level starts, and it never depends on the other peer's main thread.
 */
const EPOCH = Date.UTC(2026, 0, 1)
export const clock = { offset: 0, ready: false, rtt: 0.06, samples: [] as { rtt: number; off: number }[] }
let clockTimer = 0
let clockCount = 0

function startClock(r: Room) {
  stopClock()
  clock.samples = []
  clockCount = 0
  const tick = () => {
    if (room !== r) return
    r.send('ping', performance.now())
    clockCount++
    // Burst at first for fast convergence, then a gentle heartbeat.
    clockTimer = window.setTimeout(tick, clockCount < 12 ? 120 : 1000)
  }
  tick()
}

function stopClock() { window.clearTimeout(clockTimer) }

function clockSample(d: { t0: number; server: number }) {
  const now = performance.now()
  const rtt = now - d.t0
  const off = d.server + rtt / 2 - now
  clock.samples.push({ rtt, off })
  if (clock.samples.length > 16) clock.samples.shift()
  const best = clock.samples.reduce((a, b) => (b.rtt < a.rtt ? b : a))
  const sorted = clock.samples.map((x) => x.rtt).sort((a, b) => a - b)
  clock.rtt = sorted[Math.floor(sorted.length / 2)] / 1000
  // Slew (never jump) once we're synced, so gameplay time stays smooth.
  clock.offset = clock.ready ? clock.offset + Math.max(-4, Math.min(4, best.off - clock.offset)) : best.off
  clock.ready = true
}

/** Seconds on the shared (server) timeline. */
export function sharedTime() { return (performance.now() + clock.offset - EPOCH) / 1000 }

let client: Client | null = null
let room: Room | null = null
const lobbyEvents = new Emitter()
export const onLobby = (t: string, cb: (d: any) => void) => lobbyEvents.on(t, cb)
export const currentRoom = () => room

function friendlyError(e: unknown) {
  const msg = String((e as Error)?.message || e)
  if (/not found|invalid|locked|full/i.test(msg)) return 'No existe ninguna sala abierta con ese código (o ya está llena).'
  if (/fetch|network|ECONN|Failed/i.test(msg)) return 'No se puede contactar con el servidor. ¿Está en marcha (npm run dev)?'
  return msg
}

function bindRoom(r: Room) {
  room = r
  useLobby.setState({ status: 'lobby', code: r.roomId, mySessionId: r.sessionId, error: '', peerDropped: false })
  r.onStateChange((state: any) => {
    const players: LobbyPlayerView[] = []
    state.players?.forEach((p: any) => players.push({ sessionId: p.sessionId, name: p.name, slot: p.slot as Slot, ready: p.ready, connected: p.connected, isHost: p.isHost }))
    players.sort((a, b) => a.slot - b.slot)
    useLobby.setState({ players, phase: state.phase, level: state.level, code: state.code || r.roomId })
  })
  r.onMessage('start', (d: any) => { useLobby.setState({ status: 'playing' }); lobbyEvents.emit('start', d) })
  r.onMessage('to-lobby', () => { useLobby.setState({ status: 'lobby' }); lobbyEvents.emit('to-lobby', {}) })
  r.onMessage('host-left', () => lobbyEvents.emit('host-left', {}))
  r.onMessage('peer-left', () => lobbyEvents.emit('peer-left', {}))
  r.onMessage('peer-joined', () => { useLobby.setState({ peerDropped: false }); lobbyEvents.emit('peer-joined', {}) })
  r.onMessage('peer-dropped', () => { useLobby.setState({ peerDropped: true }); lobbyEvents.emit('peer-dropped', {}) })
  r.onMessage('peer-back', () => { useLobby.setState({ peerDropped: false }); lobbyEvents.emit('peer-back', {}) })
  r.onMessage('pong', (d: { t0: number; server: number }) => clockSample(d))
  startClock(r)
  r.onMessage('r', (m: Relay) => lobbyEvents.emit('relay', m))
  r.onMessage('*', () => {})
  r.onLeave((code: number) => {
    if (room !== r) return
    stopClock()
    room = null
    lobbyEvents.emit('left', { code })
    useLobby.setState({ status: 'idle', players: [], code: '' })
  })
  r.onError((_c: number, message?: string) => useLobby.setState({ error: message || 'Error de red' }))
}

/** Retry transient network failures (cold servers, flaky mobile data); not "room not found". */
async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown
  for (let i = 0; i < tries; i++) {
    try { return await fn() } catch (e) {
      last = e
      if (/not found|invalid|locked|full/i.test(String((e as Error)?.message || e))) throw e
      await new Promise((r) => setTimeout(r, 400 * (i + 1)))
    }
  }
  throw last
}

export async function hostRoom(name: string) {
  useLobby.setState({ status: 'connecting', error: '' })
  try {
    client = new Client(endpoint())
    bindRoom(await withRetry(() => client!.create(ROOM_NAME, { name })))
  } catch (e) {
    useLobby.setState({ status: 'error', error: friendlyError(e) })
  }
}

export async function joinRoom(rawCode: string, name: string) {
  const code = normalizeCode(rawCode)
  if (code.length < 5) { useLobby.setState({ status: 'error', error: 'El código tiene 5 caracteres.' }); return }
  useLobby.setState({ status: 'connecting', error: '' })
  try {
    client = new Client(endpoint())
    bindRoom(await withRetry(() => client!.joinById(code, { name })))
  } catch (e) {
    useLobby.setState({ status: 'error', error: friendlyError(e) })
  }
}

export function leaveRoom() {
  const r = room
  room = null
  r?.leave(true).catch(() => {})
  useLobby.setState({ status: 'idle', players: [], code: '', error: '' })
}

export const lobbySend = (t: string, d?: unknown) => room?.send(t, d)

/** Gameplay session over the Colyseus relay. */
export class OnlineSession implements Session {
  readonly mode = 'online' as const
  readonly isHost: boolean
  readonly localSlot: Slot
  readonly peerSlot: Slot
  peerConnected = true
  private em = new Emitter()
  private unsub: Array<() => void> = []

  constructor() {
    const lv = useLobby.getState()
    const me = lv.players.find((p) => p.sessionId === lv.mySessionId)
    this.isHost = !!me?.isHost
    this.localSlot = (me?.slot ?? 0) as Slot
    this.peerSlot = (this.localSlot === 0 ? 1 : 0) as Slot
    this.unsub.push(lobbyEvents.on('relay', (m: Relay) => this.em.emit(m.t, m.d)))
    this.unsub.push(lobbyEvents.on('peer-dropped', () => { this.peerConnected = false; this.em.emit('peer', false) }))
    this.unsub.push(lobbyEvents.on('peer-back', () => { this.peerConnected = true; this.em.emit('peer', true) }))
    this.unsub.push(lobbyEvents.on('peer-joined', () => { this.peerConnected = true; this.em.emit('peer', true) }))
    this.unsub.push(lobbyEvents.on('peer-left', () => { this.peerConnected = false; this.em.emit('peer', false) }))
  }

  /** Round trip to the server (the peer is roughly one RTT away through the relay). */
  get rtt() { return clock.rtt }
  send(t: string, d: unknown) { room?.send('r', { t, d }) }
  on(t: string, cb: (d: any) => void) { return this.em.on(t, cb) }
  hostTime() { return sharedTime() }
  dispose() {
    this.unsub.forEach((u) => u())
    this.em.clear()
  }
}
