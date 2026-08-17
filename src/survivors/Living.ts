import { countItem, inventoryOf, removeItem } from '@/inventory/Inventory'
import { findContainer } from '@/simulation/EntityRegistry'
import { BASE } from '@/simulation/baseLayout'
import type { SurvivorState, Vec3, WorldState } from '@/simulation/types'
import { clampVital } from './Vitals'

export function insideBase(position: Vec3): boolean {
  return (
    position.x >= BASE.west - 2 &&
    position.x <= BASE.east + 2 &&
    position.z >= BASE.south - 2 &&
    position.z <= BASE.north + 2
  )
}

export function stepLiving(world: WorldState): void {
  if (world.time.phase === world.lastPhase) return
  if (world.time.phase === 'dusk') eatAtBase(world)
  if (world.time.phase === 'night') punishLateField(world)
  if (world.time.phase === 'aftermath') {
    eatAtBase(world)
    recoverAfterNight(world)
  }
}

export function eatAtBase(world: WorldState): number {
  const warehouse = findContainer(world, 'warehouse')
  if (!warehouse) return 0
  const stock = inventoryOf(world.inventories, warehouse.inventoryId)
  let fed = 0
  for (const survivor of world.survivors) {
    if (survivor.downed || !insideBase(survivor.position)) continue
    if (survivor.hunger >= 84 && survivor.thirst >= 80) continue
    if (removeItem(stock, 'meal', 1)) {
      survivor.hunger = clampVital(survivor.hunger + 38)
      survivor.thirst = clampVital(survivor.thirst + 16)
      fed += 1
      continue
    }
    if (removeItem(stock, 'raw_meat', 1) || removeItem(stock, 'raw_fish', 1)) {
      survivor.hunger = clampVital(survivor.hunger + 16)
      survivor.thirst = clampVital(survivor.thirst + 6)
      fed += 1
    }
  }
  return fed
}

export function punishLateField(world: WorldState): void {
  for (const survivor of world.survivors) {
    if (survivor.downed || insideBase(survivor.position)) continue
    survivor.hunger = clampVital(survivor.hunger - 18)
    survivor.thirst = clampVital(survivor.thirst - 14)
    survivor.fatigue = Math.min(100, survivor.fatigue + 22)
    survivor.morale = Math.max(0, survivor.morale - 8)
    survivor.health = Math.max(1, survivor.health - 10)
  }
}

function recoverAfterNight(world: WorldState): void {
  for (const survivor of world.survivors) {
    if (survivor.downed) {
      survivor.health = Math.min(36, survivor.health + 10)
      if (survivor.health >= 30) survivor.downed = false
      continue
    }
    if (insideBase(survivor.position)) {
      survivor.health = Math.min(100, survivor.health + 6)
      survivor.fatigue = Math.max(0, survivor.fatigue - 12)
    }
  }
}

export function rawFoodCount(world: WorldState, survivor?: SurvivorState): number {
  let total = 0
  if (survivor) {
    const bag = inventoryOf(world.inventories, survivor.inventoryId)
    total += countItem(bag, 'raw_meat') + countItem(bag, 'raw_fish')
  }
  const warehouse = findContainer(world, 'warehouse')
  if (warehouse) {
    const stock = inventoryOf(world.inventories, warehouse.inventoryId)
    total += countItem(stock, 'raw_meat') + countItem(stock, 'raw_fish')
  }
  return total
}
