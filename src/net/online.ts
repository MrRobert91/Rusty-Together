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
  r.onMessage('pong', () => {})
  r.onMessage('r', (m: Relay) => lobbyEvents.emit('relay', m))
  r.onMessage('*', () => {})
  r.onLeave((code: number) => {
    if (room !== r) return
    room = null
    lobbyEvents.emit('left', { code })
    useLobby.setState({ status: 'idle', players: [], code: '' })
  })
  r.onError((_c: number, message?: string) => useLobby.setState({ error: message || 'Error de red' }))
}

export async function hostRoom(name: string) {
  useLobby.setState({ status: 'connecting', error: '' })
  try {
    client = new Client(endpoint())
    bindRoom(await client.create(ROOM_NAME, { name }))
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
    bindRoom(await client.joinById(code, { name }))
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
  rtt = 0.08
  private em = new Emitter()
  private offset = 0
  private offsetReady = false
  private unsub: Array<() => void> = []
  private pingTimer = 0

  constructor() {
    const lv = useLobby.getState()
    const me = lv.players.find((p) => p.sessionId === lv.mySessionId)
    this.isHost = !!me?.isHost
    this.localSlot = (me?.slot ?? 0) as Slot
    this.peerSlot = (this.localSlot === 0 ? 1 : 0) as Slot
    this.unsub.push(lobbyEvents.on('relay', (m: Relay) => this.onRelay(m)))
    this.unsub.push(lobbyEvents.on('peer-dropped', () => { this.peerConnected = false; this.em.emit('peer', false) }))
    this.unsub.push(lobbyEvents.on('peer-back', () => { this.peerConnected = true; this.em.emit('peer', true) }))
    this.unsub.push(lobbyEvents.on('peer-joined', () => { this.peerConnected = true; this.em.emit('peer', true) }))
    this.unsub.push(lobbyEvents.on('peer-left', () => { this.peerConnected = false; this.em.emit('peer', false) }))
    if (!this.isHost) {
      this.ping()
      this.pingTimer = window.setInterval(() => this.ping(), 1000)
    } else {
      this.pingTimer = window.setInterval(() => this.send('_hping', performance.now()), 1000)
    }
  }

  private ping() { this.send('_ping', performance.now()) }

  private onRelay(m: Relay) {
    if (m.t === '_ping') { this.send('_pong', { t0: m.d, h: performance.now() / 1000 }); return }
    if (m.t === '_hping') { this.send('_hpong', m.d); return }
    if (m.t === '_hpong') { this.rtt = this.rtt * 0.7 + ((performance.now() - (m.d as number)) / 1000) * 0.3; return }
    if (m.t === '_pong') {
      const d = m.d as { t0: number; h: number }
      const now = performance.now()
      const rtt = (now - d.t0) / 1000
      this.rtt = this.offsetReady ? this.rtt * 0.7 + rtt * 0.3 : rtt
      const off = d.h + rtt / 2 - now / 1000
      this.offset = this.offsetReady ? this.offset * 0.8 + off * 0.2 : off
      this.offsetReady = true
      return
    }
    this.em.emit(m.t, m.d)
  }

  send(t: string, d: unknown) { room?.send('r', { t, d }) }
  on(t: string, cb: (d: any) => void) { return this.em.on(t, cb) }
  hostTime() { return performance.now() / 1000 + (this.isHost ? 0 : this.offset) }
  dispose() {
    window.clearInterval(this.pingTimer)
    this.unsub.forEach((u) => u())
    this.em.clear()
  }
}
