import { structureHp } from '@/base/construction'
import { countItem, inventoryOf } from '@/inventory/Inventory'
import { rushUpgrade } from '@/jobs/JobPlanner'
import { findContainer } from '@/simulation/EntityRegistry'
import type { ItemStack, StructureState, WorldState } from '@/simulation/types'

export const HALL_MAX_LEVEL = 5

export function structureLevel(structure: StructureState): number {
  return Math.max(1, structure.level || 1)
}

export function hallLevel(world: WorldState): number {
  const hall = world.structures.find((entry) => entry.definitionId === 'hall' && entry.stage === 'complete')
  return hall ? structureLevel(hall) : 1
}

export function facilityCap(world: WorldState): number {
  return hallLevel(world)
}

export function canUpgrade(world: WorldState, structure: StructureState): boolean {
  if (structure.stage !== 'complete' || structure.upgrading) return false
  const cap = structure.definitionId === 'hall' ? HALL_MAX_LEVEL : facilityCap(world)
  if (structure.definitionId !== 'hall' && structureLevel(structure) >= cap) return false
  return structureLevel(structure) < cap
}

export function upgradeCost(structure: StructureState): ItemStack[] {
  const next = structureLevel(structure) + 1
  if (structure.definitionId === 'hall') {
    return [
      { itemId: 'wood', count: 36 + (next - 1) * 24 },
      { itemId: 'scrap', count: 12 + (next - 1) * 10 },
    ]
  }
  return [
    { itemId: 'wood', count: 8 + (next - 1) * 6 },
    { itemId: 'scrap', count: 4 + (next - 1) * 3 },
  ]
}

export function markUpgrade(world: WorldState, structure: StructureState): boolean {
  if (!canUpgrade(world, structure)) return false
  structure.upgrading = true
  structure.upgradeRequired = upgradeCost(structure)
  structure.upgradeElapsed = 0
  structure.upgradeDuration = structure.definitionId === 'hall' ? 8 + structure.level * 3 : 4 + structure.level
  rushUpgrade(world, structure.id)
  return true
}

export function cancelUpgrade(structure: StructureState): void {
  structure.upgrading = false
  structure.upgradeRequired = []
  structure.upgradeElapsed = 0
}

export function finishUpgrade(world: WorldState, structure: StructureState): void {
  structure.level = structureLevel(structure) + 1
  structure.upgrading = false
  structure.upgradeRequired = []
  structure.upgradeElapsed = 0
  applyUpgradeStats(world, structure)
}

export function applyUpgradeStats(world: WorldState, structure: StructureState): void {
  const base = structureHp(structure.kind)
  const nextMax = Math.round(base * (1 + 0.28 * (structureLevel(structure) - 1)))
  const gained = Math.max(0, nextMax - structure.maxHp)
  structure.maxHp = nextMax
  structure.hp = Math.min(structure.maxHp, structure.hp + gained)
  if (structure.definitionId === 'warehouse') {
    const warehouse = findContainer(world, 'warehouse')
    if (warehouse) {
      const stock = inventoryOf(world.inventories, warehouse.inventoryId)
      stock.capacity = 1600 + (structureLevel(structure) - 1) * 400
    }
  }
}

export function upgradeProgress(structure: StructureState): number {
  if (!structure.upgrading || structure.upgradeDuration <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((structure.upgradeElapsed / structure.upgradeDuration) * 100)))
}

export function kitchenBonus(world: WorldState): number {
  const kitchen = world.structures.find((entry) => entry.definitionId === 'kitchen' && entry.stage === 'complete')
  return kitchen ? (structureLevel(kitchen) - 1) * 0.1 : 0
}

export function warehouseHasUpgradeMats(world: WorldState, structure: StructureState): boolean {
  const warehouse = world.inventories['inv-warehouse']
  if (!warehouse) return false
  return structure.upgradeRequired.every((item) => countItem(warehouse, item.itemId) >= item.count)
}
