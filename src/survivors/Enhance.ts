import { emptyEnhance, statsOf } from '@/data/equipment'
import { itemPlus, withPlus } from '@/data/items'
import { countItem, inventoryOf, removeItem } from '@/inventory/Inventory'
import { findContainer } from '@/simulation/EntityRegistry'
import type { EquipSlot, SurvivorAttributes, SurvivorState, WorldState } from '@/simulation/types'
import { applyEquipmentStats } from './Equipment'

export const ENHANCE_MAX = 10

export const ATTR_KEYS: Array<{ id: keyof SurvivorAttributes; label: string }> = [
  { id: 'strength', label: '力量' },
  { id: 'agility', label: '敏捷' },
  { id: 'constitution', label: '体质' },
  { id: 'intelligence', label: '智力' },
]

const PROFESSION_ATTR: Record<string, Array<keyof SurvivorAttributes>> = {
  hunter: ['agility', 'strength', 'constitution', 'intelligence'],
  fisher: ['constitution', 'agility', 'intelligence', 'strength'],
  scavenger: ['agility', 'intelligence', 'constitution', 'strength'],
  hauler: ['strength', 'constitution', 'agility', 'intelligence'],
  builder: ['intelligence', 'strength', 'constitution', 'agility'],
}

export function wornPlus(survivor: SurvivorState, slot: EquipSlot): number {
  const worn = survivor.equipment[slot]
  return Math.max(survivor.enhance?.[slot] ?? 0, worn ? itemPlus(worn) : 0)
}

export function enhanceCost(plus: number): number {
  return 6 + plus * 4
}

export function enhanceChance(plus: number): number {
  if (plus < 5) return 1
  if (plus === 5) return 0.85
  if (plus === 6) return 0.7
  if (plus === 7) return 0.5
  if (plus === 8) return 0.35
  return 0.2
}

export function tryEnhance(
  world: WorldState,
  survivor: SurvivorState,
  slot: EquipSlot,
): 'ok' | 'fail' | 'max' | 'no_item' | 'no_scrap' {
  if (!survivor.enhance) survivor.enhance = emptyEnhance()
  if (!survivor.equipment[slot]) return 'no_item'
  const plus = wornPlus(survivor, slot)
  if (plus >= ENHANCE_MAX) return 'max'
  const warehouse = findContainer(world, 'warehouse')
  if (!warehouse) return 'no_scrap'
  const stock = inventoryOf(world.inventories, warehouse.inventoryId)
  const cost = enhanceCost(plus)
  if (countItem(stock, 'scrap') < cost) return 'no_scrap'
  removeItem(stock, 'scrap', cost)
  const roll = enhanceRoll(`${survivor.id}:${slot}:${plus}:${world.time.daySeconds.toFixed(2)}`)
  if (roll >= enhanceChance(plus)) return 'fail'
  survivor.enhance[slot] = plus + 1
  applyEquipmentStats(survivor)
  return 'ok'
}

export function spendAttr(survivor: SurvivorState, key: keyof SurvivorAttributes): boolean {
  if (survivor.attrPoints <= 0) return false
  survivor.attrPoints -= 1
  survivor.attributes[key] += 1
  applyEquipmentStats(survivor)
  return true
}

export function allocateProfession(survivor: SurvivorState): void {
  const order = PROFESSION_ATTR[survivor.professionId] ?? ATTR_KEYS.map((entry) => entry.id)
  let index = 0
  while (survivor.attrPoints > 0 && order[0]) {
    const key = order[index % order.length] ?? 'strength'
    spendAttr(survivor, key)
    index += 1
  }
}

export function combatRating(survivor: SurvivorState): number {
  const stats = statsOf(survivor)
  const plus = wornPlus(survivor, 'weapon')
  return (
    stats.total.strength * 4
    + stats.total.agility * 3
    + stats.total.constitution * 3
    + stats.total.intelligence * 2
    + stats.attackPower * 2
    + survivor.level * 8
    + plus * 14
  )
}

export function slotItemId(survivor: SurvivorState, slot: EquipSlot): string | null {
  const worn = survivor.equipment[slot]
  if (!worn) return null
  return withPlus(worn, wornPlus(survivor, slot))
}

function enhanceRoll(seed: string): number {
  let hash = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return ((hash >>> 0) % 10_000) / 10_000
}
