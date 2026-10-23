/** Every gameplay number lives here so balancing happens in one place. */
export const GRAVITY = 26

export const MINI = {
  radius: 0.3,
  halfHeight: 0.2, // capsule cylinder half height → total height 1.0 m
  feet: 0.5, // centre → feet
  speed: 5,
  carrySpeed: 4,
  accelGround: 55,
  decelGround: 70,
  accelAir: 24,
  turnRate: 16,
  jumpHeight: 1.15,
  jumpCut: 2.4, // gravity multiplier when releasing jump early
  fallMult: 1.45,
  apexHang: 0.55,
  coyote: 0.12,
  buffer: 0.12,
  boostVel: 14.5, // landing on the partner's head bounces you up (springboard)
  cableRange: 4.25,
  cableSpeed: 46,
  reelSpeed: 5,
  minRope: 1.1,
  chargeTime: 0.8,
  releaseBoost: 2.6, // upward kick when letting go mid-swing
  yankSpeed: 8.5, // tap the hook: short pull toward the anchor
  launchMin: 9,
  launchMax: 15.5,
  gloveRange: 1.75, // grab partner's offered hand
  assistGloveRange: 2.3,
  boxRange: 1.4,
  hoistDelay: 0.25,
  hoistTime: 0.55,
  knockProtect: 1.5,
  punchRange: 2.4, // fist jab reach for bells, buttons and enemies
  punchPartnerRange: 1.9,
  punchCooldown: 0.35,
  clingTime: 1.8, // wall grip before you slide off
  clingSlide: 0.35, // m/s slide while gripping
  clingReach: 0.62, // centre → wall distance that counts as touching
  wallJumpUp: 0.85, // × jump velocity
  wallJumpOut: 4.2,
  towReach: 1.5, // grab your partner's body within this distance
  towRest: 1.15, // dragged partner trails at this distance
  towBreak: 3.6,
  towSpeed: 3.6, // walking speed while dragging
  respawnDelay: 1.1,
}

export const BIG = {
  radius: 0.72,
  halfHeight: 0.38,
  feet: 1.1,
  speed: 3.6,
  oneLegSpeed: 1.25,
  accelGround: 22,
  accelAir: 10,
  turnRate: 5.5,
  hopVel: 6.4,
  jointVel: 12.4,
  jointForward: 2.6,
  armRange: 8,
  armSpeed: 38,
  reelSpeed: 5.5,
  minRope: 2.2,
  jumpWindow: 0.25,
  soundWindow: 0.3,
  cableWindow: 0.35,
  assistWindow: 0.45,
  coupleHold: 0.6,
  coupleSpan: 2,
  mergeTime: 1.2,
  gripRange: 2.2,
  punchRange: 3.6,
}

export const NET = {
  poseHz: 30,
  worldHz: 30,
}

/** Button colours: the world lights up in the colour of the button that acts on it. */
export const BTN_COLOR = {
  jump: '#3ec46d',
  grab: '#4f9bff',
  punch: '#ff5b4a',
  context: '#c46bff',
}

export const COLORS = {
  cyan: '#22c7d6',
  cyanDeep: '#0f8f9e',
  amber: '#ff9a1f',
  amberDeep: '#d9670b',
  ivory: '#f1e7d2',
  ivoryShade: '#d8c9ab',
  joint: '#3a3d45',
  visor: '#0b0f17',
  sole: '#4a3a33',
}

export const SLOT_COLOR = [COLORS.cyan, COLORS.amber] as const
export const SLOT_NAME = ['Cian', 'Ámbar'] as const
