// Contract shared by the Colyseus server and the browser client.

export const ROOM_NAME = 'coop'
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const CODE_LENGTH = 5

export type Slot = 0 | 1 // 0 = Cian (left half), 1 = Ámbar (right half)

export type LobbyPhase = 'lobby' | 'playing' | 'paused'

/** Relay envelope: the server forwards it untouched to the other peer. */
export interface Relay<T = unknown> {
  t: string
  d: T
}

export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH)
}

export function randomCode(): string {
  let s = ''
  for (let i = 0; i < CODE_LENGTH; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  return s
}
