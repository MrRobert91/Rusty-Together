import { useEffect, useLayoutEffect, type RefObject } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Static batching: once the level has mounted, every mesh living under a
 * `userData.batch` group (scenery that never moves) is baked into a few big
 * meshes, one per material + shadow flags + 80 m cell. Materials are shared,
 * so animated material values (glows, scrolling belts) keep working; cells
 * keep frustum culling useful. Turns ~800 draw calls into ~120.
 */
const CELL = 80

export function StaticBatcher({ delayFrames = 3 }: { delayFrames?: number }) {
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    let raf = 0
    let frames = 0
    const created: THREE.Mesh[] = []
    const hidden: THREE.Mesh[] = []
    const run = () => {
      scene.updateMatrixWorld(true)
      const groups = new Map<string, { mat: THREE.Material; cast: boolean; recv: boolean; geos: THREE.BufferGeometry[] }>()
      const tmp = new THREE.Vector3()
      scene.traverse((o) => {
        const m = o as THREE.Mesh
        if (!m.isMesh || !m.visible || Array.isArray(m.material) || (m as any).isInstancedMesh || (m as any).isSkinnedMesh) return
        if (!underBatch(m)) return
        const g = m.geometry as THREE.BufferGeometry
        if (!g.attributes.position || g.morphAttributes.position) return
        m.getWorldPosition(tmp)
        const key = `${m.material.uuid}|${m.castShadow ? 1 : 0}|${m.receiveShadow ? 1 : 0}|${Math.floor(tmp.x / CELL)}|${Math.floor(tmp.z / CELL)}`
        let grp = groups.get(key)
        if (!grp) groups.set(key, (grp = { mat: m.material, cast: m.castShadow, recv: m.receiveShadow, geos: [] }))
        grp.geos.push(normalize(g, m.matrixWorld))
        hidden.push(m)
      })
      for (const grp of groups.values()) {
        if (!grp.geos.length) continue
        const merged = grp.geos.length === 1 ? grp.geos[0] : mergeGeometries(grp.geos, false)
        grp.geos.forEach((g) => { if (g !== merged) g.dispose() })
        if (!merged) continue
        merged.computeBoundingSphere()
        merged.computeBoundingBox()
        const mesh = new THREE.Mesh(merged, grp.mat)
        mesh.castShadow = grp.cast
        mesh.receiveShadow = grp.recv
        mesh.matrixAutoUpdate = false
        mesh.updateMatrix()
        mesh.name = 'static-batch'
        scene.add(mesh)
        created.push(mesh)
      }
      hidden.forEach((m) => { m.visible = false })
    }
    const tick = () => {
      if (++frames >= delayFrames) run()
      else raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      created.forEach((m) => { scene.remove(m); m.geometry.dispose() })
      hidden.forEach((m) => { m.visible = true })
    }
  }, [scene, delayFrames])
  return null
}

function underBatch(o: THREE.Object3D) {
  let p: THREE.Object3D | null = o
  while (p) {
    if (p.userData?.noBatch) return false
    if (p.userData?.batch) return true
    p = p.parent
  }
  return false
}

/** World-space, non-indexed copy with exactly position/normal/uv. */
export function normalize(g: THREE.BufferGeometry, world: THREE.Matrix4) {
  let c = g.index ? g.toNonIndexed() : g.clone()
  for (const name of Object.keys(c.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') c.deleteAttribute(name)
  if (!c.attributes.normal) c.computeVertexNormals()
  if (!c.attributes.uv) c.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(c.attributes.position.count * 2), 2))
  c.applyMatrix4(world)
  c.clearGroups()
  c = c as THREE.BufferGeometry
  return c
}

/**
 * Rig merge: inside an animated hierarchy, sibling meshes that share a
 * material and move together are baked into one mesh per parent. A robot goes
 * from ~55 draw calls to ~20 without changing how it animates.
 */
export function mergeRig(root: THREE.Object3D, vcMaterial?: THREE.Material) {
  const parents: THREE.Object3D[] = []
  root.traverse((o) => parents.push(o))
  for (const parent of parents) {
    const groups = new Map<string, { mats: THREE.Material[]; meshes: THREE.Mesh[]; vc: boolean }>()
    for (const c of parent.children) {
      const m = c as THREE.Mesh
      if (!m.isMesh || !m.visible || Array.isArray(m.material) || m.children.length || m.userData.noMerge) continue
      // Plain opaque, non-glowing parts can share one vertex-coloured material.
      const vc = !!vcMaterial && bakeable(m.material)
      const key = `${vc ? 'vc' : m.material.uuid}|${m.castShadow ? 1 : 0}|${m.receiveShadow ? 1 : 0}`
      let g = groups.get(key)
      if (!g) groups.set(key, (g = { mats: [], meshes: [], vc }))
      g.meshes.push(m)
    }
    for (const grp of groups.values()) {
      const list = grp.meshes
      if (list.length < 2) continue
      const geos = list.map((m) => {
        m.updateMatrix()
        const g = normalize(m.geometry, m.matrix)
        if (grp.vc) {
          const col = (m.material as THREE.MeshStandardMaterial).color
          const n = g.attributes.position.count
          const arr = new Float32Array(n * 3)
          for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b }
          g.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3))
        }
        return g
      })
      const merged = mergeGeometries(geos, false)
      geos.forEach((g) => g.dispose())
      if (!merged) continue
      merged.computeBoundingSphere()
      const mesh = new THREE.Mesh(merged, grp.vc ? vcMaterial! : list[0].material)
      mesh.castShadow = list[0].castShadow
      mesh.receiveShadow = list[0].receiveShadow
      mesh.name = 'rig-merge'
      parent.add(mesh)
      list.forEach((m) => { m.visible = false })
    }
  }
}

function bakeable(mat: THREE.Material) {
  const m = mat as THREE.MeshStandardMaterial
  if (!m.isMeshStandardMaterial || m.transparent || m.toneMapped === false) return false
  if (m.emissiveMap || (m.emissive && m.emissive.getHex() !== 0 && m.emissiveIntensity > 0)) return false
  return true
}

/** Merge a moving prop's parts once mounted (see mergeRig). */
export function useRigMerge(ref: RefObject<THREE.Object3D | null>, vc?: THREE.Material) {
  useLayoutEffect(() => { if (ref.current) mergeRig(ref.current, vc) }, []) // eslint-disable-line react-hooks/exhaustive-deps
}
