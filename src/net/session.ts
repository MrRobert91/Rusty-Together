import type { Slot } from '../../shared/protocol'

type Handler = (d: any) => void

/**
 * Transport-agnostic gameplay session. The game only ever talks to this
 * interface, so the solo tutorial and the online level share the same code.
 */
export interface Session {
  readonly mode: 'solo' | 'online'
  readonly isHost: boolean
  readonly localSlot: Slot
  readonly peerSlot: Slot
  peerConnected: boolean
  readonly rtt: number
  /** Send a gameplay message to the other peer. */
  send(t: string, d: unknown): void
  on(t: string, cb: Handler): () => void
  /** Clock shared by both peers (seconds, host timeline). */
  hostTime(): number
  dispose(): void
}

export class Emitter {
  private map = new Map<string, Set<Handler>>()
  on(t: string, cb: Handler) {
    let s = this.map.get(t)
    if (!s) this.map.set(t, (s = new Set()))
    s.add(cb)
    return () => { s!.delete(cb) }
  }
  emit(t: string, d: unknown) {
    this.map.get(t)?.forEach((cb) => cb(d))
  }
  clear() { this.map.clear() }
}

export class OfflineSession implements Session {
  readonly mode = 'solo' as const
  readonly isHost = true
  readonly localSlot: Slot = 0
  readonly peerSlot: Slot = 1
  peerConnected = true
  rtt = 0
  private em = new Emitter()
  send() { /* nobody to talk to */ }
  on(t: string, cb: Handler) { return this.em.on(t, cb) }
  hostTime() { return performance.now() / 1000 }
  dispose() { this.em.clear() }
}
