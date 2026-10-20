import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { useHud } from '../game/hud'
import { useVoice } from '../net/voice'
import { currentDevice, glyph, onDeviceChange, type Btn, type Device } from '../core/input'
import { G, localSlot, peerSlot } from '../game/runtime'
import { cameraRef } from '../game/CameraRig'
import { SLOT_COLOR, SLOT_NAME } from '../game/tuning'
import { useApp } from './appStore'
import { backToMenu, startSolo } from './App'
import { lobbySend } from '../net/online'
import { useSettings } from '../core/settings'

function useDevice() {
  const [d, setD] = useState<Device>(currentDevice())
  useEffect(() => { const off = onDeviceChange(setD); return () => { off() } }, [])
  return d
}

export function Key({ btn, device }: { btn: Btn; device: Device }) {
  const g = glyph(btn, device)
  const padColor = device === 'pad' ? ({ A: '#3ec46d', B: '#e8483b', X: '#3a8cf0', Y: '#f2c21d' } as Record<string, string>)[g] : undefined
  return <span className={`key ${device} ${g.length > 2 ? 'wide' : ''}`} style={padColor ? { background: padColor, color: '#10131a' } : undefined}>{g}</span>
}

export function Hud() {
  const h = useHud()
  const device = useDevice()
  const voice = useVoice()
  const session = useApp((s) => s.session)
  const me = localSlot()
  const other = peerSlot()
  const showFps = useSettings((s) => s.showFps)

  return (
    <div className={`hud ${h.letterbox ? 'letterbox' : ''}`}>
      {/* Portraits */}
      <div className="portraits">
        {[me, other].map((slot, i) => (
          <div key={slot} className={`portrait slot${slot} ${i === 0 ? 'me' : ''}`}>
            <div className="portrait-face"><i /><i /></div>
            <div className="portrait-meta">
              <div className="portrait-name">{SLOT_NAME[slot]}{i === 0 ? ' (tú)' : session?.mode === 'solo' ? ' · bot' : ''}</div>
              <div className="portrait-sub">
                {h.form === 'joined' ? (slot === 0 ? 'Brazo/pierna izq.' : 'Brazo/pierna der.') : 'Mini robot'}
                {i === 0 && voice.micState === 'on' && <span className={`mic ${voice.muted ? 'off' : voice.talking && voice.localLevel > 0.02 ? 'live' : ''}`}>{voice.muted ? '🔇' : '🎙'}</span>}
                {i === 1 && session?.mode === 'online' && voice.remoteSpeaking && <span className="mic live">🔊</span>}
              </div>
            </div>
          </div>
        ))}
        <div className="module">
          <div className="module-icon">➰</div>
          <div>
            <div className="module-name">Elasticidad</div>
            <ModuleBar />
          </div>
        </div>
      </div>

      {h.form === 'joined' && <PilotPanel />}

      {/* Room title card */}
      {h.roomTitle && (
        <div className="room-title" key={h.roomTitle.title}>
          <div className="room-n">Sala {h.roomTitle.n}</div>
          <div className="room-name">{h.roomTitle.title}</div>
          <div className="room-mode">{h.roomTitle.mode}</div>
        </div>
      )}
      {h.objective && <div className="objective"><span>◆</span> {h.objective}</div>}
      {h.banner && (
        <div className="banner" key={h.banner.title} style={{ ['--bc' as any]: h.banner.color ?? '#ffd23a' }}>
          <div className="banner-title">{h.banner.title}</div>
          {h.banner.sub && <div className="banner-sub">{h.banner.sub}</div>}
        </div>
      )}
      {h.arena && <ArenaBoard />}

      {/* Prompts */}
      <div className="prompts">
        {h.prompts.map((p) => (
          <div key={p.id} className="prompt">
            {p.btn && <Key btn={p.btn} device={device} />}
            {p.hold && <span className="hold">mantén</span>}
            <span>{p.text}</span>
            {p.progress !== undefined && p.progress > 0 && <div className="prompt-progress"><div style={{ width: `${p.progress * 100}%` }} /></div>}
          </div>
        ))}
      </div>

      {h.subtitle && <div className="subtitle"><b style={{ color: h.subtitle.color }}>{h.subtitle.who}:</b> {h.subtitle.text}</div>}
      <div className="toasts in-game">
        {h.toasts.map((t) => <div key={t.id} className={`toast ${t.tone}`}>{t.text}</div>)}
      </div>
      {h.stickers.length > 0 && <div className="stickers">{h.stickers.map((s, i) => <span key={i} title="Pegatina de sesión">{s}</span>)}</div>}

      <PartnerArrow />
      <Crosshair />
      <ClickToPlay />
      {showFps && <Fps />}
      <div className="fade" style={{ opacity: h.fade }} />
      {h.levelDone && <LevelDone />}
    </div>
  )
}

function ModuleBar() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let raf = 0
    const loop = () => {
      const me = G.minis[localSlot()]
      let v = 0
      if (G.form === 'joined') v = G.big.tension
      else if (me.cable.state === 'attached') v = me.cable.charge > 0 ? me.cable.charge : 0.25
      else if (me.cable.state !== 'idle') v = 0.1
      if (ref.current) {
        ref.current.style.width = `${v * 100}%`
        ref.current.classList.toggle('full', v >= 0.99)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  return <div className="module-bar"><div ref={ref} /></div>
}

function PilotPanel() {
  const ready = useHud((s) => s.pilotReady)
  const legs = useHud((s) => s.pilotLegs)
  const tension = useHud((s) => s.tension)
  const me = localSlot()
  return (
    <div className="pilots">
      {[0, 1].map((i) => {
        const l = legs[i]
        const mag = Math.min(1, Math.hypot(l.x, l.y))
        const yaw = G.cam.yaw
        // World move → screen-relative arrow.
        const sx = l.x * Math.cos(yaw) - l.y * Math.sin(yaw)
        const sy = -(l.x * Math.sin(yaw) + l.y * Math.cos(yaw))
        const ang = Math.atan2(sx, -sy)
        return (
          <div key={i} className={`pilot slot${i} ${i === me ? 'me' : ''}`} style={{ ['--pc' as any]: SLOT_COLOR[i] }}>
            <div className="pilot-ring" style={{ transform: `scale(${1 + ready[i] * 0.25})`, boxShadow: ready[i] > 0.1 ? `0 0 ${24 * ready[i]}px ${SLOT_COLOR[i]}` : undefined }}>
              {mag > 0.1 && <div className="pilot-arrow" style={{ transform: `rotate(${ang}rad)`, opacity: 0.4 + mag * 0.6 }} />}
            </div>
            <div className="pilot-label">{i === 0 ? 'Izq.' : 'Der.'} · {SLOT_NAME[i]}</div>
          </div>
        )
      })}
      {tension > 0.02 && (
        <div className="tension">
          <div className="tension-label">{tension > 0.95 ? '¡TENSIÓN MÁXIMA!' : 'Tensión'}</div>
          <div className="tension-bar"><div style={{ width: `${tension * 100}%` }} /></div>
        </div>
      )}
    </div>
  )
}

function ArenaBoard() {
  const a = useHud((s) => s.arena)!
  return (
    <div className="arena-board">
      <div className="arena-score slot0">{a.scores[0]}</div>
      <div className="arena-mid">
        <div className="arena-phase">{a.phase}</div>
        <div className="arena-time">{Math.ceil(a.time)}</div>
        <div className="arena-round">Ronda {a.round}/2</div>
      </div>
      <div className="arena-score slot1">{a.scores[1]}</div>
    </div>
  )
}

function PartnerArrow() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let raf = 0
    const v = new THREE.Vector3()
    const loop = () => {
      const el = ref.current
      const cam = cameraRef.current
      const p = G.minis[peerSlot()]
      if (el && cam) {
        const show = G.form === 'split' && !p.hidden && !p.dead
        v.copy(p.view?.headWorld && p.view.headWorld.lengthSq() > 0 ? p.view.headWorld : p.pos)
        v.project(cam)
        const behind = v.z > 1
        const off = behind || Math.abs(v.x) > 0.95 || Math.abs(v.y) > 0.9
        if (show && off) {
          let x = v.x, y = v.y
          if (behind) { x = -x; y = -y }
          const m = Math.max(Math.abs(x) / 0.9, Math.abs(y) / 0.82, 1e-3)
          x /= m; y /= m
          el.style.display = 'flex'
          el.style.left = `${(x * 0.5 + 0.5) * 100}%`
          el.style.top = `${(-y * 0.5 + 0.5) * 100}%`
          el.style.setProperty('--ang', `${Math.atan2(-y, x)}rad`)
          const d = G.minis[localSlot()].pos.distanceTo(p.pos)
          el.dataset.dist = `${Math.round(d)} m`
        } else el.style.display = 'none'
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  const s = peerSlot()
  return <div ref={ref} className={`partner-arrow slot${s}`} style={{ display: 'none' }}><span className="pa-tip" /><span className="pa-name">{SLOT_NAME[s]}</span></div>
}

function Crosshair() {
  const form = useHud((s) => s.form)
  if (form === 'joined') return null
  return <div className="crosshair" />
}

function ClickToPlay() {
  const [locked, setLocked] = useState(!!document.pointerLockElement)
  const paused = useHud((s) => s.paused)
  const done = useHud((s) => s.levelDone)
  const device = useDevice()
  useEffect(() => {
    const f = () => setLocked(!!document.pointerLockElement)
    document.addEventListener('pointerlockchange', f)
    return () => document.removeEventListener('pointerlockchange', f)
  }, [])
  if (locked || paused || done || device === 'pad' || location.search.includes('nooverlay')) return null
  return (
    <div className="click-to-play" onClick={() => { const c = document.querySelector('canvas'); c?.requestPointerLock?.() }}>
      <div>Haz clic para jugar</div>
      <small>Ratón para mirar · Esc para pausar · o conecta un mando</small>
    </div>
  )
}

function Fps() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let raf = 0, frames = 0, last = performance.now()
    const loop = () => {
      frames++
      const now = performance.now()
      if (now - last > 500) { if (ref.current) ref.current.textContent = `${Math.round((frames * 1000) / (now - last))} fps · ${Math.round((G.session?.rtt ?? 0) * 1000)} ms`; frames = 0; last = now }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  return <div className="fps" ref={ref} />
}

const MEDAL_INFO: Record<string, [string, string]> = {
  rescue: ['🤝', 'Os habéis rescatado en ambos sentidos'],
  chain: ['🔗', 'Tres anillos enlazados sin caer'],
  box: ['📦', 'Una caja ha pasado por las manos de los dos'],
  bells: ['🔔', 'Carrera de muelles completada'],
  crab: ['🦀', 'Cangrejo clasificador desactivado'],
  noFall: ['🪶', 'Sin caídas en el clímax'],
  tutorial: ['🎓', 'Taller de pruebas completado'],
}

function LevelDone() {
  const d = useHud((s) => s.levelDone)!
  const session = useApp((s) => s.session)
  const isSolo = session?.mode === 'solo'
  const isTutorial = G.level === 'tutorial'
  const mins = Math.floor(d.time / 60)
  const secs = Math.floor(d.time % 60)
  return (
    <div className="level-done">
      <div className="ld-card">
        <div className="ld-kicker">{isTutorial ? 'Tutorial completado' : 'Nivel 1 · Muelles de rebote'}</div>
        <div className="ld-title">{isTutorial ? '¡Listos para la fábrica!' : '¡Fusible recuperado!'}</div>
        <div className="ld-time">{mins}:{String(secs).padStart(2, '0')}</div>
        <div className="ld-stats">
          {Object.entries(d.stats).map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}
        </div>
        <div className="ld-medals">
          {d.medals.length === 0 && <div className="muted">Sin medallas esta vez… ¡a por la revancha!</div>}
          {d.medals.map((m) => <div key={m} className="medal"><span>{MEDAL_INFO[m]?.[0] ?? '⭐'}</span>{MEDAL_INFO[m]?.[1] ?? m}</div>)}
        </div>
        <div className="ld-actions">
          {isSolo ? (
            <>
              <button className="menu-btn primary" data-nav onClick={() => startSolo(G.level)}>Repetir</button>
              <button className="menu-btn" data-nav onClick={backToMenu}>Menú principal · jugar online</button>
            </>
          ) : session?.isHost ? (
            <>
              <button className="menu-btn primary" data-nav onClick={() => lobbySend('lobby')}>Volver a la sala</button>
              <button className="menu-btn" data-nav onClick={backToMenu}>Salir</button>
            </>
          ) : (
            <>
              <div className="muted">El anfitrión decide si repetís.</div>
              <button className="menu-btn" data-nav onClick={backToMenu}>Salir</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
