import { Room, type Client, definePlugins } from 'colyseus'
import { WebRTCPlugin } from 'colyseus/plugins/webrtc'
import { schema, t, type SchemaType } from '@colyseus/schema'
import { randomCode, type Relay } from '../shared/protocol.ts'

export const LobbyPlayer = schema({
  sessionId: t.string(),
  name: t.string(),
  slot: t.uint8(),
  ready: t.boolean(),
  connected: t.boolean(),
  isHost: t.boolean(),
}, 'LobbyPlayer')
export type LobbyPlayer = SchemaType<typeof LobbyPlayer>

export const LobbyState = schema({
  code: t.string(),
  phase: t.string(),
  hostId: t.string(),
  level: t.string(),
  players: t.map(LobbyPlayer),
}, 'LobbyState')
export type LobbyState = SchemaType<typeof LobbyState>

const activeCodes = new Set<string>()

/**
 * Private two-player room. The host's browser runs the authoritative simulation;
 * the server owns matchmaking, the lobby state, reconnection and relays gameplay
 * packets between both peers (plus WebRTC signaling for proximity voice).
 */
export class CoopRoom extends Room<{ state: LobbyState }> {
  maxClients = 2
  maxMessagesPerSecond = 240
  plugins = definePlugins({ webrtc: new WebRTCPlugin() })

  onCreate() {
    let code = randomCode()
    while (activeCodes.has(code)) code = randomCode()
    activeCodes.add(code)
    this.roomId = code
    this.setPrivate(true)

    this.state = new LobbyState()
    this.state.code = code
    this.state.phase = 'lobby'
    this.state.level = 'level1'

    // High-frequency gameplay relay. Never inspected, only forwarded.
    this.onMessage('r', (client, msg: Relay) => {
      for (const other of this.clients) if (other !== client) other.send('r', msg)
    })

    this.onMessage('name', (client, name: string) => {
      const p = this.state.players.get(client.sessionId)
      if (p) p.name = String(name).slice(0, 16)
    })

    this.onMessage('ready', (client, ready: boolean) => {
      const p = this.state.players.get(client.sessionId)
      if (p) p.ready = !!ready
    })

    // Either player may request a colour swap; the swap happens for both.
    this.onMessage('swap', () => {
      if (this.state.phase !== 'lobby') return
      this.state.players.forEach((p) => { p.slot = p.slot === 0 ? 1 : 0; p.ready = false })
    })

    this.onMessage('level', (client, level: string) => {
      if (client.sessionId !== this.state.hostId) return
      this.state.level = level
    })

    this.onMessage('start', (client) => {
      if (client.sessionId !== this.state.hostId) return
      if (this.state.players.size < 2) return
      let allReady = true
      this.state.players.forEach((p) => { if (!p.isHost && !p.ready) allReady = false })
      if (!allReady) return
      this.state.phase = 'playing'
      this.broadcast('start', { level: this.state.level, seed: Math.floor(Math.random() * 1e9) })
    })

    this.onMessage('lobby', (client) => {
      if (client.sessionId !== this.state.hostId) return
      this.state.phase = 'lobby'
      this.state.players.forEach((p) => { p.ready = false })
      this.broadcast('to-lobby', {})
    })

    // Clock sync for fair synchronised inputs.
    this.onMessage('ping', (client, t0: number) => client.send('pong', { t0, server: Date.now() }))
  }

  onJoin(client: Client, options: { name?: string } = {}) {
    const isHost = this.state.players.size === 0
    const usedSlots = new Set<number>()
    this.state.players.forEach((p) => usedSlots.add(p.slot))
    const p = new LobbyPlayer()
    p.sessionId = client.sessionId
    p.name = String(options.name || (isHost ? 'Anfitrión' : 'Invitado')).slice(0, 16)
    p.slot = usedSlots.has(0) ? 1 : 0
    p.ready = isHost
    p.connected = true
    p.isHost = isHost
    if (isHost) this.state.hostId = client.sessionId
    this.state.players.set(client.sessionId, p)
    this.broadcast('peer-joined', { sessionId: client.sessionId }, { except: client })
    if (this.clients.length >= 2) this.lock()
  }

  async onDrop(client: Client) {
    const p = this.state.players.get(client.sessionId)
    if (!p) return
    p.connected = false
    this.broadcast('peer-dropped', { sessionId: client.sessionId, host: p.isHost }, { except: client })
    // GDD: keep the attempt paused up to 90 s for the guest to come back.
    this.allowReconnection(client, p.isHost ? 20 : 90)
  }

  onReconnect(client: Client) {
    const p = this.state.players.get(client.sessionId)
    if (p) p.connected = true
    this.broadcast('peer-back', { sessionId: client.sessionId }, { except: client })
  }

  onLeave(client: Client) {
    const p = this.state.players.get(client.sessionId)
    this.state.players.delete(client.sessionId)
    if (p?.isHost) {
      // Host migration is out of scope (GDD): send the guest back to the menu.
      this.broadcast('host-left', {})
      this.disconnect()
      return
    }
    this.broadcast('peer-left', { sessionId: client.sessionId })
    if (this.state.phase !== 'lobby') this.state.phase = 'lobby'
    this.unlock()
  }

  onDispose() {
    activeCodes.delete(this.state.code)
  }
}
