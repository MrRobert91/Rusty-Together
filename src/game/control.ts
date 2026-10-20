import { Vector3 } from 'three'
import { BTNS, emptyFrame, pollInput, type Btn, type InputFrame } from '../core/input'

/**
 * Inputs are polled at render rate but consumed at the fixed physics rate.
 * Button presses are latched until a physics step consumes them, so a tap
 * shorter than one step is never lost.
 */
export interface StepInput {
  move: Vector3 // world-space XZ direction, |move| ≤ 1
  stick: { x: number; y: number }
  aim: Vector3 // world-space aim direction
  aimStick: { x: number; y: number }
  held: Record<Btn, boolean>
  pressed: Record<Btn, boolean>
  released: Record<Btn, boolean>
}

export function newStepInput(): StepInput {
  const f = emptyFrame()
  return { move: new Vector3(), stick: { x: 0, y: 0 }, aim: new Vector3(0, 0, -1), aimStick: { x: 0, y: 0 }, held: f.held, pressed: { ...f.pressed }, released: { ...f.released } }
}

export const human = {
  frame: emptyFrame() as InputFrame,
  latchedPressed: emptyFrame().pressed,
  latchedReleased: emptyFrame().released,
  /** Camera look delta accumulated this frame. */
  look: { x: 0, y: 0 },
}

export function pollHuman(dt: number) {
  const f = pollInput(dt)
  human.frame = f
  for (const b of BTNS) {
    if (f.pressed[b]) human.latchedPressed[b] = true
    if (f.released[b]) human.latchedReleased[b] = true
  }
  human.look.x = f.look.x
  human.look.y = f.look.y
  return f
}

/** Copy the human state into a StepInput and clear latched edges. */
export function consumeHuman(into: StepInput) {
  const f = human.frame
  into.stick.x = f.move.x
  into.stick.y = f.move.y
  into.aimStick.x = f.aim.x
  into.aimStick.y = f.aim.y
  for (const b of BTNS) {
    into.held[b] = f.held[b]
    into.pressed[b] = human.latchedPressed[b]
    into.released[b] = human.latchedReleased[b]
    human.latchedPressed[b] = false
    human.latchedReleased[b] = false
  }
}

export function clearEdges(i: StepInput) {
  for (const b of BTNS) { i.pressed[b] = false; i.released[b] = false }
}
