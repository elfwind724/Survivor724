import type { DefenseSectorId, ItemRarity } from '@/simulation/types'

export interface EnemyDefinition {
  id: 'wanderer' | 'runner'
  health: number
  moveSpeed: number
  damage: number
  attackRange: number
  attackCooldown: number
}

export const ENEMY_DEFINITIONS: Record<EnemyDefinition['id'], EnemyDefinition> = {
  wanderer: { id: 'wanderer', health: 88, moveSpeed: 2.35, damage: 10, attackRange: 1.45, attackCooldown: 1.05 },
  runner: { id: 'runner', health: 56, moveSpeed: 3.85, damage: 8, attackRange: 1.35, attackCooldown: 0.78 },
}

export const NIGHT_HORDE = { wanderers: 18, runners: 8 }

export function raidHordeExtra(entered: boolean, best: ItemRarity | null): { wanderers: number; runners: number } {
  if (!entered) return { wanderers: 0, runners: 0 }
  if (best === 'legendary') return { wanderers: -2, runners: -1 }
  if (best === 'rare') return { wanderers: 0, runners: 0 }
  if (best === 'magic') return { wanderers: 2, runners: 1 }
  return { wanderers: 6, runners: 3 }
}

export function emptyDayNoise(): Record<DefenseSectorId, number> {
  return { north: 0, east: 0, west: 0, south: 0 }
}

export function sectorOfPoint(x: number, z: number): DefenseSectorId {
  if (Math.abs(x) >= Math.abs(z)) return x >= 0 ? 'east' : 'west'
  return z >= 0 ? 'north' : 'south'
}

export function loudestGunshotSector(noise: Record<DefenseSectorId, number> | undefined): DefenseSectorId | null {
  if (!noise) return null
  let best: DefenseSectorId | null = null
  let value = 0
  for (const id of ['north', 'east', 'west', 'south'] as const) {
    const count = noise[id] ?? 0
    if (count > value) {
      best = id
      value = count
    }
  }
  return best
}

export function gunshotHordeExtra(shots: number): { wanderers: number; runners: number } {
  const n = Math.max(0, Math.floor(shots))
  return {
    wanderers: Math.min(12, Math.floor(n / 5)),
    runners: Math.min(6, Math.floor(n / 10)),
  }
}

export function hordeCounts(
  dayIndex: number,
  raid?: { entered: boolean; best: ItemRarity | null },
): { wanderers: number; runners: number } {
  const night = Math.max(1, dayIndex)
  const extra = raidHordeExtra(raid?.entered === true, raid?.best ?? null)
  return {
    wanderers: Math.max(8, NIGHT_HORDE.wanderers + (night - 1) * 4 + extra.wanderers),
    runners: Math.max(4, NIGHT_HORDE.runners + (night - 1) * 2 + extra.runners),
  }
}
