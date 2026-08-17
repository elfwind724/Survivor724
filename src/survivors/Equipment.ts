import {
  derivedStats,
  emptyLoadout,
  equipmentById,
  PROFESSION_CLOTHES,
  type EquipItemDef,
} from '@/data/equipment'
import { addItem, countItem, inventoryOf, removeItem } from '@/inventory/Inventory'
import { findContainer } from '@/simulation/EntityRegistry'
import type { EquipSlot, SurvivorState, WorldState } from '@/simulation/types'

export function applyEquipmentStats(survivor: SurvivorState): void {
  const stats = derivedStats(survivor.attributes, survivor.equipment)
  survivor.moveSpeed = stats.moveSpeed
  if (survivor.health > stats.maxHealth) survivor.health = stats.maxHealth
  const tools = [survivor.equipment.weapon, survivor.equipment.tool].filter((id): id is string => !!id)
  for (const tool of tools) {
    if (!survivor.carriedTools.includes(tool)) survivor.carriedTools.push(tool)
  }
}

export function dressProfession(survivor: SurvivorState): void {
  const clothes = PROFESSION_CLOTHES[survivor.professionId] ?? {}
  survivor.equipment = { ...emptyLoadout(), ...clothes }
  applyEquipmentStats(survivor)
}

export function syncToolsToEquipment(survivor: SurvivorState): void {
  for (const tool of survivor.carriedTools) {
    const item = equipmentById(tool)
    if (item && (item.slot === 'weapon' || item.slot === 'tool')) {
      survivor.equipment[item.slot] = tool
    }
  }
  applyEquipmentStats(survivor)
}

export function clearJobTools(survivor: SurvivorState, returned: string[]): void {
  for (const tool of returned) {
    const item = equipmentById(tool)
    if (item && survivor.equipment[item.slot] === tool) survivor.equipment[item.slot] = null
  }
  applyEquipmentStats(survivor)
}

export function availableForSlot(world: WorldState, survivor: SurvivorState, slot: EquipSlot): EquipItemDef[] {
  const seen = new Set<string>()
  const items: EquipItemDef[] = []
  const add = (id: string): void => {
    const item = equipmentById(id)
    if (!item || item.slot !== slot || seen.has(item.id)) return
    seen.add(item.id)
    items.push(item)
  }
  const worn = survivor.equipment[slot]
  if (worn) add(worn)
  const bag = inventoryOf(world.inventories, survivor.inventoryId)
  for (const stack of bag.items) add(stack.itemId)
  const warehouse = findContainer(world, 'warehouse')
  if (warehouse) {
    const stock = inventoryOf(world.inventories, warehouse.inventoryId)
    for (const stack of stock.items) add(stack.itemId)
  }
  const locker = findContainer(world, 'tool_locker')
  if (locker) {
    const stock = inventoryOf(world.inventories, locker.inventoryId)
    for (const stack of stock.items) add(stack.itemId)
  }
  return items
}

export function equipItem(world: WorldState, survivor: SurvivorState, itemId: string): boolean {
  const item = equipmentById(itemId)
  if (!item) return false
  const current = survivor.equipment[item.slot]
  if (current === itemId) return true
  if (!takeOwnedItem(world, survivor, itemId)) return false
  if (current) stowItem(world, survivor, current)
  if (current && (current === survivor.equipment.weapon || current === survivor.equipment.tool)) {
    survivor.carriedTools = survivor.carriedTools.filter((tool) => tool !== current)
  }
  survivor.equipment[item.slot] = itemId
  applyEquipmentStats(survivor)
  return true
}

export function unequipSlot(world: WorldState, survivor: SurvivorState, slot: EquipSlot): boolean {
  const current = survivor.equipment[slot]
  if (!current) return false
  stowItem(world, survivor, current)
  survivor.equipment[slot] = null
  survivor.carriedTools = survivor.carriedTools.filter((tool) => tool !== current)
  applyEquipmentStats(survivor)
  return true
}

function takeOwnedItem(world: WorldState, survivor: SurvivorState, itemId: string): boolean {
  if (Object.values(survivor.equipment).includes(itemId)) return true
  const bag = inventoryOf(world.inventories, survivor.inventoryId)
  if (countItem(bag, itemId) > 0) return removeItem(bag, itemId, 1)
  const warehouse = findContainer(world, 'warehouse')
  if (warehouse) {
    const stock = inventoryOf(world.inventories, warehouse.inventoryId)
    if (countItem(stock, itemId) > 0) return removeItem(stock, itemId, 1)
  }
  const locker = findContainer(world, 'tool_locker')
  if (locker) {
    const stock = inventoryOf(world.inventories, locker.inventoryId)
    if (countItem(stock, itemId) > 0) return removeItem(stock, itemId, 1)
  }
  return false
}

function stowItem(world: WorldState, survivor: SurvivorState, itemId: string): void {
  const bag = inventoryOf(world.inventories, survivor.inventoryId)
  if (addItem(bag, itemId, 1)) return
  const warehouse = findContainer(world, 'warehouse')
  if (warehouse) addItem(inventoryOf(world.inventories, warehouse.inventoryId), itemId, 1)
}
