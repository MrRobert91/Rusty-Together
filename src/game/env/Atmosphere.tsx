import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer } from '@react-three/drei'
import * as THREE from 'three'
import { G } from '../runtime'
import { puffTex, strataTex, grassTex } from './textures'
import { usePerf, tier } from '../../core/device'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const SUN = new THREE.Vector3(60, 80, 40)

/** Levels set where the playable space is so the scenery frames it instead of blocking it. */
export const backdropCfg = { cx: 0, cz: -60, inner: 85 }

/** Sky, sun, fill light, fog and image-based lighting built from lightformers (no HDR downloads). */
export function Atmosphere() {
  const light = useRef<THREE.DirectionalLight>(null!)
  const scene = useThree((s) => s.scene)
  const t = usePerf((s) => s.tier)
  const high = useMemo(() => tier() === 'high', [])

  useMemo(() => {
    scene.fog = new THREE.Fog('#c4e2fa', 110, 560)
    scene.background = new THREE.Color('#8cc6f2')
  }, [scene])

  useFrame(() => {
    const l = light.current
    if (!l) return
    const t = G.cam.target
    l.position.set(t.x + SUN.x * 0.5, t.y + SUN.y * 0.5, t.z + SUN.z * 0.5)
    l.target.position.copy(t)
    l.target.updateMatrixWorld()
  })

  return (
    <>
      <SkyDome />
      <hemisphereLight args={['#d6ecff', '#c27f55', 0.85]} />
      <directionalLight
        ref={light}
        color="#fff0d6"
        intensity={2.6}
        castShadow={t !== 'low'}
        shadow-mapSize={high ? [2048, 2048] : [1024, 1024]}
        shadow-camera-left={-28}
        shadow-camera-right={28}
        shadow-camera-top={28}
        shadow-camera-bottom={-28}
        shadow-camera-near={1}
        shadow-camera-far={220}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={2.2} color="#bfe3ff" position={[0, 10, 0]} rotation-x={Math.PI / 2} scale={[40, 40, 1]} />
        <Lightformer form="rect" intensity={1.4} color="#ffd7a8" position={[20, 5, 10]} scale={[20, 10, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={0.8} color="#d98a5c" position={[0, -8, 0]} rotation-x={-Math.PI / 2} scale={[40, 40, 1]} />
        <Lightformer form="ring" intensity={3} color="#ffffff" position={[-15, 8, -15]} scale={6} target={[0, 0, 0]} />
      </Environment>
      <CloudSea count={t === 'low' ? 90 : t === 'medium' ? 170 : 260} />
      <Backdrop />
    </>
  )
}

/** Billboard cloud puffs: a sea below the floating city and a few drifting banks. */
function CloudSea({ count }: { count: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null!)
  const N = 260
  const data = useMemo(() => {
    let s = 7
    const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647 }
    return Array.from({ length: N }, (_, i) => {
      const sea = i < 190
      const ang = r() * Math.PI * 2
      const rad = sea ? 20 + r() * 260 : backdropCfg.inner + r() * 220
      return {
        p: new THREE.Vector3(Math.cos(ang) * rad + backdropCfg.cx, sea ? -34 + r() * 8 : 10 + r() * 50, Math.sin(ang) * rad + backdropCfg.cz),
        s: sea ? 18 + r() * 26 : 10 + r() * 22,
        speed: 0.3 + r() * 0.6,
      }
    })
  }, [])
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: puffTex(), transparent: true, depthWrite: false, color: '#ffffff', fog: true, opacity: 0.92 }), [])
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const camera = useThree((s) => s.camera)
  useFrame((_, dt) => {
    const m = mesh.current
    m.count = count
    for (let i = 0; i < count; i++) {
      const d = data[i]
      d.p.x += d.speed * dt
      if (d.p.x > 340) d.p.x -= 600
      dummy.position.copy(d.p)
      dummy.quaternion.copy(camera.quaternion)
      dummy.scale.set(d.s * 1.6, d.s, 1)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
    }
    m.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={mesh} args={[undefined, undefined, N]} material={mat} frustumCulled={false} renderOrder={-1}><planeGeometry args={[1, 1]} /></instancedMesh>
}

/** Distant red-rock mesas, floating islands and scaffold towers (merged for one draw call each). */
function Backdrop() {
  const { rock, grass, towers } = useMemo(() => {
    let s = 99
    const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647 }
    const rocks: THREE.BufferGeometry[] = []
    const tops: THREE.BufferGeometry[] = []
    const tw: THREE.BufferGeometry[] = []
    for (let i = 0; i < 46; i++) {
      const ang = r() * Math.PI * 2
      const rad = backdropCfg.inner + 10 + r() * 170
      const x = Math.cos(ang) * rad + backdropCfg.cx
      const z = Math.sin(ang) * rad + backdropCfg.cz
      const h = 30 + r() * 70
      const w = 8 + r() * 22
      const floating = r() < 0.35
      const y0 = floating ? -10 + r() * 30 : -60
      const g = new THREE.CylinderGeometry(w * (0.8 + r() * 0.3), w * (floating ? 0.35 : 1.05), floating ? h * 0.45 : h, 7 + Math.floor(r() * 4), 4)
      // Jitter for a hand-carved look.
      const pos = g.attributes.position as THREE.BufferAttribute
      for (let k = 0; k < pos.count; k++) {
        const px = pos.getX(k), pz = pos.getZ(k)
        const n = 1 + (Math.sin(px * 0.7 + i) + Math.cos(pz * 0.6 - i)) * 0.06
        pos.setXYZ(k, px * n, pos.getY(k), pz * n)
      }
      g.computeVertexNormals()
      const hh = floating ? h * 0.45 : h
      g.translate(x, y0 + hh / 2, z)
      rocks.push(g)
      const top = new THREE.CylinderGeometry(w * (0.8 + 0.05), w * 0.82, 1.2, 9)
      top.translate(x, y0 + hh + 0.4, z)
      tops.push(top)
      if (r() < 0.45) {
        // Scaffold tower with a lamp on top.
        const th = 10 + r() * 22
        for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const leg = new THREE.BoxGeometry(0.4, th, 0.4)
          leg.translate(x + ox * 1.6, y0 + hh + th / 2, z + oz * 1.6)
          tw.push(leg)
        }
        for (let k = 1; k < th; k += 3) {
          const ring = new THREE.BoxGeometry(3.6, 0.25, 3.6)
          ring.translate(x, y0 + hh + k, z)
          tw.push(ring)
        }
        const cab = new THREE.BoxGeometry(4.5, 2.4, 4.5)
        cab.translate(x, y0 + hh + th + 1.2, z)
        tw.push(cab)
      }
    }
    return { rock: mergeGeometries(rocks), grass: mergeGeometries(tops), towers: tw.length ? mergeGeometries(tw) : null }
  }, [])
  const rockMat = useMemo(() => {
    const t = strataTex().clone()
    t.needsUpdate = true
    t.repeat.set(3, 2)
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95, color: '#e8b49a' })
  }, [])
  const grassMat = useMemo(() => new THREE.MeshStandardMaterial({ map: grassTex(), roughness: 1, color: '#b5d47a' }), [])
  return (
    <group>
      <mesh geometry={rock} material={rockMat} />
      <mesh geometry={grass} material={grassMat} />
      {towers && <mesh geometry={towers} material={useMemo(() => new THREE.MeshStandardMaterial({ color: '#5b6270', roughness: 0.6, metalness: 0.5 }), [])} />}
    </group>
  )
}

/** Painted sky: deep blue zenith, bright horizon, warm sun glow. Ignores fog. */
function SkyDome() {
  const camera = useThree((s) => s.camera)
  const mesh = useRef<THREE.Mesh>(null!)
  const mat = useMemo(() => new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      zenith: { value: new THREE.Color('#2f86e0') },
      mid: { value: new THREE.Color('#79bdf3') },
      horizon: { value: new THREE.Color('#dff1ff') },
      below: { value: new THREE.Color('#b9daf2') },
      sunDir: { value: SUN.clone().normalize() },
      sunCol: { value: new THREE.Color('#fff2d2') },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w * 0.99999; }`,
    fragmentShader: `uniform vec3 zenith, mid, horizon, below, sunDir, sunCol; varying vec3 vDir;
      void main(){
        float h = vDir.y;
        vec3 c = h > 0.0 ? mix(horizon, mid, smoothstep(0.0, 0.22, h)) : mix(horizon, below, smoothstep(0.0, -0.3, h));
        c = h > 0.22 ? mix(mid, zenith, smoothstep(0.22, 0.85, h)) : c;
        float s = max(dot(normalize(vDir), sunDir), 0.0);
        c += sunCol * (pow(s, 600.0) * 3.0 + pow(s, 12.0) * 0.25);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  }), [])
  useFrame(() => { mesh.current.position.copy(camera.position) })
  return <mesh ref={mesh} material={mat} renderOrder={-10} frustumCulled={false}><sphereGeometry args={[800, 32, 16]} /></mesh>
}
