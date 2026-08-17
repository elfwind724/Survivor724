import type { InventoryState, ItemStack } from '@/simulation/types'

export function createInventory(id: string, capacity: number, items: ItemStack[] = []): InventoryState {
  return { id, capacity, items: items.map((item) => ({ ...item })) }
}

export function usedSlots(inventory: InventoryState): number {
  return inventory.items.reduce((sum, item) => sum + item.count, 0)
}

export function canAdd(inventory: InventoryState, count: number): boolean {
  return usedSlots(inventory) + count <= inventory.capacity
}

export function addItem(inventory: InventoryState, itemId: string, count: number): boolean {
  if (!canAdd(inventory, count)) return false
  const existing = inventory.items.find((item) => item.itemId === itemId)
  if (existing) {
    existing.count += count
    return true
  }
  inventory.items.push({ itemId, count })
  return true
}

export function inventoryOf(inventories: Record<string, InventoryState>, id: string): InventoryState {
  const inventory = inventories[id]
  if (!inventory) throw new Error(`Missing inventory ${id}`)
  return inventory
}
