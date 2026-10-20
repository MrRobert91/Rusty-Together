declare module 'yuka' {
  export class Vector3 { x: number; y: number; z: number; constructor(x?: number, y?: number, z?: number); set(x: number, y: number, z: number): this; copy(v: Vector3): this; length(): number }
  export class GameEntity { position: Vector3; name: string; update(delta: number): this }
  export class MovingEntity extends GameEntity { velocity: Vector3; maxSpeed: number; maxForce: number; mass: number }
  export class SteeringBehavior { active: boolean; weight: number }
  export class ArriveBehavior extends SteeringBehavior { target: Vector3; deceleration: number; tolerance: number; constructor(target?: Vector3, deceleration?: number, tolerance?: number) }
  export class SeekBehavior extends SteeringBehavior { target: Vector3; constructor(target?: Vector3) }
  export class WanderBehavior extends SteeringBehavior { constructor(radius?: number, distance?: number, jitter?: number) }
  export class SteeringManager { add(b: SteeringBehavior): this; remove(b: SteeringBehavior): this; clear(): this; calculate(delta: number, result: Vector3): Vector3 }
  export class Vehicle extends MovingEntity { steering: SteeringManager; smoother: unknown }
  export class EntityManager { add(e: GameEntity): this; remove(e: GameEntity): this; update(delta: number): this; clear(): this }
  export class State<T = any> { enter(owner: T): void; execute(owner: T): void; exit(owner: T): void }
  export class StateMachine<T = any> { owner: T; currentState: State<T> | null; previousState: State<T> | null; globalState: State<T> | null; states: Map<string, State<T>>; constructor(owner?: T); add(id: string, state: State<T>): this; changeTo(id: string): this; revert(): this; update(): this; in(id: string): boolean }
  export class Time { update(): this; getDelta(): number }
}
