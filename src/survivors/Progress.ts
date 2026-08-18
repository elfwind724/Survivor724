import { ensureSkills, skillXpToNext } from '@/data/skills'
import { applyEquipmentStats } from './Equipment'
import type { SkillId, SurvivorState, WorldState } from '@/simulation/types'

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

export function recordWorkYield(
  world: WorldState,
  survivor: SurvivorState,
  itemId: string,
  count: number,
  xp: number,
  skillId: SkillId | null = null,
): void {
  if (xp > 0) grantXp(survivor, xp)
  if (skillId && xp > 0) grantSkillXp(survivor, skillId, xp)
  survivor.lastYieldItem = itemId
  survivor.lastYieldCount = count
  survivor.lastYieldXp = xp
  survivor.lastYieldAt = world.time.dayIndex * world.time.dayLengthSeconds + world.time.daySeconds
}

export function grantSkillXp(survivor: SurvivorState, id: SkillId, amount: number): boolean {
  const skills = ensureSkills(survivor)
  const skill = skills[id]
  if (!skill || amount <= 0) return false
  skill.xp += amount
  let leveled = false
  while (skill.xp >= skillXpToNext(skill.level)) {
    skill.xp -= skillXpToNext(skill.level)
    skill.level += 1
    leveled = true
  }
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
