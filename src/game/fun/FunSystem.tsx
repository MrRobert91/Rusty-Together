import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { G, fx, isHost, onFx, type Mini } from '../runtime'
import { sfx } from '../../core/audio'
import { settings } from '../../core/settings'
import { tier } from '../../core/device'
import { FIVE_WINDOW, highFive, resetHighFive } from './highfive'
import { SLOT_COLOR } from '../tuning'

/**
 * The fun layer that lives inside the 3D scene: high-five reactions, sparkly
 * trails behind anything launched, and golden motes floating in the air.
 */
export function FunSystem() {
  useEffect(() => {
    resetHighFive()
    const offs = [
      onFx('highfive', (e: { a: 0 | 1; b: 0 | 1; p: number[] }) => {
        const p = { x: e.p[0], y: e.p[1], z: e.p[2] }
        sfx('clap', p)
        sfx('yay', p, 0.7, 1.1)
        fx('particles', { n: 'stars', p }, false)
        fx('particles', { n: 'burst', p, c: '#ff9ce8', s: 0.8 }, false)
        fx('particles', { n: 'confetti', p }, false)
        if (!settings().reduceShake) G.cam.shake = Math.min(1, G.cam.shake + 0.18)
        // Owned robots turn to each other and cheer (the cheer replicates).
        for (const s of [e.a, e.b]) {
          const m = G.minis[s]
          const o = G.minis[s === 0 ? 1 : 0]
          if (m.kind === 'remote') continue
          m.yaw = Math.atan2(o.pos.x - m.pos.x, o.pos.z - m.pos.z)
          m.emote = 2
          m.emoteT = G.time
        }
      }),
    ]
    return () => offs.forEach((o) => o())
  }, [])

  // Host: both raise a hand next to each other → automatic high five.
  useFrame(() => {
    if (!isHost() || G.form !== 'split' || G.vars.arenaLive) return
    const [a, b] = G.minis
    const up = (m: Mini) => !m.hidden && !m.dead && m.emote === 1 && G.time - m.emoteT < FIVE_WINDOW
    if (up(a) && up(b) && a.pos.distanceTo(b.pos) < 2.4) highFive(a, b)
  })

  return (
    <>
      <Trails />
      <Motes />
    </>
  )
}

/* ------------------------------------------------------------ Sparkle trails */

const TRAIL_N = 36

function softDot() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grd.addColorStop(0, 'rgba(255,255,255,1)')
  grd.addColorStop(0.3, 'rgba(255,255,255,0.8)')
  grd.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 64, 64)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** Ribbon of glowing dots behind robots while they fly fast (launches, springs, slingshot). */
function Trails() {
  const camera = useThree((s) => s.camera)
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: softDot(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), [])
  const geo = useMemo(() => new THREE.PlaneGeometry(1, 1), [])
  const meshes = [useRef<THREE.InstancedMesh>(null!), useRef<THREE.InstancedMesh>(null!), useRef<THREE.InstancedMesh>(null!)]
  const st = useMemo(() => [0, 1, 2].map(() => ({ pts: Array.from({ length: TRAIL_N }, () => ({ p: new THREE.Vector3(), age: 9 })), head: 0, acc: 0 })), [])
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const col = useMemo(() => new THREE.Color(), [])
  const colors = useMemo(() => [new THREE.Color(SLOT_COLOR[0]).multiplyScalar(1.4), new THREE.Color(SLOT_COLOR[1]).multiplyScalar(1.4), new THREE.Color('#ffe6a8').multiplyScalar(1.4)], [])
  useEffect(() => {
    for (const r of meshes) {
      const m = r.current
      for (let i = 0; i < TRAIL_N; i++) m.setColorAt(i, col.setRGB(0, 0, 0))
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const off = settings().reduceFlashes
    for (let k = 0; k < 3; k++) {
      const s = st[k]
      const m = meshes[k].current
      let fast = false
      let pos: THREE.Vector3 | null = null
      if (k < 2) {
        const r = G.minis[k]
        const sp = r.vel.length()
        fast = !r.hidden && !r.dead && ((r.launchedT > 0 || r.boosting > 0) ? sp > 6 : sp > 11)
        pos = r.view?.rootWorld && r.view.rootWorld.lengthSq() > 0 ? r.view.rootWorld : r.pos
      } else {
        const B = G.big
        fast = B.active && !B.dead && B.launchedT > 0 && B.vel.length() > 6
        pos = B.view?.rootWorld ?? B.pos
      }
      if (fast && !off && pos) {
        s.acc += dt
        while (s.acc > 1 / 60) {
          s.acc -= 1 / 60
          const pt = s.pts[s.head]
          pt.p.copy(pos)
          pt.p.y += k === 2 ? 1.6 : 0.6
          pt.p.x += (Math.random() - 0.5) * 0.12
          pt.p.z += (Math.random() - 0.5) * 0.12
          pt.age = 0
          s.head = (s.head + 1) % TRAIL_N
        }
      }
      let any = false
      for (let i = 0; i < TRAIL_N; i++) {
        const pt = s.pts[i]
        pt.age += dt
        const life = 0.55
        const a = Math.max(0, 1 - pt.age / life)
        dummy.position.copy(pt.p)
        dummy.quaternion.copy(camera.quaternion)
        const size = (k === 2 ? 1.1 : 0.55) * (0.35 + a * 0.65)
        dummy.scale.set(size, size, size)
        dummy.updateMatrix()
        m.setMatrixAt(i, dummy.matrix)
        // Sparkle: a little flicker near the head of the trail.
        const tw = 0.75 + Math.sin(pt.age * 60 + i) * 0.25
        m.setColorAt(i, col.copy(colors[k]).multiplyScalar(a * a * tw))
        if (a > 0) any = true
      }
      m.visible = any
      m.instanceMatrix.needsUpdate = true
      if (m.instanceColor) m.instanceColor.needsUpdate = true
    }
  })
  return (
    <>
      {meshes.map((r, k) => <instancedMesh key={k} ref={r} args={[geo, mat, TRAIL_N]} frustumCulled={false} renderOrder={5} />)}
    </>
  )
}

/* ------------------------------------------------------------ Golden motes */

/** Dust motes and pollen drifting in the sunlight around the camera. */
function Motes() {
  const n = tier() === 'low' ? 90 : 220
  const { geo, mat } = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const pos = new Float32Array(n * 3)
    const seed = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 44
      pos[i * 3 + 1] = (Math.random() - 0.5) * 18
      pos[i * 3 + 2] = (Math.random() - 0.5) * 44
      seed[i] = Math.random()
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 1))
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { time: { value: 0 }, center: { value: new THREE.Vector3() }, scale: { value: 300 } },
      vertexShader: `
        uniform float time; uniform vec3 center; uniform float scale;
        attribute float seed; varying float vA;
        void main() {
          vec3 box = vec3(44.0, 18.0, 44.0);
          vec3 p = position + vec3(sin(time * 0.3 + seed * 20.0) * 1.5, time * (0.25 + seed * 0.35), cos(time * 0.25 + seed * 13.0) * 1.5);
          // Wrap around the camera target so motes are always nearby.
          p = mod(p - center + box * 0.5, box) - box * 0.5 + center;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float d = -mv.z;
          vA = (0.5 + 0.5 * sin(time * (1.5 + seed * 3.0) + seed * 40.0)) * smoothstep(60.0, 8.0, d) * smoothstep(0.5, 3.0, d);
          gl_PointSize = scale * (0.05 + seed * 0.07) / d;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vA;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float a = smoothstep(0.5, 0.0, length(c));
          gl_FragColor = vec4(vec3(1.0, 0.86, 0.55) * a * vA * 0.9, 1.0);
        }`,
    })
    return { geo: g, mat: m }
  }, [n])
  const size = useThree((s) => s.size)
  useFrame(() => {
    mat.uniforms.time.value = G.time
    mat.uniforms.center.value.copy(G.cam.target)
    mat.uniforms.scale.value = size.height * 0.9
  })
  return <points geometry={geo} material={mat} frustumCulled={false} renderOrder={4} />
}
