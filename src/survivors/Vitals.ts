import { skillHungerMult } from '@/data/skills'
import type { DayWorkerState, SurvivorState, WorldState } from '@/simulation/types'

const WORKING: ReadonlySet<DayWorkerState> = new Set([
  'AcquireEquipment',
  'TravelToTarget',
  'Work',
  'CollectOutput',
  'ReturnToBase',
  'DepositItems',
  'ReturnEquipment',
])

export function clampVital(value: number): number {
  return Math.max(0, Math.min(100, value))
}

export function stepVitals(world: WorldState, dt: number): void {
  const resting = world.time.phase === 'night' || world.time.phase === 'aftermath'
  for (const survivor of world.survivors) {
    const working = !resting && WORKING.has(survivor.workerState)
    const drain = skillHungerMult(survivor)
    const hungerRate = (resting ? -0.04 : working ? 0.02 : 0.008) * (resting ? 1 : drain)
    const thirstRate = (resting ? -0.08 : working ? 0.03 : 0.012) * (resting ? 1 : drain)
    survivor.hunger = clampVital(survivor.hunger - hungerRate * dt)
    survivor.thirst = clampVital(survivor.thirst - thirstRate * dt)
    if (survivor.hunger <= 0.5 || survivor.thirst <= 0.5) {
      survivor.health = Math.max(1, survivor.health - 0.2 * dt)
    }
  }
}

export function vitalPercent(survivor: SurvivorState, key: 'health' | 'hunger' | 'thirst'): number {
  return clampVital(survivor[key])
}
