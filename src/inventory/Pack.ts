import { equipmentById, statsOf } from '@/data/equipment'
import { findGear, gearLabel, isGearId, spawnGroundItem } from '@/data/loot'
import { itemLabel } from '@/data/items'
import { addItem, inventoryOf, removeItem } from '@/inventory/Inventory'
import { findContainer } from '@/simulation/EntityRegistry'
import { MEAL_HUNGER, MEAL_THIRST, RAW_HUNGER, WATER_THIRST } from '@/survivors/Living'
import { equipItem } from '@/survivors/Equipment'
import { clampVital } from '@/survivors/Vitals'
import type { EquipSlot, ItemStack, SurvivorState, WorldState } from '@/simulation/types'

export const HOTBAR_SIZE = 9
export const BANDAGE_HEAL = 32

export type PackCursor =
  | { place: 'bag'; itemId: string }
  | { place: 'hot'; index: number }

export type PackClick =
  | { place: 'bag'; itemId: string }
  | { place: 'hot'; index: number }
  | { place: 'bag-empty' }
  | { place: 'hot-drop'; index: number }
  | { place: 'bag-drop'; itemId: string }

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
  if (click.place === 'hot-drop') {
    return { cursor: null, notice: dropHotbarSlot(world, survivor, click.index) }
  }
  if (click.place === 'bag-drop') {
    return { cursor: null, notice: dropBagItem(world, survivor, click.itemId) }
  }
  if (!bagOpen && click.place === 'hot') {
    const slot = ensureHotbar(survivor)[click.index]
    if (!slot) return { cursor: null, notice: '这一格是空的' }
    return { cursor: { place: 'hot', index: click.index }, notice: `已选 ${itemName(world, slot.itemId)} · E 使用 · 右键丢弃 · F 拆解` }
  }
  if (click.place === 'bag') return { cursor: { place: 'bag', itemId: click.itemId }, notice: bagOpen ? `已选 ${itemName(world, click.itemId)}，再点快捷栏互换` : `已选 ${itemName(world, click.itemId)} · E 使用 · 右键丢弃 · F 拆解` }
  if (click.place === 'hot') return { cursor: { place: 'hot', index: click.index }, notice: '已选快捷栏，再点背包互换' }
  return { cursor: null, notice: '点背包里的物品，再点快捷栏' }
}

export function dropHotbarSlot(world: WorldState, survivor: SurvivorState, index: number): string {
  const slot = ensureHotbar(survivor)[index]
  if (!slot) return '这一格是空的'
  return dropOwnedItem(world, survivor, slot.itemId, slot.count, 'hot')
}

export function dropBagItem(world: WorldState, survivor: SurvivorState, itemId: string): string {
  const bag = inventoryOf(world.inventories, survivor.inventoryId)
  const stack = bag.items.find((item) => item.itemId === itemId)
  if (!stack) return '背包里没有这件'
  return dropOwnedItem(world, survivor, stack.itemId, stack.count, 'bag')
}

export function salvageSelected(world: WorldState, survivor: SurvivorState, cursor: PackCursor | null): string {
  if (!cursor) return '先选中一件物品再按 F 拆解'
  if (cursor.place === 'hot') {
    const slot = ensureHotbar(survivor)[cursor.index]
    if (!slot) return '这一格是空的'
    return salvageOwnedItem(world, survivor, slot.itemId, 'hot')
  }
  return salvageOwnedItem(world, survivor, cursor.itemId, 'bag')
}

export function useSelected(world: WorldState, survivor: SurvivorState, cursor: PackCursor | null): string | null {
  if (!cursor) return null
  if (cursor.place === 'hot') return useHotbarSlot(world, survivor, cursor.index)
  return useBagItem(world, survivor, cursor.itemId)
}

function dropOwnedItem(
  world: WorldState,
  survivor: SurvivorState,
  itemId: string,
  count: number,
  from: 'bag' | 'hot',
): string {
  if (!takeOwnedStack(world, survivor, itemId, count, from)) return '丢不掉'
  clearIfEquipped(survivor, itemId)
  const drop = dropInFront(survivor)
  spawnGroundItem(world, itemId, count, drop.x, drop.z)
  return `已丢掉 ${itemName(world, itemId)}，在脚边发光`
}

function salvageOwnedItem(
  world: WorldState,
  survivor: SurvivorState,
  itemId: string,
  from: 'bag' | 'hot',
): string {
  const scrap = salvageScrap(world, itemId)
  if (scrap <= 0) return `${itemName(world, itemId)} 拆不出材料`
  if (!takeOwnedStack(world, survivor, itemId, 1, from)) return '拆不了'
  clearIfEquipped(survivor, itemId)
  const warehouse = findContainer(world, 'warehouse')
  const stock = warehouse ? inventoryOf(world.inventories, warehouse.inventoryId) : null
  if (stock && addItem(stock, 'scrap', scrap)) {
    return `拆解 ${itemName(world, itemId)}，仓库 +${scrap}废铁`
  }
  const bag = inventoryOf(world.inventories, survivor.inventoryId)
  if (addItem(bag, 'scrap', scrap)) return `仓库满了，废铁进了背包 +${scrap}`
  const drop = dropInFront(survivor)
  spawnGroundItem(world, 'scrap', scrap, drop.x, drop.z)
  return `没地方放，废铁丢在地上 +${scrap}`
}

function salvageScrap(world: WorldState, itemId: string): number {
  const piece = findGear(world, itemId)
  if (piece) {
    if (piece.rarity === 'legendary') return 8
    if (piece.rarity === 'rare') return 5
    if (piece.rarity === 'magic') return 3
    return 2
  }
  const item = equipmentById(itemId, world)
  if (item?.slot === 'weapon') return 2
  if (item?.slot === 'tool') return 1
  return 0
}

function takeOwnedStack(
  world: WorldState,
  survivor: SurvivorState,
  itemId: string,
  count: number,
  from: 'bag' | 'hot',
): boolean {
  if (from === 'hot') return takeFromHotbar(survivor, itemId, count)
  return removeItem(inventoryOf(world.inventories, survivor.inventoryId), itemId, count)
}

function clearIfEquipped(survivor: SurvivorState, itemId: string): void {
  const slots: EquipSlot[] = ['weapon', 'hat', 'clothes', 'gloves', 'shoes']
  let changed = false
  for (const slot of slots) {
    if (survivor.equipment[slot] !== itemId) continue
    survivor.equipment[slot] = null
    if (survivor.enhance) survivor.enhance[slot] = 0
    changed = true
  }
  survivor.carriedTools = survivor.carriedTools.filter((tool) => tool !== itemId)
  if (changed) {
    const stats = statsOf(survivor)
    survivor.moveSpeed = stats.moveSpeed
    if (survivor.health > stats.maxHealth) survivor.health = stats.maxHealth
  }
}

function dropInFront(survivor: SurvivorState): { x: number; z: number } {
  return {
    x: survivor.position.x + Math.sin(survivor.facingYaw) * 2.4,
    z: survivor.position.z + Math.cos(survivor.facingYaw) * 2.4,
  }
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
