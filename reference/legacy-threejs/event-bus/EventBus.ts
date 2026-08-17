import * as THREE from 'three'

export interface GameEvents {
  'game:state_change': { from: string; to: string }
  'game:start': void
  'player:damage': { amount: number; source: string }
  'player:heal': { amount: number }
  'player:stat_change': { stat: string; value: number }
  'survival:warning': {
    resource: 'hunger' | 'thirst'
    level: 'low' | 'critical' | 'empty'
    value: number
  }
  'body:warning': {
    kind: 'cold' | 'hot' | 'sick' | 'recovered'
    temperature: number
    cause?: 'cold' | 'heat'
  }
  'vehicle:damage': { amount: number }
  'vehicle:impact': { enemyId: string; enemyType: string; speed: number; durabilityDamage: number }
  'vehicle:fuel_change': { current: number; max: number }
  'vehicle:upgrade': { part: string; level: number }
  'vehicle:warning': {
    resource: 'fuel' | 'durability'
    level: 'low' | 'critical'
    value: number
    max: number
  }
  'vehicle:disabled': { reason: 'durability' | 'fuel' }
  'enemy:spawn': { type: string; position: THREE.Vector3 }
  'enemy:death': { id: string }
  'combat:enemy_killed': {
    context: 'dungeon' | 'road' | null
    type: string
    baseType: string
    owner: string
    stableId: string | null
    position: THREE.Vector3
  }
  'story:state_changed': { kind: 'clue' | 'monologue' | 'node' | 'flag'; id: string; value?: string | number | boolean }
  'horde:start': { tier: 'white' | 'yellow' | 'red'; waves: number; total: number }
  'horde:complete': { tier: 'white' | 'yellow' | 'red'; total: number }
  'dungeon:enter': { dungeonId: string }
  'dungeon:exit': { result: 'win' | 'flee' | 'death' }
  'item:pickup': { item: string; count: number }
  'event:trigger': { eventId: string; data?: unknown }
  'day:pass': { day: number }
  'ui:update': { component: string; data?: unknown }
}

type Listener<T> = (payload: T) => void

export class EventBus {
  private listeners = new Map<keyof GameEvents, Set<Listener<any>>>()

  on<K extends keyof GameEvents>(event: K, callback: Listener<GameEvents[K]>): void {
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set()
      this.listeners.set(event, set)
    }
    set.add(callback)
  }

  off<K extends keyof GameEvents>(event: K, callback: Listener<GameEvents[K]>): void {
    this.listeners.get(event)?.delete(callback)
  }

  emit<K extends keyof GameEvents>(event: K, payload: GameEvents[K]): void {
    this.listeners.get(event)?.forEach((cb) => {
      try {
        cb(payload)
      } catch (err) {
        console.error(`[EventBus] Error in handler for "${String(event)}":`, err)
      }
    })
  }

  clear(): void {
    this.listeners.clear()
  }

  listenerCount(event: keyof GameEvents): number {
    return this.listeners.get(event)?.size ?? 0
  }
}
