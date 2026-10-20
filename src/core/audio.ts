import { settings, useSettings } from './settings'

/**
 * Fully procedural audio: every SFX is synthesised with WebAudio so the build
 * ships zero audio files, plus a layered adaptive music sequencer.
 */

type V3 = { x: number; y: number; z: number }

let ctx: AudioContext | null = null
let master: GainNode
let sfxBus: GainNode
let musicBus: GainNode
let voiceBus: GainNode
let noiseBuf: AudioBuffer
const listener = { x: 0, y: 0, z: 0, fx: 0, fz: -1 }

export function audioCtx() { return ctx }
export function voiceOutput() { return voiceBus }

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return }
  ctx = new AudioContext({ latencyHint: 'interactive' })
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -14
  comp.knee.value = 10
  comp.ratio.value = 4
  comp.attack.value = 0.004
  comp.release.value = 0.2
  master = ctx.createGain()
  master.connect(comp).connect(ctx.destination)
  sfxBus = ctx.createGain(); sfxBus.connect(master)
  musicBus = ctx.createGain(); musicBus.connect(master)
  voiceBus = ctx.createGain(); voiceBus.connect(master)
  // Shared reverb send for space and depth.
  reverb = ctx.createConvolver()
  reverb.buffer = makeImpulse(2.4, 2.8)
  reverbSend = ctx.createGain(); reverbSend.gain.value = 0.22
  reverbSend.connect(reverb).connect(master)
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
  const d = noiseBuf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  applyVolumes()
  useSettings.subscribe(applyVolumes)
}

let reverb: ConvolverNode
let reverbSend: GainNode

function makeImpulse(seconds: number, decay: number) {
  const c = ctx!
  const len = Math.floor(c.sampleRate * seconds)
  const buf = c.createBuffer(2, len, c.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay)
  }
  return buf
}

function applyVolumes() {
  if (!ctx) return
  const s = settings()
  const t = ctx.currentTime
  master.gain.setTargetAtTime(s.masterVolume, t, 0.05)
  sfxBus.gain.setTargetAtTime(s.sfxVolume, t, 0.05)
  musicBus.gain.setTargetAtTime(s.musicVolume * 0.5 * musicDuck, t, 0.3)
  voiceBus.gain.setTargetAtTime(s.voiceVolume, t, 0.05)
}

let musicDuck = 1
export function duckMusic(amount: number) {
  musicDuck = amount
  applyVolumes()
}

export function setListener(p: V3, forward: V3) {
  listener.x = p.x; listener.y = p.y; listener.z = p.z
  const n = Math.hypot(forward.x, forward.z) || 1
  listener.fx = forward.x / n; listener.fz = forward.z / n
}

/** Distance attenuation + stereo pan relative to the camera. */
function spatial(pos?: V3, range = 30): { gain: number; pan: number } {
  if (!pos) return { gain: 1, pan: 0 }
  const dx = pos.x - listener.x
  const dy = pos.y - listener.y
  const dz = pos.z - listener.z
  const dist = Math.hypot(dx, dy, dz)
  const gain = Math.max(0, 1 - Math.max(0, dist - 4) / range) ** 1.6
  // right vector = (-fz, fx)
  const rx = -listener.fz
  const rz = listener.fx
  const pan = dist > 0.01 ? Math.max(-1, Math.min(1, (dx * rx + dz * rz) / Math.max(dist, 3))) : 0
  return { gain, pan }
}

interface Out { node: AudioNode; t: number; end: (at: number) => void }

function out(pos?: V3, vol = 1, range?: number, wet = 0.15): Out | null {
  if (!ctx || ctx.state !== 'running') return null
  const { gain, pan } = spatial(pos, range)
  if (gain <= 0.001) return null
  const g = ctx.createGain()
  g.gain.value = vol * gain
  const p = ctx.createStereoPanner()
  p.pan.value = pan
  g.connect(p).connect(sfxBus)
  if (wet > 0) {
    const w = ctx.createGain(); w.gain.value = wet
    p.connect(w).connect(reverbSend)
  }
  return { node: g, t: ctx.currentTime, end: () => {} }
}

function osc(o: Out, type: OscillatorType, f0: number, f1: number, dur: number, vol = 1, attack = 0.005, delay = 0) {
  const c = ctx!
  const t = o.t + delay
  const os = c.createOscillator()
  os.type = type
  os.frequency.setValueAtTime(f0, t)
  if (f1 !== f0) os.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur)
  const g = c.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(vol, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  os.connect(g).connect(o.node)
  os.start(t)
  os.stop(t + dur + 0.05)
  return os
}

function noise(o: Out, dur: number, vol: number, filter: BiquadFilterType, f0: number, f1 = f0, q = 1, delay = 0) {
  const c = ctx!
  const t = o.t + delay
  const src = c.createBufferSource()
  src.buffer = noiseBuf
  src.playbackRate.value = 1
  const bf = c.createBiquadFilter()
  bf.type = filter
  bf.Q.value = q
  bf.frequency.setValueAtTime(f0, t)
  if (f1 !== f0) bf.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur)
  const g = c.createGain()
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(bf).connect(g).connect(o.node)
  src.start(t, Math.random())
  src.stop(t + dur + 0.05)
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a)

export type Sfx =
  | 'jump' | 'jumpBig' | 'land' | 'landHeavy' | 'step' | 'stepHeavy' | 'beepCyan' | 'beepAmber'
  | 'grab' | 'release' | 'cableFire' | 'cableHit' | 'cableReel' | 'spring' | 'bell' | 'box'
  | 'door' | 'lever' | 'success' | 'fall' | 'merge' | 'split' | 'alarm' | 'whoosh' | 'bonk'
  | 'pop' | 'click' | 'hover' | 'tick' | 'go' | 'fanfare' | 'net' | 'ping' | 'boost' | 'charge'
  | 'checkpoint' | 'clank' | 'servo' | 'fuse' | 'denied' | 'emote'

export function sfx(name: Sfx, pos?: V3, vol = 1) {
  if (!ctx) return
  switch (name) {
    case 'jump': {
      const o = out(pos, 0.5 * vol); if (!o) return
      osc(o, 'sine', rnd(300, 340), 720, 0.16, 0.6)
      osc(o, 'square', 600, 1200, 0.06, 0.08)
      noise(o, 0.08, 0.15, 'highpass', 3000)
      break
    }
    case 'jumpBig': {
      const o = out(pos, 0.7 * vol); if (!o) return
      osc(o, 'sine', 180, 640, 0.32, 0.7)
      osc(o, 'triangle', 360, 1280, 0.28, 0.25, 0.01, 0.02)
      noise(o, 0.25, 0.3, 'bandpass', 600, 3000, 0.8)
      break
    }
    case 'land': {
      const o = out(pos, 0.45 * vol); if (!o) return
      osc(o, 'sine', 140, 50, 0.12, 0.8)
      noise(o, 0.1, 0.35, 'lowpass', 1400, 300)
      break
    }
    case 'landHeavy': {
      const o = out(pos, 0.9 * vol, 40, 0.3); if (!o) return
      osc(o, 'sine', 90, 30, 0.35, 1)
      noise(o, 0.3, 0.6, 'lowpass', 900, 120)
      osc(o, 'square', 220, 110, 0.08, 0.1)
      break
    }
    case 'step': {
      const o = out(pos, 0.12 * vol, 18, 0.05); if (!o) return
      noise(o, 0.04, 0.6, 'bandpass', rnd(1800, 2600), rnd(900, 1200), 2)
      osc(o, 'sine', rnd(180, 220), 90, 0.04, 0.4)
      break
    }
    case 'stepHeavy': {
      const o = out(pos, 0.35 * vol, 30, 0.1); if (!o) return
      osc(o, 'sine', rnd(80, 95), 40, 0.15, 0.9)
      noise(o, 0.1, 0.4, 'lowpass', 700, 150)
      noise(o, 0.05, 0.2, 'bandpass', 3200, 2400, 4, 0.02)
      break
    }
    case 'beepCyan':
    case 'beepAmber': {
      const o = out(pos, 0.3 * vol, 40, 0.2); if (!o) return
      const base = name === 'beepCyan' ? 988 : 659
      osc(o, 'square', base, base, 0.07, 0.3)
      osc(o, 'square', base * 1.335, base * 1.335, 0.09, 0.3, 0.005, 0.08)
      break
    }
    case 'emote': {
      const o = out(pos, 0.35 * vol); if (!o) return
      const b = rnd(600, 900)
      osc(o, 'square', b, b * 1.5, 0.06, 0.25)
      osc(o, 'square', b * 1.25, b * 2, 0.08, 0.25, 0.005, 0.07)
      osc(o, 'triangle', b * 2, b * 2.5, 0.1, 0.2, 0.005, 0.15)
      break
    }
    case 'grab': {
      const o = out(pos, 0.45 * vol); if (!o) return
      noise(o, 0.03, 0.8, 'highpass', 2500)
      osc(o, 'square', 420, 300, 0.05, 0.2)
      osc(o, 'sine', 880, 1100, 0.06, 0.25, 0.002, 0.03)
      break
    }
    case 'release': {
      const o = out(pos, 0.3 * vol); if (!o) return
      osc(o, 'sine', 900, 500, 0.08, 0.3)
      break
    }
    case 'cableFire': {
      const o = out(pos, 0.5 * vol); if (!o) return
      noise(o, 0.22, 0.6, 'bandpass', 1200, 5000, 3)
      osc(o, 'sawtooth', 200, 900, 0.18, 0.12)
      break
    }
    case 'cableHit': {
      const o = out(pos, 0.6 * vol, 35, 0.3); if (!o) return
      for (const [f, v] of [[523, 0.3], [1307, 0.18], [2210, 0.12], [3110, 0.08]] as const) osc(o, 'sine', f, f * 0.98, 0.5, v, 0.001)
      noise(o, 0.04, 0.6, 'highpass', 4000)
      break
    }
    case 'cableReel': {
      const o = out(pos, 0.18 * vol); if (!o) return
      for (let i = 0; i < 4; i++) noise(o, 0.025, 0.7, 'bandpass', 2400 + i * 200, 2400, 6, i * 0.04)
      break
    }
    case 'charge': {
      const o = out(pos, 0.25 * vol); if (!o) return
      osc(o, 'triangle', 300, 900, 0.9, 0.35, 0.05)
      osc(o, 'sine', 600, 1800, 0.9, 0.1, 0.05)
      break
    }
    case 'spring': {
      const o = out(pos, 0.6 * vol, 35); if (!o) return
      const c = ctx!
      const os = osc(o, 'sine', 700, 180, 0.45, 0.6)
      const lfo = c.createOscillator(); lfo.frequency.value = 28
      const lg = c.createGain(); lg.gain.value = 60
      lfo.connect(lg).connect(os.frequency); lfo.start(o.t); lfo.stop(o.t + 0.5)
      noise(o, 0.06, 0.3, 'highpass', 2000)
      break
    }
    case 'boost': {
      const o = out(pos, 0.7 * vol); if (!o) return
      osc(o, 'sine', 200, 1400, 0.3, 0.6)
      osc(o, 'square', 400, 2800, 0.2, 0.08)
      noise(o, 0.2, 0.25, 'bandpass', 800, 5000, 1)
      break
    }
    case 'bell': {
      const o = out(pos, 0.6 * vol, 40, 0.45); if (!o) return
      const f = rnd(0.98, 1.02) * 1046
      for (const [m, v, d] of [[1, 0.5, 1.6], [2.76, 0.2, 0.9], [5.4, 0.12, 0.5], [8.93, 0.06, 0.3]] as const) osc(o, 'sine', f * m, f * m, d, v, 0.001)
      break
    }
    case 'box': {
      const o = out(pos, 0.5 * vol); if (!o) return
      osc(o, 'sine', 160, 70, 0.12, 0.7)
      noise(o, 0.08, 0.4, 'bandpass', 500, 300, 1.5)
      break
    }
    case 'door': {
      const o = out(pos, 0.5 * vol, 40, 0.3); if (!o) return
      osc(o, 'sawtooth', 70, 90, 0.7, 0.12, 0.05)
      noise(o, 0.7, 0.2, 'bandpass', 300, 600, 2)
      osc(o, 'square', 150, 70, 0.15, 0.25, 0.005, 0.6)
      break
    }
    case 'servo': {
      const o = out(pos, 0.25 * vol); if (!o) return
      osc(o, 'sawtooth', 220, 330, 0.25, 0.1, 0.02)
      osc(o, 'sawtooth', 223, 333, 0.25, 0.1, 0.02)
      break
    }
    case 'lever': {
      const o = out(pos, 0.55 * vol); if (!o) return
      noise(o, 0.05, 0.9, 'bandpass', 1500, 800, 3)
      osc(o, 'square', 300, 150, 0.09, 0.2, 0.002, 0.05)
      osc(o, 'sine', 1200, 1200, 0.15, 0.15, 0.002, 0.1)
      break
    }
    case 'clank': {
      const o = out(pos, 0.6 * vol, 40, 0.35); if (!o) return
      for (const [f, v] of [[310, 0.3], [845, 0.2], [1630, 0.1]] as const) osc(o, 'triangle', f, f * 0.97, 0.3, v, 0.001)
      noise(o, 0.05, 0.6, 'bandpass', 2500, 1500, 2)
      break
    }
    case 'checkpoint': {
      const o = out(undefined, 0.35 * vol); if (!o) return
      ;[784, 988, 1175].forEach((f, i) => osc(o, 'triangle', f, f, 0.25, 0.4, 0.005, i * 0.06))
      break
    }
    case 'success': {
      const o = out(undefined, 0.45 * vol, 0, 0.3); if (!o) return
      ;[523, 659, 784, 1046, 1318].forEach((f, i) => { osc(o, 'triangle', f, f, 0.4, 0.35, 0.005, i * 0.07); osc(o, 'square', f * 2, f * 2, 0.08, 0.05, 0.005, i * 0.07) })
      break
    }
    case 'fanfare': {
      const o = out(undefined, 0.55 * vol, 0, 0.4); if (!o) return
      const seq: [number, number, number][] = [[523, 0, 0.15], [523, 0.15, 0.15], [523, 0.3, 0.15], [659, 0.45, 0.45], [587, 0.9, 0.15], [659, 1.05, 0.15], [784, 1.2, 0.9]]
      for (const [f, at, d] of seq) {
        osc(o, 'sawtooth', f, f, d + 0.1, 0.12, 0.01, at)
        osc(o, 'triangle', f / 2, f / 2, d + 0.1, 0.3, 0.01, at)
        osc(o, 'square', f * 2, f * 2, d * 0.6, 0.04, 0.01, at)
      }
      break
    }
    case 'fall': {
      const o = out(pos, 0.4 * vol); if (!o) return
      osc(o, 'sine', 1400, 200, 0.9, 0.3, 0.02)
      osc(o, 'square', 700, 100, 0.9, 0.05, 0.02)
      break
    }
    case 'net': {
      const o = out(pos, 0.5 * vol); if (!o) return
      osc(o, 'sine', 120, 260, 0.25, 0.6)
      noise(o, 0.2, 0.3, 'lowpass', 900, 300)
      break
    }
    case 'merge': {
      const o = out(pos, 0.8 * vol, 0, 0.5); if (!o) return
      osc(o, 'sawtooth', 110, 440, 1.1, 0.1, 0.2)
      osc(o, 'sine', 220, 880, 1.1, 0.4, 0.2)
      noise(o, 1.0, 0.25, 'bandpass', 300, 6000, 1.2)
      ;[523, 659, 784, 1046].forEach((f, i) => osc(o, 'triangle', f, f, 0.8, 0.25, 0.01, 1.0 + i * 0.05))
      osc(o, 'sine', 70, 40, 0.6, 0.9, 0.005, 1.15)
      break
    }
    case 'split': {
      const o = out(pos, 0.7 * vol, 0, 0.4); if (!o) return
      osc(o, 'sine', 800, 200, 0.5, 0.4)
      noise(o, 0.4, 0.3, 'bandpass', 4000, 400, 1)
      osc(o, 'triangle', 660, 660, 0.2, 0.2, 0.005, 0.4)
      osc(o, 'triangle', 988, 988, 0.2, 0.2, 0.005, 0.5)
      break
    }
    case 'alarm': {
      const o = out(pos, 0.5 * vol, 50, 0.3); if (!o) return
      osc(o, 'square', 880, 880, 0.18, 0.18)
      osc(o, 'square', 660, 660, 0.18, 0.18, 0.005, 0.22)
      osc(o, 'square', 880, 880, 0.18, 0.18, 0.005, 0.44)
      break
    }
    case 'whoosh': {
      const o = out(pos, 0.6 * vol, 40); if (!o) return
      noise(o, 0.6, 0.6, 'bandpass', 300, 2200, 2)
      break
    }
    case 'bonk': {
      const o = out(pos, 0.7 * vol); if (!o) return
      osc(o, 'square', 300, 90, 0.15, 0.3)
      osc(o, 'sine', 1600, 1200, 0.25, 0.2, 0.001, 0.02)
      noise(o, 0.06, 0.6, 'lowpass', 2000, 400)
      break
    }
    case 'pop': {
      const o = out(pos, 0.5 * vol); if (!o) return
      osc(o, 'sine', 400, 1600, 0.06, 0.6)
      noise(o, 0.12, 0.3, 'highpass', 5000)
      break
    }
    case 'fuse': {
      const o = out(pos, 0.7 * vol, 0, 0.5); if (!o) return
      osc(o, 'sawtooth', 60, 60, 1.2, 0.15, 0.3)
      ;[392, 523, 659, 784].forEach((f, i) => osc(o, 'sine', f, f, 1.2, 0.25, 0.01, 0.3 + i * 0.12))
      noise(o, 0.5, 0.3, 'highpass', 6000, 3000, 1, 0.2)
      break
    }
    case 'denied': {
      const o = out(pos, 0.35 * vol); if (!o) return
      osc(o, 'square', 220, 200, 0.12, 0.25)
      osc(o, 'square', 180, 160, 0.16, 0.25, 0.005, 0.13)
      break
    }
    case 'ping': {
      const o = out(pos, 0.5 * vol, 60, 0.4); if (!o) return
      osc(o, 'sine', 1320, 1320, 0.4, 0.4, 0.001)
      osc(o, 'sine', 1980, 1980, 0.3, 0.2, 0.001, 0.08)
      break
    }
    case 'click': {
      const o = out(undefined, 0.3 * vol, 0, 0); if (!o) return
      osc(o, 'square', 1200, 900, 0.03, 0.25)
      break
    }
    case 'hover': {
      const o = out(undefined, 0.12 * vol, 0, 0); if (!o) return
      osc(o, 'sine', 1800, 2200, 0.04, 0.3)
      break
    }
    case 'tick': {
      const o = out(undefined, 0.35 * vol, 0, 0); if (!o) return
      osc(o, 'square', 1000, 1000, 0.05, 0.3)
      break
    }
    case 'go': {
      const o = out(undefined, 0.5 * vol, 0, 0.2); if (!o) return
      osc(o, 'square', 1500, 1500, 0.35, 0.3)
      osc(o, 'triangle', 750, 750, 0.35, 0.3)
      break
    }
  }
}

/* ---------------------------------------------------------------- Music */

export type MusicMood = 'menu' | 'explore' | 'tension' | 'boss' | 'arena' | 'silent' | 'victory'

const BPM = 104
const SPB = 60 / BPM
const CHORDS: number[][] = [
  [48, 52, 55, 59], // Cmaj7
  [45, 48, 52, 55], // Am7
  [41, 45, 48, 52], // Fmaj7
  [43, 47, 50, 53], // G7
]
const PENTA = [0, 2, 4, 7, 9]
let mood: MusicMood = 'silent'
let nextNoteTime = 0
let step = 0
let timer: number | null = null
let layerTargets = { pad: 0, bass: 0, lead: 0, drums: 0, hats: 0 }
const layerGain: Record<string, GainNode> = {}

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12)

// Seeded melodic phrases so the lead repeats like a composed hook.
function phrase(seed: number): (number | null)[] {
  let s = seed
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647 }
  const notes: (number | null)[] = []
  let deg = 2
  for (let i = 0; i < 16; i++) {
    if (r() < 0.32) { notes.push(null); continue }
    deg = Math.max(0, Math.min(9, deg + Math.round((r() - 0.5) * 4)))
    const oct = Math.floor(deg / 5)
    notes.push(72 + PENTA[deg % 5] + oct * 12 - 12)
  }
  return notes
}
const PHRASES = [phrase(7), phrase(13), phrase(7), phrase(29)]

function ensureLayers() {
  if (!ctx || layerGain.pad) return
  for (const k of ['pad', 'bass', 'lead', 'drums', 'hats']) {
    const g = ctx.createGain()
    g.gain.value = 0
    g.connect(musicBus)
    if (k === 'pad' || k === 'lead') {
      const w = ctx.createGain(); w.gain.value = 0.35
      g.connect(w).connect(reverbSend)
    }
    layerGain[k] = g
  }
}

export function setMusic(m: MusicMood) {
  if (!ctx) return
  ensureLayers()
  if (m === mood) return
  mood = m
  layerTargets = {
    menu: { pad: 0.7, bass: 0.35, lead: 0.45, drums: 0, hats: 0.25 },
    explore: { pad: 0.6, bass: 0.5, lead: 0.4, drums: 0.35, hats: 0.3 },
    tension: { pad: 0.5, bass: 0.7, lead: 0.15, drums: 0.6, hats: 0.55 },
    boss: { pad: 0.45, bass: 0.85, lead: 0.5, drums: 0.85, hats: 0.7 },
    arena: { pad: 0.3, bass: 0.8, lead: 0.6, drums: 0.9, hats: 0.8 },
    victory: { pad: 0.8, bass: 0.6, lead: 0.7, drums: 0.5, hats: 0.4 },
    silent: { pad: 0, bass: 0, lead: 0, drums: 0, hats: 0 },
  }[m]
  const t = ctx.currentTime
  for (const [k, v] of Object.entries(layerTargets)) layerGain[k].gain.setTargetAtTime(v, t, 0.8)
  if (timer === null && m !== 'silent') {
    nextNoteTime = ctx.currentTime + 0.1
    timer = window.setInterval(schedule, 25)
  }
}

function schedule() {
  if (!ctx) return
  while (nextNoteTime < ctx.currentTime + 0.12) {
    playStep(step, nextNoteTime)
    nextNoteTime += SPB / 4 / (mood === 'boss' || mood === 'arena' ? 1.12 : 1)
    step++
  }
}

function note(bus: GainNode, type: OscillatorType, freq: number, t: number, dur: number, vol: number, attack = 0.01, cutoff = 0) {
  const c = ctx!
  const o = c.createOscillator()
  o.type = type
  o.frequency.value = freq
  const g = c.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(vol, t + attack)
  g.gain.setTargetAtTime(0, t + dur * 0.6, dur * 0.35)
  let n: AudioNode = o
  if (cutoff) {
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; f.Q.value = 2
    o.connect(f); n = f
  }
  n.connect(g).connect(bus)
  o.start(t)
  o.stop(t + dur + 0.6)
}

function drum(kind: 'kick' | 'snare' | 'hat', t: number, vol: number) {
  const c = ctx!
  const bus = kind === 'hat' ? layerGain.hats : layerGain.drums
  if (kind === 'kick') {
    const o = c.createOscillator(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.16)
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3)
    o.connect(g).connect(bus); o.start(t); o.stop(t + 0.32)
    return
  }
  const src = c.createBufferSource(); src.buffer = noiseBuf
  const f = c.createBiquadFilter()
  f.type = kind === 'hat' ? 'highpass' : 'bandpass'
  f.frequency.value = kind === 'hat' ? 7000 : 1800
  const g = c.createGain()
  const d = kind === 'hat' ? 0.04 : 0.14
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + d)
  src.connect(f).connect(g).connect(bus); src.start(t, Math.random()); src.stop(t + d + 0.02)
  if (kind === 'snare') {
    const o = c.createOscillator(); o.frequency.value = 190
    const og = c.createGain(); og.gain.setValueAtTime(vol * 0.5, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.08)
    o.connect(og).connect(bus); o.start(t); o.stop(t + 0.1)
  }
}

function playStep(s: number, t: number) {
  if (mood === 'silent') return
  const bar = Math.floor(s / 16)
  const inBar = s % 16
  const chord = CHORDS[bar % 4]
  const beatDur = SPB
  // Pad: sustained chord each bar.
  if (inBar === 0) for (const n of chord) note(layerGain.pad, 'triangle', mtof(n + 12), t, beatDur * 4, 0.05, 0.4)
  if (inBar === 0) for (const n of chord.slice(0, 2)) note(layerGain.pad, 'sawtooth', mtof(n + 12) * 1.003, t, beatDur * 4, 0.012, 0.6, 1400)
  // Bass: root + fifth bounce.
  if (inBar % 4 === 0 || inBar === 6 || inBar === 14) {
    const root = chord[0] - 12
    const n = inBar === 6 || inBar === 14 ? root + 7 : root
    note(layerGain.bass, 'square', mtof(n), t, beatDur * 0.45, 0.13, 0.005, 700)
  }
  // Lead: plucky pentatonic hook.
  const ph = PHRASES[Math.floor(bar / 2) % PHRASES.length]
  const ln = ph[inBar]
  if (ln !== null && ln !== undefined && inBar % 1 === 0) note(layerGain.lead, 'square', mtof(ln), t, beatDur * 0.3, 0.035, 0.004, 2600)
  if (ln !== null && ln !== undefined) note(layerGain.lead, 'sine', mtof(ln + 12), t, beatDur * 0.35, 0.04, 0.002)
  // Drums.
  if (inBar === 0 || inBar === 8 || (mood === 'boss' && inBar === 10)) drum('kick', t, 0.6)
  if (inBar === 4 || inBar === 12) drum('snare', t, 0.25)
  if (inBar % 2 === 0) drum('hat', t, inBar % 4 === 2 ? 0.16 : 0.09)
}

/** Short stinger used for big moments; ducks the music briefly. */
export function stinger() {
  duckMusic(0.35)
  window.setTimeout(() => duckMusic(1), 2200)
}
