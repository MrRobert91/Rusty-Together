import { create } from 'zustand'
import { audioCtx, initAudio, voiceOutput } from '../core/audio'
import { settings } from '../core/settings'
import { currentRoom } from './online'

/**
 * Proximity voice chat. Peers connect over WebRTC (signaling through the
 * Colyseus room's WebRTC plugin). The remote voice is routed through an HRTF
 * panner positioned on the partner's robot, so it fades with distance and
 * comes from the right direction.
 */

export interface VoiceView {
  micState: 'off' | 'requesting' | 'on' | 'denied'
  muted: boolean
  talking: boolean // local mic gate open (PTT or open mic)
  localLevel: number
  remoteLevel: number
  remoteSpeaking: boolean
  connected: boolean
  proximity: number // 0..1 audible factor
}

export const useVoice = create<VoiceView>(() => ({
  micState: 'off', muted: false, talking: false, localLevel: 0, remoteLevel: 0, remoteSpeaking: false, connected: false, proximity: 1,
}))

const ICE: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }]
const turn = import.meta.env.VITE_TURN_URL as string | undefined
if (turn) ICE.push({ urls: turn, username: import.meta.env.VITE_TURN_USER as string, credential: import.meta.env.VITE_TURN_PASS as string })

/** Full volume within NEAR metres, silent beyond FAR. */
export const VOICE_NEAR = 7
export const VOICE_FAR = 32

let pc: RTCPeerConnection | null = null
let peerId: string | null = null
let micStream: MediaStream | null = null
let micAnalyser: AnalyserNode | null = null
let remoteAnalyser: AnalyserNode | null = null
let remoteGain: GainNode | null = null
let panner: PannerNode | null = null
let remoteEl: HTMLAudioElement | null = null
let sender: RTCRtpSender | null = null
let unbinders: Array<() => void> = []
let meterTimer = 0
let pttHeld = false

function send(type: string, payload: unknown) { currentRoom()?.send(type, payload) }

function makePeer(id: string) {
  closePeer()
  peerId = id
  pc = new RTCPeerConnection({ iceServers: ICE })
  const tr = pc.addTransceiver('audio', { direction: 'sendrecv' })
  sender = tr.sender
  if (micStream) sender.replaceTrack(micStream.getAudioTracks()[0]).catch(() => {})
  pc.onicecandidate = (e) => { if (e.candidate && peerId) send('webrtc:ice-candidate', { targetId: peerId, candidate: e.candidate.toJSON() }) }
  pc.onconnectionstatechange = () => useVoice.setState({ connected: pc?.connectionState === 'connected' })
  pc.ontrack = (e) => attachRemote(e.streams[0] ?? new MediaStream([e.track]))
  return pc
}

function attachRemote(stream: MediaStream) {
  initAudio()
  const ctx = audioCtx()
  if (!ctx) return
  // Chrome only pumps remote WebRTC audio into WebAudio when an element plays it.
  remoteEl?.remove()
  remoteEl = new Audio()
  remoteEl.srcObject = stream
  remoteEl.muted = true
  remoteEl.play().catch(() => {})
  const src = ctx.createMediaStreamSource(stream)
  remoteAnalyser = ctx.createAnalyser()
  remoteAnalyser.fftSize = 512
  remoteGain = ctx.createGain()
  panner = ctx.createPanner()
  panner.panningModel = 'HRTF'
  panner.distanceModel = 'linear'
  panner.refDistance = 1
  panner.maxDistance = 10000
  panner.rolloffFactor = 0 // distance handled by remoteGain for a designed curve
  src.connect(remoteAnalyser)
  src.connect(remoteGain).connect(panner).connect(voiceOutput())
  voiceLobbyMode()
}

function closePeer() {
  pc?.close()
  pc = null
  peerId = null
  sender = null
  remoteEl?.remove()
  remoteEl = null
  useVoice.setState({ connected: false, remoteSpeaking: false })
}

/** Join the voice mesh of the current room (receive-only until the mic is enabled). */
export function startVoice() {
  const room = currentRoom()
  if (!room) return
  stopVoice(false)
  unbinders.push(room.onMessage('webrtc:peers', async (ids: string[]) => {
    if (!ids.length) return
    const p = makePeer(ids[0])
    const offer = await p.createOffer()
    await p.setLocalDescription(offer)
    send('webrtc:offer', { targetId: ids[0], sdp: p.localDescription })
  }))
  unbinders.push(room.onMessage('webrtc:peer-joined', () => { /* newcomer sends the offer */ }))
  unbinders.push(room.onMessage('webrtc:offer', async (m: { peerId: string; sdp: RTCSessionDescriptionInit }) => {
    const p = makePeer(m.peerId)
    await p.setRemoteDescription(m.sdp)
    const ans = await p.createAnswer()
    await p.setLocalDescription(ans)
    send('webrtc:answer', { targetId: m.peerId, sdp: p.localDescription })
  }))
  unbinders.push(room.onMessage('webrtc:answer', async (m: { peerId: string; sdp: RTCSessionDescriptionInit }) => {
    if (pc && m.peerId === peerId) await pc.setRemoteDescription(m.sdp)
  }))
  unbinders.push(room.onMessage('webrtc:ice-candidate', async (m: { peerId: string; candidate: RTCIceCandidateInit }) => {
    if (pc && m.peerId === peerId) await pc.addIceCandidate(m.candidate).catch(() => {})
  }))
  unbinders.push(room.onMessage('webrtc:peer-left', () => closePeer()))
  send('webrtc:join', {})
  window.clearInterval(meterTimer)
  meterTimer = window.setInterval(meter, 60)
}

export function stopVoice(releaseMic = true) {
  unbinders.forEach((u) => u())
  unbinders = []
  closePeer()
  window.clearInterval(meterTimer)
  if (releaseMic) {
    micStream?.getTracks().forEach((t) => t.stop())
    micStream = null
    useVoice.setState({ micState: 'off', talking: false })
  }
}

export async function enableMic() {
  if (micStream) return
  useVoice.setState({ micState: 'requesting' })
  try {
    initAudio()
    const id = settings().micDeviceId
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, ...(id ? { deviceId: { exact: id } } : {}) },
    })
    const ctx = audioCtx()!
    micAnalyser = ctx.createAnalyser()
    micAnalyser.fftSize = 512
    ctx.createMediaStreamSource(micStream).connect(micAnalyser)
    if (sender) await sender.replaceTrack(micStream.getAudioTracks()[0])
    useVoice.setState({ micState: 'on' })
    applyGate()
  } catch {
    useVoice.setState({ micState: 'denied' })
  }
}

export function toggleMute() {
  useVoice.setState({ muted: !useVoice.getState().muted })
  applyGate()
}

export function setPushToTalk(held: boolean) {
  if (held === pttHeld) return
  pttHeld = held
  applyGate()
}

function applyGate() {
  const v = useVoice.getState()
  const open = !!micStream && !v.muted && (!settings().pushToTalk || pttHeld)
  micStream?.getAudioTracks().forEach((t) => { t.enabled = open })
  if (open !== v.talking) useVoice.setState({ talking: open })
}

const buf = new Uint8Array(512)
function rms(a: AnalyserNode | null) {
  if (!a) return 0
  a.getByteTimeDomainData(buf)
  let s = 0
  for (let i = 0; i < buf.length; i++) { const x = (buf[i] - 128) / 128; s += x * x }
  return Math.sqrt(s / buf.length)
}

function meter() {
  const v = useVoice.getState()
  const l = v.talking ? rms(micAnalyser) : 0
  const r = rms(remoteAnalyser) * v.proximity
  useVoice.setState({ localLevel: l, remoteLevel: r, remoteSpeaking: r > 0.02 })
}

type V3 = { x: number; y: number; z: number }

/**
 * Called every frame by the game: places the partner's voice on their robot
 * and applies the proximity curve between the two robots.
 */
export function updateVoiceSpatial(listenerPos: V3, listenerFwd: V3, speakerPos: V3, robotsDistance: number) {
  const ctx = audioCtx()
  if (!ctx || !panner || !remoteGain) return
  const t = ctx.currentTime
  const L = ctx.listener
  if (L.positionX) {
    L.positionX.setTargetAtTime(listenerPos.x, t, 0.05)
    L.positionY.setTargetAtTime(listenerPos.y, t, 0.05)
    L.positionZ.setTargetAtTime(listenerPos.z, t, 0.05)
    L.forwardX.setTargetAtTime(listenerFwd.x, t, 0.05)
    L.forwardY.setTargetAtTime(listenerFwd.y, t, 0.05)
    L.forwardZ.setTargetAtTime(listenerFwd.z, t, 0.05)
  }
  panner.positionX.setTargetAtTime(speakerPos.x, t, 0.05)
  panner.positionY.setTargetAtTime(speakerPos.y, t, 0.05)
  panner.positionZ.setTargetAtTime(speakerPos.z, t, 0.05)
  const k = Math.max(0, Math.min(1, 1 - (robotsDistance - VOICE_NEAR) / (VOICE_FAR - VOICE_NEAR)))
  const prox = k * k * (3 - 2 * k)
  remoteGain.gain.setTargetAtTime(0.05 + prox * 1.6, t, 0.1)
  if (Math.abs(prox - useVoice.getState().proximity) > 0.02) useVoice.setState({ proximity: prox })
}

/** Outside gameplay (lobby) the voice is non-spatial at full volume. */
export function voiceLobbyMode() {
  const ctx = audioCtx()
  if (!ctx || !panner || !remoteGain) return
  panner.positionX.value = ctx.listener.positionX?.value ?? 0
  panner.positionY.value = ctx.listener.positionY?.value ?? 0
  panner.positionZ.value = (ctx.listener.positionZ?.value ?? 0) - 1
  remoteGain.gain.value = 1.4
  useVoice.setState({ proximity: 1 })
}
