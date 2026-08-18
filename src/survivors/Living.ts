import { eatSpot, findFacility } from '@/base/FacilityLife'
import { countItem, inventoryOf, removeItem } from '@/inventory/Inventory'
import { findContainer } from '@/simulation/EntityRegistry'
import { BASE } from '@/simulation/baseLayout'
import type { SurvivorState, Vec3, WorldState } from '@/simulation/types'
import { clampVital } from './Vitals'

export const EAT_SECONDS = 2.2
export const MEAL_HUNGER = 40
export const MEAL_THIRST = 8
export const WATER_THIRST = 42
export const RAW_HUNGER = 16

export function insideBase(position: Vec3): boolean {
  return (
    position.x >= BASE.west - 2 &&
    position.x <= BASE.east + 2 &&
    position.z >= BASE.south - 2 &&
    position.z <= BASE.north + 2
  )
}

export function diningSpot(world: WorldState): Vec3 {
  const kitchen = findFacility(world, 'kitchen')
  if (kitchen) return eatSpot(world, kitchen)
  return findContainer(world, 'warehouse')?.position ?? { x: 0, y: 0, z: 0 }
}

export function foodAvailable(world: WorldState): boolean {
  const warehouse = findContainer(world, 'warehouse')
  if (!warehouse) return false
  const stock = inventoryOf(world.inventories, warehouse.inventoryId)
  return countItem(stock, 'meal') > 0 || countItem(stock, 'raw_meat') > 0 || countItem(stock, 'raw_fish') > 0 || countItem(stock, 'berry') > 0
}

export function waterAvailable(world: WorldState): boolean {
  const warehouse = findContainer(world, 'warehouse')
  if (!warehouse) return false
  return countItem(inventoryOf(world.inventories, warehouse.inventoryId), 'water') > 0
}

export function hungerThreshold(world: WorldState): number {
  return world.time.phase === 'dawn' || world.time.phase === 'day' ? 62 : 84
}

export function thirstThreshold(world: WorldState): number {
  return world.time.phase === 'dawn' || world.time.phase === 'day' ? 58 : 80
}

export function shouldEat(world: WorldState, survivor: SurvivorState): boolean {
  if (survivor.downed) return false
  if (survivor.hunger < hungerThreshold(world) && foodAvailable(world)) return true
  if (survivor.thirst < thirstThreshold(world) && (waterAvailable(world) || foodAvailable(world))) return true
  return false
}

export function stepLiving(world: WorldState): void {
  if (world.time.phase === world.lastPhase) return
  if (world.time.phase === 'night') punishLateField(world)
  if (world.time.phase === 'aftermath') recoverAfterNight(world)
}

export function eatOne(world: WorldState, survivor: SurvivorState): boolean {
  if (survivor.downed) return false
  const warehouse = findContainer(world, 'warehouse')
  if (!warehouse) return false
  const stock = inventoryOf(world.inventories, warehouse.inventoryId)
  if (removeItem(stock, 'meal', 1)) {
    survivor.hunger = clampVital(survivor.hunger + MEAL_HUNGER)
    survivor.thirst = clampVital(survivor.thirst + MEAL_THIRST)
    survivor.morale = Math.min(100, survivor.morale + 4)
    return true
  }
  if (removeItem(stock, 'raw_meat', 1) || removeItem(stock, 'raw_fish', 1)) {
    survivor.hunger = clampVital(survivor.hunger + RAW_HUNGER)
    survivor.thirst = clampVital(survivor.thirst + 6)
    return true
  }
  if (removeItem(stock, 'berry', 1)) {
    survivor.hunger = clampVital(survivor.hunger + 10)
    survivor.thirst = clampVital(survivor.thirst + 8)
    return true
  }
  return false
}

export function drinkOne(world: WorldState, survivor: SurvivorState): boolean {
  if (survivor.downed) return false
  const warehouse = findContainer(world, 'warehouse')
  if (!warehouse) return false
  const stock = inventoryOf(world.inventories, warehouse.inventoryId)
  if (!removeItem(stock, 'water', 1)) return false
  survivor.thirst = clampVital(survivor.thirst + WATER_THIRST)
  return true
}

export function eatAtBase(world: WorldState): number {
  const spot = diningSpot(world)
  let fed = 0
  for (const survivor of world.survivors) {
    if (survivor.downed || !insideBase(survivor.position)) continue
    if (survivor.hunger >= 84 && survivor.thirst >= 80) continue
    if (Math.hypot(survivor.position.x - spot.x, survivor.position.z - spot.z) > 3) continue
    const ate = survivor.hunger < 84 ? eatOne(world, survivor) : false
    const drank = survivor.thirst < 80 ? drinkOne(world, survivor) : false
    if (ate || drank) fed += 1
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
    total += countItem(bag, 'raw_meat') + countItem(bag, 'raw_fish') + countItem(bag, 'berry')
  }
  const warehouse = findContainer(world, 'warehouse')
  if (warehouse) {
    const stock = inventoryOf(world.inventories, warehouse.inventoryId)
    total += countItem(stock, 'raw_meat') + countItem(stock, 'raw_fish') + countItem(stock, 'berry')
  }
  return total
}
