import { equipmentById, statsOf } from '@/data/equipment'
import { gearLabel, isGearId } from '@/data/loot'
import { itemLabel } from '@/data/items'
import { addItem, inventoryOf, removeItem } from '@/inventory/Inventory'
import { MEAL_HUNGER, MEAL_THIRST, RAW_HUNGER, WATER_THIRST } from '@/survivors/Living'
import { equipItem } from '@/survivors/Equipment'
import { clampVital } from '@/survivors/Vitals'
import type { ItemStack, SurvivorState, WorldState } from '@/simulation/types'

export const HOTBAR_SIZE = 9
export const BANDAGE_HEAL = 32

export type PackCursor =
  | { place: 'bag'; itemId: string }
  | { place: 'hot'; index: number }

export type PackClick =
  | { place: 'bag'; itemId: string }
  | { place: 'hot'; index: number }
  | { place: 'bag-empty' }

export function emptyHotbar(): Array<ItemStack | null> {
  return Array.from({ length: HOTBAR_SIZE }, () => null)
}

export function ensureHotbar(survivor: SurvivorState): Array<ItemStack | null> {
  const next = emptyHotbar()
  const current = survivor.hotbar ?? []
  for (let i = 0; i < HOTBAR_SIZE; i += 1) {
    const slot = current[i]
    next[i] = slot ? { itemId: slot.itemId, count: slot.count } : null
  }
  survivor.hotbar = next
  return next
}

export function countOnHotbar(survivor: SurvivorState, itemId: string): number {
  return ensureHotbar(survivor).reduce((sum, slot) => (slot?.itemId === itemId ? sum + slot.count : sum), 0)
}

export function hasOnHotbar(survivor: SurvivorState, itemId: string): boolean {
  return ensureHotbar(survivor).some((slot) => slot?.itemId === itemId)
}

export function addToHotbar(survivor: SurvivorState, itemId: string, count: number): boolean {
  if (count <= 0) return false
  const slots = ensureHotbar(survivor)
  if (!isGearId(itemId)) {
    const stack = slots.find((slot) => slot?.itemId === itemId)
    if (stack) {
      stack.count += count
      return true
    }
  }
  const empty = slots.findIndex((slot) => slot === null)
  if (empty < 0) return false
  slots[empty] = { itemId, count }
  return true
}

export function takeFromHotbar(survivor: SurvivorState, itemId: string, count: number): boolean {
  const slots = ensureHotbar(survivor)
  let left = count
  for (const slot of slots) {
    if (!slot || slot.itemId !== itemId) continue
    const take = Math.min(slot.count, left)
    slot.count -= take
    left -= take
    if (left <= 0) break
  }
  if (left > 0) return false
  for (let i = 0; i < slots.length; i += 1) {
    if (slots[i] && slots[i]!.count <= 0) slots[i] = null
  }
  return true
}

export function swapHotbarSlots(survivor: SurvivorState, a: number, b: number): boolean {
  const slots = ensureHotbar(survivor)
  if (a < 0 || b < 0 || a >= HOTBAR_SIZE || b >= HOTBAR_SIZE || a === b) return false
  const left = slots[a] ?? null
  slots[a] = slots[b] ?? null
  slots[b] = left
  return true
}

export function swapBagAndHotbar(world: WorldState, survivor: SurvivorState, bagItemId: string | null, hotIndex: number): boolean {
  const slots = ensureHotbar(survivor)
  if (hotIndex < 0 || hotIndex >= HOTBAR_SIZE) return false
  const bag = inventoryOf(world.inventories, survivor.inventoryId)
  const hot = slots[hotIndex]
  if (bagItemId) {
    const stack = bag.items.find((item) => item.itemId === bagItemId)
    if (!stack) return false
    const moving: ItemStack = { itemId: stack.itemId, count: stack.count }
    if (!removeItem(bag, moving.itemId, moving.count)) return false
    if (hot) {
      if (!addItem(bag, hot.itemId, hot.count)) {
        addItem(bag, moving.itemId, moving.count)
        return false
      }
    }
    slots[hotIndex] = moving
    return true
  }
  if (!hot) return false
  if (!addItem(bag, hot.itemId, hot.count)) return false
  slots[hotIndex] = null
  return true
}

export function useHotbarSlot(world: WorldState, survivor: SurvivorState, index: number): string {
  const slot = ensureHotbar(survivor)[index]
  if (!slot) return '这一格是空的'
  return useOwnedItem(world, survivor, slot.itemId, 'hot')
}

export function useBagItem(world: WorldState, survivor: SurvivorState, itemId: string): string {
  return useOwnedItem(world, survivor, itemId, 'bag')
}

export function handlePackClick(
  world: WorldState,
  survivor: SurvivorState,
  cursor: PackCursor | null,
  click: PackClick,
  bagOpen: boolean,
): { cursor: PackCursor | null; notice: string } {
  if (cursor && samePick(cursor, click)) {
    return { cursor: null, notice: '已取消选择' }
  }
  if (cursor?.place === 'bag' && click.place === 'hot') {
    const ok = swapBagAndHotbar(world, survivor, cursor.itemId, click.index)
    return { cursor: null, notice: ok ? '已和快捷栏互换' : '背包满了，换不过去' }
  }
  if (cursor?.place === 'hot' && click.place === 'bag') {
    const ok = swapBagAndHotbar(world, survivor, click.itemId, cursor.index)
    return { cursor: null, notice: ok ? '已和快捷栏互换' : '背包满了，换不过去' }
  }
  if (cursor?.place === 'hot' && click.place === 'bag-empty') {
    const ok = swapBagAndHotbar(world, survivor, null, cursor.index)
    return { cursor: null, notice: ok ? '已放回背包' : '背包满了，放不回去' }
  }
  if (cursor?.place === 'bag' && click.place === 'bag-empty') {
    return { cursor, notice: '点快捷栏空格才能放上去' }
  }
  if (cursor?.place === 'hot' && click.place === 'hot') {
    swapHotbarSlots(survivor, cursor.index, click.index)
    return { cursor: null, notice: '已交换快捷栏' }
  }
  if (!bagOpen && click.place === 'hot') {
    return { cursor: null, notice: useHotbarSlot(world, survivor, click.index) }
  }
  if (click.place === 'bag') return { cursor: { place: 'bag', itemId: click.itemId }, notice: `已选 ${itemName(world, click.itemId)}，再点快捷栏互换` }
  if (click.place === 'hot') return { cursor: { place: 'hot', index: click.index }, notice: '已选快捷栏，再点背包互换' }
  return { cursor: null, notice: '点背包里的物品，再点快捷栏' }
}

function useOwnedItem(world: WorldState, survivor: SurvivorState, itemId: string, from: 'bag' | 'hot'): string {
  const item = equipmentById(itemId, world)
  if (item && (item.slot === 'weapon' || item.slot === 'tool')) {
    if (!equipItem(world, survivor, itemId)) return '现在换不上'
    return `已装备 ${item.label}`
  }
  const base = itemId
  if (base === 'bandage') {
    if (!consumeOne(world, survivor, itemId, from)) return '没有绷带了'
    const max = statsOf(survivor, world).maxHealth
    const before = survivor.health
    survivor.health = Math.min(max, survivor.health + BANDAGE_HEAL)
    return `包扎了，血量 ${Math.ceil(before)} → ${Math.ceil(survivor.health)}`
  }
  if (base === 'meal') {
    if (!consumeOne(world, survivor, itemId, from)) return '没有熟食了'
    survivor.hunger = clampVital(survivor.hunger + MEAL_HUNGER)
    survivor.thirst = clampVital(survivor.thirst + MEAL_THIRST)
    return '吃了一份熟食'
  }
  if (base === 'raw_meat' || base === 'raw_fish') {
    if (!consumeOne(world, survivor, itemId, from)) return '没有生食了'
    survivor.hunger = clampVital(survivor.hunger + RAW_HUNGER)
    survivor.thirst = clampVital(survivor.thirst + 6)
    return '生吃了一口'
  }
  if (base === 'berry') {
    if (!consumeOne(world, survivor, itemId, from)) return '没有果子了'
    survivor.hunger = clampVital(survivor.hunger + 10)
    survivor.thirst = clampVital(survivor.thirst + 8)
    return '吃了果子'
  }
  if (base === 'water') {
    if (!consumeOne(world, survivor, itemId, from)) return '没有开水了'
    survivor.thirst = clampVital(survivor.thirst + WATER_THIRST)
    return '喝了一份开水'
  }
  if (base === 'ammo') return '弹药在身上，按 R 装弹'
  return `${itemName(world, itemId)} 不能直接用，放到快捷栏备用`
}

function consumeOne(world: WorldState, survivor: SurvivorState, itemId: string, from: 'bag' | 'hot'): boolean {
  if (from === 'hot') return takeFromHotbar(survivor, itemId, 1)
  return removeItem(inventoryOf(world.inventories, survivor.inventoryId), itemId, 1)
}

function samePick(cursor: PackCursor, click: PackClick): boolean {
  if (cursor.place === 'bag' && click.place === 'bag') return cursor.itemId === click.itemId
  if (cursor.place === 'hot' && click.place === 'hot') return cursor.index === click.index
  return false
}

function itemName(world: WorldState, itemId: string): string {
  return gearLabel(world, itemId) || itemLabel(itemId)
}
