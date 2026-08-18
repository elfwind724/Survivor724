import { addItem, inventoryOf, usedSlots } from '@/inventory/Inventory'
import { findContainer } from '@/simulation/EntityRegistry'
import { distanceXZ, type InventoryState, type ItemStack, type SurvivorState, type WorldState } from '@/simulation/types'

export const HUD_STOCK_IDS = ['wood', 'scrap', 'ammo', 'raw_meat', 'raw_fish', 'berry', 'meal'] as const

export const WAREHOUSE_REACH = 2.4

export function depositBag(world: WorldState, survivor: SurvivorState): { moved: number; remaining: number } {
  const bag = inventoryOf(world.inventories, survivor.inventoryId)
  const warehouse = findContainer(world, 'warehouse')
  if (!warehouse) return { moved: 0, remaining: usedSlots(bag) }
  const stock = inventoryOf(world.inventories, warehouse.inventoryId)
  const leftover: ItemStack[] = []
  let moved = 0
  for (const item of bag.items) {
    if (addItem(stock, item.itemId, item.count)) {
      moved += item.count
      continue
    }
    leftover.push({ ...item })
  }
  bag.items = leftover
  if (leftover.length > 0) survivor.blockedReason = 'warehouse_full'
  else if (survivor.blockedReason === 'warehouse_full') survivor.blockedReason = null
  return { moved, remaining: usedSlots(bag) }
}

export function depositIfNearWarehouse(world: WorldState, survivor: SurvivorState): number {
  if (survivor.downed) return 0
  const bag = inventoryOf(world.inventories, survivor.inventoryId)
  if (usedSlots(bag) <= 0) return 0
  const warehouse = findContainer(world, 'warehouse')
  if (!warehouse || distanceXZ(survivor.position, warehouse.position) > WAREHOUSE_REACH) return 0
  return depositBag(world, survivor).moved
}

export function bagFill(inventory: InventoryState): { used: number; capacity: number; full: boolean } {
  const used = usedSlots(inventory)
  return { used, capacity: inventory.capacity, full: used >= inventory.capacity }
}
