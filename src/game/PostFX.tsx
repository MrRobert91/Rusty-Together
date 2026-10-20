import { EffectComposer, Bloom, Vignette, SMAA, ToneMapping, N8AO, HueSaturation, BrightnessContrast } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { useFrame } from '@react-three/fiber'
import { useSettings } from '../core/settings'
import { usePerf } from '../core/device'

/** Cinematic finish: AO, bloom on emissives, AA, gentle grade and vignette. */
export function PostFX() {
  const tier = usePerf((s) => s.tier)
  const reduceFlashes = useSettings((s) => s.reduceFlashes)
  if (tier === 'low') return <PlainRender />
  if (tier === 'medium') {
    return (
      <EffectComposer multisampling={0} enableNormalPass={false}>
        <Bloom mipmapBlur luminanceThreshold={0.9} intensity={reduceFlashes ? 0.3 : 0.6} radius={0.6} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <SMAA />
      </EffectComposer>
    )
  }
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <N8AO halfRes aoRadius={1.6} intensity={2.2} distanceFalloff={0.8} quality="performance" />
      <Bloom mipmapBlur luminanceThreshold={0.85} luminanceSmoothing={0.2} intensity={reduceFlashes ? 0.35 : 0.75} radius={0.7} />
      <HueSaturation saturation={0.18} />
      <BrightnessContrast contrast={0.1} brightness={-0.02} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <SMAA />
      <Vignette offset={0.28} darkness={0.42} />
    </EffectComposer>
  )
}

function PlainRender() {
  useFrame(({ gl, scene, camera }) => gl.render(scene, camera), 2)
  return null
}
