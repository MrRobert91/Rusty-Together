import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { usePerf } from '../../core/device'

/** Turns real-time shadows off on the low tier (blob shadows take over). */
export function ShadowToggle() {
  const gl = useThree((s) => s.gl)
  const tier = usePerf((s) => s.tier)
  useEffect(() => {
    gl.shadowMap.enabled = tier !== 'low'
    gl.shadowMap.needsUpdate = true
  }, [gl, tier])
  return null
}
