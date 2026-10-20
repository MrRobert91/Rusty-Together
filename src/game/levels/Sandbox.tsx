import { Block } from '../env/blocks'
import { Ring, Crate, CouplePlate, SafetyNet, SpringPad, Sign } from '../env/interactive'
import { defineCheckpoints } from './checkpoints'

export function setupSandbox() {
  defineCheckpoints([{ id: 's0', room: 0, a: [-1.5, 1, 0], b: [1.5, 1, 0], yaw: Math.PI, joined: [0, 0, 0] }])
}

export function Sandbox() {
  return (
    <>
      <Block pos={[0, 0, 0]} size={[16, 6, 16]} />
      <Block pos={[0, 0, -14]} size={[8, 6, 8]} />
      <Block pos={[0, 1, -24]} size={[8, 7, 8]} />
      <Ring id="r1" pos={[0, 4, -19.5]} mount="hang" />
      <SafetyNet pos={[0, -2, -19.5]} size={[8, 3]} returnTo={[0, 0, -16]} />
      <Crate id="box1" pos={[3, 1, 3]} />
      <Crate id="box2" pos={[4.5, 1, 3]} label="CIAN" labelColor="#22c7d6" />
      <CouplePlate id="p1" pos={[-4, 0.02, 4]} />
      <SpringPad pos={[4, 0, -3]} />
      <Sign pos={[-5, 2, -6]} text="Banco" sub="de pruebas" />
    </>
  )
}
