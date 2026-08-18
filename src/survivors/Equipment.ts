import {
  emptyEnhance,
  emptyLoadout,
  equipmentById,
  PROFESSION_CLOTHES,
  statsOf,
  type EquipItemDef,
} from '@/data/equipment'
import { itemBase, itemLabel, itemPlus, withPlus } from '@/data/items'
import { isGearId, previewFire, spawnGroundLoot } from '@/data/loot'
import { switchMags, weaponById } from '@/data/weapons'
import { addItem, countItem, inventoryOf, removeItem } from '@/inventory/Inventory'
import { ensureHotbar, HOTBAR_SIZE } from '@/inventory/Pack'
import { findContainer } from '@/simulation/EntityRegistry'
import type { EquipSlot, ItemRarity, SurvivorState, WorldState } from '@/simulation/types'

export { HOTBAR_SIZE }

export interface HotbarEntry {
  itemId: string
  label: string
  slot: EquipSlot
  equipped: boolean
  rarity: ItemRarity | null
  line: string
  count: number
}

export function applyEquipmentStats(survivor: SurvivorState): void {
  const stats = statsOf(survivor)
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
  survivor.enhance = emptyEnhance()
  applyEquipmentStats(survivor)
}

export function syncToolsToEquipment(world: WorldState, survivor: SurvivorState): void {
  const previousWeapon = survivor.equipment.weapon
  for (const tool of survivor.carriedTools) {
    const item = equipmentById(tool)
    if (!item || (item.slot !== 'weapon' && item.slot !== 'tool')) continue
    const current = survivor.equipment[item.slot]
    if (current && current !== tool) stowItem(world, survivor, current)
    survivor.equipment[item.slot] = tool
  }
  applyEquipmentStats(survivor)
  if (survivor.equipment.weapon !== previousWeapon) {
    switchMags(survivor, previousWeapon, survivor.equipment.weapon)
  }
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
    const item = equipmentById(id, world)
    if (!item || item.slot !== slot || seen.has(id)) return
    seen.add(id)
    items.push(item)
  }
  const worn = survivor.equipment[slot]
  if (worn) add(isGearId(worn) ? worn : withPlus(worn, survivor.enhance?.[slot] ?? 0))
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

export function hotbarOf(world: WorldState, survivor: SurvivorState): Array<HotbarEntry | null> {
  return ensureHotbar(survivor).map((stack) => {
    if (!stack) return null
    const item = equipmentById(stack.itemId, world)
    const piece = world.gear[stack.itemId]
    const gun = weaponById(stack.itemId)
    const fire = gun ? previewFire(world, survivor, stack.itemId) : null
    const slot = item?.slot ?? 'tool'
    return {
      itemId: stack.itemId,
      label: piece ? piece.name : item?.label ?? itemLabel(stack.itemId),
      slot,
      equipped: survivor.equipment[slot] === stack.itemId || survivor.equipment[slot] === itemBase(stack.itemId),
      rarity: piece?.rarity ?? null,
      count: stack.count,
      line: fire
        ? `${Math.round(fire.minDamage)}-${Math.round(fire.maxDamage)}`
        : stack.count > 1
          ? `×${stack.count}`
          : stack.itemId === 'bandage'
            ? '包扎'
            : item?.slot === 'tool'
              ? '工具'
              : '',
    }
  })
}

export function equipHotbar(world: WorldState, survivor: SurvivorState, index: number): HotbarEntry | null {
  const entry = hotbarOf(world, survivor)[index]
  if (!entry) return null
  if (!equipItem(world, survivor, entry.itemId)) return null
  return entry
}

export function equipItem(world: WorldState, survivor: SurvivorState, itemId: string): boolean {
  const item = equipmentById(itemId, world)
  if (!item) return false
  if (!survivor.enhance) survivor.enhance = emptyEnhance()
  const stored = isGearId(itemId) ? itemId : itemBase(itemId)
  const plus = isGearId(itemId) ? (world.gear[itemId]?.plus ?? 0) : itemPlus(itemId)
  const current = survivor.equipment[item.slot]
  const currentPlus = survivor.enhance[item.slot] ?? 0
  if (current === stored && currentPlus === plus) return true
  if (!takeOwnedItem(world, survivor, itemId)) return false
  if (current) stowItem(world, survivor, isGearId(current) ? current : withPlus(current, currentPlus))
  if (current && (current === survivor.equipment.weapon || current === survivor.equipment.tool)) {
    survivor.carriedTools = survivor.carriedTools.filter((tool) => tool !== current)
  }
  const previousWeapon = survivor.equipment.weapon
  survivor.equipment[item.slot] = stored
  survivor.enhance[item.slot] = plus
  applyEquipmentStats(survivor)
  if (item.slot === 'weapon') switchMags(survivor, previousWeapon, stored)
  return true
}

export function unequipSlot(world: WorldState, survivor: SurvivorState, slot: EquipSlot): boolean {
  const current = survivor.equipment[slot]
  if (!current) return false
  if (!survivor.enhance) survivor.enhance = emptyEnhance()
  stowItem(world, survivor, isGearId(current) ? current : withPlus(current, survivor.enhance[slot] ?? 0))
  survivor.equipment[slot] = null
  survivor.enhance[slot] = 0
  survivor.carriedTools = survivor.carriedTools.filter((tool) => tool !== current)
  applyEquipmentStats(survivor)
  if (slot === 'weapon') switchMags(survivor, current, null)
  return true
}

function takeOwnedItem(world: WorldState, survivor: SurvivorState, itemId: string): boolean {
  if (Object.values(survivor.equipment).includes(itemId)) return true
  if (ensureHotbar(survivor).some((slot) => slot?.itemId === itemId)) return true
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
  if (isGearId(itemId)) {
    const piece = world.gear[itemId]
    if (piece) spawnGroundLoot(world, piece, survivor.position.x, survivor.position.z)
    return
  }
  const warehouse = findContainer(world, 'warehouse')
  if (warehouse) addItem(inventoryOf(world.inventories, warehouse.inventoryId), itemId, 1)
}
