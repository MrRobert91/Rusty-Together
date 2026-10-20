import type { World, Collider, RigidBody } from '@dimforge/rapier3d-compat'
import * as RAPIER from '@dimforge/rapier3d-compat'
import { Vector3 } from 'three'

export interface GroundHit {
  hit: boolean
  dist: number
  normal: Vector3
  point: Vector3
  body: RigidBody | null
  collider: Collider | null
  ud: Record<string, any>
}

const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 })
const OFFS: [number, number][] = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]

/** Multi-ray ground probe from the capsule centre. Nearest valid hit wins. */
export function probeGround(world: World, from: Vector3, maxDist: number, radius: number, exclude: RigidBody | null, out: GroundHit) {
  out.hit = false
  out.dist = maxDist
  out.body = null
  out.collider = null
  out.ud = EMPTY
  for (const [ox, oz] of OFFS) {
    ray.origin.x = from.x + ox * radius * 0.7
    ray.origin.y = from.y
    ray.origin.z = from.z + oz * radius * 0.7
    ray.dir.x = 0; ray.dir.y = -1; ray.dir.z = 0
    const h = world.castRayAndGetNormal(ray, maxDist, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, exclude ?? undefined)
    if (h && h.timeOfImpact < out.dist && h.normal.y > 0.55) {
      out.hit = true
      out.dist = h.timeOfImpact
      out.normal.set(h.normal.x, h.normal.y, h.normal.z)
      out.point.set(ray.origin.x, ray.origin.y - h.timeOfImpact, ray.origin.z)
      out.collider = h.collider
      out.body = h.collider.parent()
      out.ud = ((out.body?.userData as Record<string, any>) ?? EMPTY)
    }
  }
  return out
}

const EMPTY: Record<string, any> = {}

export function newGroundHit(): GroundHit {
  return { hit: false, dist: 0, normal: new Vector3(0, 1, 0), point: new Vector3(), body: null, collider: null, ud: EMPTY }
}

const losRay = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 })
/** True if nothing solid blocks the segment a→b (sensors ignored). */
export function lineOfSight(world: World, a: Vector3, b: Vector3, exclude: RigidBody | null, slack = 0.35) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z
  const len = Math.hypot(dx, dy, dz)
  if (len < 0.01) return true
  losRay.origin.x = a.x; losRay.origin.y = a.y; losRay.origin.z = a.z
  losRay.dir.x = dx / len; losRay.dir.y = dy / len; losRay.dir.z = dz / len
  const h = world.castRay(losRay, len, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, exclude ?? undefined, (c) => !(c.parent()?.userData as any)?.robot)
  return !h || h.timeOfImpact > len - slack
}

/** Raycast returning the hit point, used by pings and the camera. */
export function raycastPoint(world: World, a: Vector3, dir: Vector3, max: number, exclude: RigidBody | null, out: Vector3) {
  losRay.origin.x = a.x; losRay.origin.y = a.y; losRay.origin.z = a.z
  losRay.dir.x = dir.x; losRay.dir.y = dir.y; losRay.dir.z = dir.z
  const h = world.castRay(losRay, max, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, exclude ?? undefined, (c) => !(c.parent()?.userData as any)?.robot)
  if (!h) return -1
  out.copy(a).addScaledVector(dir, h.timeOfImpact)
  return h.timeOfImpact
}
