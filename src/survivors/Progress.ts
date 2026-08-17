import { applyEquipmentStats } from './Equipment'
import type { SurvivorState } from '@/simulation/types'

export function xpToNext(level: number): number {
  return 36 + level * 18
}

export function grantXp(survivor: SurvivorState, amount: number): boolean {
  survivor.xp += amount
  let leveled = false
  while (survivor.xp >= xpToNext(survivor.level)) {
    survivor.xp -= xpToNext(survivor.level)
    survivor.level += 1
    applyLevelBonus(survivor)
    leveled = true
  }
  if (leveled) applyEquipmentStats(survivor)
  return leveled
}

export function applyLevelBonus(survivor: SurvivorState): void {
  const level = survivor.level
  if (level % 2 === 0) survivor.attributes.strength += 1
  if (level % 2 === 1) survivor.attributes.agility += 1
  if (level % 3 === 0) survivor.attributes.constitution += 1
  if (level % 4 === 0) survivor.attributes.intelligence += 1
  survivor.health = Math.min(140, survivor.health + 8)
}
