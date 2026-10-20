import { useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import {
  ApplyForce, BatchedRenderer, Bezier, ColorOverLife, ConeEmitter, ConstantColor, ConstantValue, Gradient, IntervalValue,
  ParticleSystem, PiecewiseBezier, RandomColor, RenderMode, RotationOverLife, SizeOverLife, SphereEmitter,
  Vector3 as QV3, Vector4 as QV4,
} from 'three.quarks'
import { onFx } from '../runtime'
import { settings } from '../../core/settings'
import { tier } from '../../core/device'

/**
 * Particle effects powered by three.quarks. Each effect is a small pool of
 * pre-built burst systems that get moved and restarted on demand, so spawning
 * never allocates during gameplay.
 */

export type FxName = 'dust' | 'step' | 'spark' | 'confetti' | 'burst' | 'merge' | 'poof' | 'ring' | 'trail' | 'stars'

function softTex() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grd.addColorStop(0, 'rgba(255,255,255,1)')
  grd.addColorStop(0.45, 'rgba(255,255,255,0.7)')
  grd.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 64, 64)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function puffTex() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  for (let i = 0; i < 6; i++) {
    const x = 20 + Math.random() * 24, y = 20 + Math.random() * 24, r = 12 + Math.random() * 10
    const grd = g.createRadialGradient(x, y, 0, x, y, r)
    grd.addColorStop(0, 'rgba(255,255,255,0.9)')
    grd.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grd
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function squareTex() {
  const c = document.createElement('canvas')
  c.width = c.height = 16
  const g = c.getContext('2d')!
  g.fillStyle = '#fff'
  g.fillRect(2, 4, 12, 8)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function starTex() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  g.translate(32, 32)
  g.fillStyle = '#fff'
  g.shadowColor = '#fff'
  g.shadowBlur = 8
  g.beginPath()
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 26 : 10
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  g.closePath()
  g.fill()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

const col = (hex: string, a = 1) => {
  const c = new THREE.Color(hex)
  return new QV4(c.r, c.g, c.b, a)
}
const fade = (a = 1) => new Gradient([[new QV3(1, 1, 1), 0], [new QV3(1, 1, 1), 1]], [[a, 0], [a, 0.6], [0, 1]])
const curve = (a: number, b: number, c: number, d: number) => new PiecewiseBezier([[new Bezier(a, b, c, d), 0]])

interface Pool { systems: ParticleSystem[]; idx: number }

export function Particles() {
  const scene = useThree((s) => s.scene)

  useEffect(() => {
    const batch = new BatchedRenderer()
    scene.add(batch)
    const soft = softTex()
    const puff = puffTex()
    const square = squareTex()
    const star = starTex()
    const add = (m: THREE.Texture, blending: THREE.Blending = THREE.NormalBlending) =>
      new THREE.MeshBasicMaterial({ map: m, transparent: true, depthWrite: false, blending, toneMapped: false })

    const pools = new Map<FxName, Pool>()
    const make = (name: FxName, n: number, build: () => ParticleSystem) => {
      const systems: ParticleSystem[] = []
      for (let i = 0; i < n; i++) {
        const ps = build()
        scene.add(ps.emitter)
        batch.addSystem(ps)
        ps.pause()
        systems.push(ps)
      }
      pools.set(name, { systems, idx: 0 })
    }
    const burst = (count: number) => [{ time: 0, count: new ConstantValue(count), cycle: 1, interval: 0.01, probability: 1 }]

    make('dust', 6, () => new ParticleSystem({
      duration: 1, looping: false, worldSpace: true, autoDestroy: false,
      startLife: new IntervalValue(0.35, 0.7), startSpeed: new IntervalValue(1.2, 3.2), startSize: new IntervalValue(0.25, 0.5),
      startColor: new ConstantColor(col('#e8dcc4', 0.85)), startRotation: new IntervalValue(0, 6.28),
      emissionOverTime: new ConstantValue(0), emissionBursts: burst(14),
      shape: new ConeEmitter({ radius: 0.3, angle: 1.35, thickness: 1, arc: Math.PI * 2 }),
      material: add(puff), renderMode: RenderMode.BillBoard,
      behaviors: [new SizeOverLife(curve(0.6, 1.2, 1.5, 1.7)), new ColorOverLife(fade(0.9)), new ApplyForce(new QV3(0, 1, 0), new ConstantValue(1.5))],
    }))
    make('step', 8, () => new ParticleSystem({
      duration: 0.5, looping: false, worldSpace: true, autoDestroy: false,
      startLife: new IntervalValue(0.25, 0.45), startSpeed: new IntervalValue(0.4, 1.2), startSize: new IntervalValue(0.12, 0.22),
      startColor: new ConstantColor(col('#eadfca', 0.7)),
      emissionOverTime: new ConstantValue(0), emissionBursts: burst(4),
      shape: new ConeEmitter({ radius: 0.1, angle: 1.2, thickness: 1, arc: Math.PI * 2 }),
      material: add(puff), renderMode: RenderMode.BillBoard,
      behaviors: [new SizeOverLife(curve(0.6, 1, 1.2, 1.3)), new ColorOverLife(fade(0.8))],
    }))
    make('spark', 6, () => new ParticleSystem({
      duration: 0.5, looping: false, worldSpace: true, autoDestroy: false,
      startLife: new IntervalValue(0.2, 0.45), startSpeed: new IntervalValue(5, 11), startSize: new IntervalValue(0.05, 0.1),
      startColor: new ConstantColor(col('#ffd36b')), startLength: new ConstantValue(0.4),
      emissionOverTime: new ConstantValue(0), emissionBursts: burst(18),
      shape: new SphereEmitter({ radius: 0.1, thickness: 1, arc: Math.PI * 2 }),
      material: add(soft, THREE.AdditiveBlending), renderMode: RenderMode.StretchedBillBoard, speedFactor: 0.05,
      rendererEmitterSettings: { speedFactor: 0.04, lengthFactor: 0.2 } as any,
      behaviors: [new ApplyForce(new QV3(0, -1, 0), new ConstantValue(16)), new ColorOverLife(fade(1)), new SizeOverLife(curve(1, 0.8, 0.5, 0))],
    }))
    make('burst', 6, () => new ParticleSystem({
      duration: 0.6, looping: false, worldSpace: true, autoDestroy: false,
      startLife: new IntervalValue(0.3, 0.6), startSpeed: new IntervalValue(2, 6), startSize: new IntervalValue(0.15, 0.35),
      startColor: new ConstantColor(col('#ffffff')),
      emissionOverTime: new ConstantValue(0), emissionBursts: burst(22),
      shape: new SphereEmitter({ radius: 0.2, thickness: 1, arc: Math.PI * 2 }),
      material: add(soft, THREE.AdditiveBlending), renderMode: RenderMode.BillBoard,
      behaviors: [new SizeOverLife(curve(1, 0.9, 0.5, 0)), new ColorOverLife(fade(1))],
    }))
    make('stars', 4, () => new ParticleSystem({
      duration: 0.8, looping: false, worldSpace: true, autoDestroy: false,
      startLife: new IntervalValue(0.5, 0.9), startSpeed: new IntervalValue(2, 5), startSize: new IntervalValue(0.2, 0.4),
      startColor: new ConstantColor(col('#fff3a0')), startRotation: new IntervalValue(0, 6.28),
      emissionOverTime: new ConstantValue(0), emissionBursts: burst(12),
      shape: new ConeEmitter({ radius: 0.2, angle: 0.9, thickness: 1, arc: Math.PI * 2 }),
      material: add(star, THREE.AdditiveBlending), renderMode: RenderMode.BillBoard,
      behaviors: [new ApplyForce(new QV3(0, -1, 0), new ConstantValue(7)), new RotationOverLife(new IntervalValue(-4, 4)), new SizeOverLife(curve(1, 1, 0.7, 0))],
    }))
    make('ring', 4, () => new ParticleSystem({
      duration: 0.6, looping: false, worldSpace: true, autoDestroy: false,
      startLife: new ConstantValue(0.45), startSpeed: new ConstantValue(5), startSize: new ConstantValue(0.22),
      startColor: new ConstantColor(col('#ffffff')),
      emissionOverTime: new ConstantValue(0), emissionBursts: burst(28),
      shape: new ConeEmitter({ radius: 0.3, angle: Math.PI / 2, thickness: 0, arc: Math.PI * 2 }),
      material: add(soft, THREE.AdditiveBlending), renderMode: RenderMode.BillBoard,
      behaviors: [new SizeOverLife(curve(1, 0.8, 0.4, 0)), new ColorOverLife(fade(1))],
    }))
    make('confetti', 3, () => new ParticleSystem({
      duration: 2.5, looping: false, worldSpace: true, autoDestroy: false,
      startLife: new IntervalValue(1.6, 2.6), startSpeed: new IntervalValue(6, 12), startSize: new IntervalValue(0.12, 0.22),
      startColor: new RandomColor(col('#22c7d6'), col('#ff9a1f')), startRotation: new IntervalValue(0, 6.28),
      emissionOverTime: new ConstantValue(0), emissionBursts: burst(70),
      shape: new ConeEmitter({ radius: 0.4, angle: 0.6, thickness: 1, arc: Math.PI * 2 }),
      material: add(square), renderMode: RenderMode.BillBoard,
      behaviors: [new ApplyForce(new QV3(0, -1, 0), new ConstantValue(9)), new RotationOverLife(new IntervalValue(-8, 8)), new ColorOverLife(new Gradient([[new QV3(1, 1, 1), 0], [new QV3(1, 0.85, 1), 1]], [[1, 0], [1, 0.8], [0, 1]]))],
    }))
    make('poof', 4, () => new ParticleSystem({
      duration: 0.8, looping: false, worldSpace: true, autoDestroy: false,
      startLife: new IntervalValue(0.4, 0.8), startSpeed: new IntervalValue(1, 3), startSize: new IntervalValue(0.4, 0.8),
      startColor: new ConstantColor(col('#ffffff', 0.9)),
      emissionOverTime: new ConstantValue(0), emissionBursts: burst(16),
      shape: new SphereEmitter({ radius: 0.4, thickness: 1, arc: Math.PI * 2 }),
      material: add(puff), renderMode: RenderMode.BillBoard,
      behaviors: [new SizeOverLife(curve(0.5, 1.2, 1.4, 1.5)), new ColorOverLife(fade(0.9))],
    }))
    make('merge', 2, () => new ParticleSystem({
      duration: 1, looping: false, worldSpace: true, autoDestroy: false,
      startLife: new IntervalValue(0.6, 1.1), startSpeed: new IntervalValue(4, 10), startSize: new IntervalValue(0.2, 0.5),
      startColor: new RandomColor(col('#5ef0ff'), col('#ffb347')),
      emissionOverTime: new ConstantValue(0), emissionBursts: burst(90),
      shape: new SphereEmitter({ radius: 0.6, thickness: 1, arc: Math.PI * 2 }),
      material: add(soft, THREE.AdditiveBlending), renderMode: RenderMode.BillBoard,
      behaviors: [new SizeOverLife(curve(1, 0.8, 0.4, 0)), new ApplyForce(new QV3(0, 1, 0), new ConstantValue(2))],
    }))

    const spawn = (name: FxName, p: { x: number; y: number; z: number }, color?: string, dir?: { x: number; y: number; z: number }, scale = 1) => {
      if (tier() === 'low' && (name === 'step' || name === 'trail')) return
      if (settings().reduceFlashes && (name === 'burst' || name === 'merge')) scale *= 0.6
      const pool = pools.get(name)
      if (!pool) return
      const ps = pool.systems[pool.idx]
      pool.idx = (pool.idx + 1) % pool.systems.length
      ps.emitter.position.set(p.x, p.y, p.z)
      if (dir) ps.emitter.lookAt(p.x + dir.x, p.y + dir.y, p.z + dir.z)
      else ps.emitter.rotation.set(-Math.PI / 2, 0, 0) // cones point up
      ps.emitter.scale.setScalar(scale)
      ps.emitter.updateMatrixWorld(true)
      if (color && name !== 'confetti' && name !== 'merge') ps.startColor = new ConstantColor(col(color, name === 'dust' ? 0.85 : 1))
      ps.restart()
      ps.play()
    }

    const off = onFx('particles', (e) => spawn(e.n, e.p, e.c, e.d, e.s))
    ;(window as any).__spawnFx = spawn
    batchRef.current = batch
    return () => {
      off()
      pools.forEach((p) => p.systems.forEach((s) => { batch.deleteSystem(s); scene.remove(s.emitter); s.dispose() }))
      scene.remove(batch)
      batchRef.current = null
    }
  }, [scene])

  useFrame((_, dt) => batchRef.current?.update(Math.min(dt, 0.05)))
  return null
}

const batchRef: { current: BatchedRenderer | null } = { current: null }
