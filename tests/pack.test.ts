import { describe, expect, it } from 'vitest'
import { addItem } from '@/inventory/Inventory'
import { handlePackClick, salvageSelected, selectHotbarSlot, swapBagAndHotbar, useBagItem, useHotbarSlot, useSelected } from '@/inventory/Pack'
import { countItem } from '@/inventory/Inventory'
import { inspectItem } from '@/inventory/ItemInspect'
import { createInitialWorld } from '@/simulation/WorldState'
import { buildHudModel, renderHudHtml } from '@/ui/GameHud'

describe('backpack and hotbar', () => {
  it('swaps a bag item onto an empty hotbar slot and back', () => {
    const world = createInitialWorld()
    const hunter = world.survivors.find((entry) => entry.id === 'hunter')
    const bag = hunter ? world.inventories[hunter.inventoryId] : undefined
    if (!hunter || !bag) throw new Error('missing hunter')
    addItem(bag, 'berry', 3)
    expect(swapBagAndHotbar(world, hunter, 'berry', 4)).toBe(true)
    expect(hunter.hotbar[4]?.itemId).toBe('berry')
    expect(hunter.hotbar[4]?.count).toBe(3)
    expect(bag.items.some((item) => item.itemId === 'berry')).toBe(false)
    expect(swapBagAndHotbar(world, hunter, null, 4)).toBe(true)
    expect(hunter.hotbar[4]).toBeNull()
    expect(bag.items.some((item) => item.itemId === 'berry' && item.count === 3)).toBe(true)
  })

  it('eats and bandages from the assigned hotbar', () => {
    const world = createInitialWorld()
    const hunter = world.survivors.find((entry) => entry.id === 'hunter')
    if (!hunter) throw new Error('missing hunter')
    hunter.hunger = 20
    hunter.health = 40
    expect(useHotbarSlot(world, hunter, 1)).toContain('熟食')
    expect(hunter.hunger).toBeGreaterThan(20)
    expect(hunter.hotbar[1]?.count).toBe(1)
    expect(useHotbarSlot(world, hunter, 2)).toContain('包扎')
    expect(hunter.health).toBeGreaterThan(40)
    expect(hunter.hotbar[2]?.count).toBe(2)
  })

  it('lets the player click bag then hotbar to swap without opening the sheet', () => {
    const world = createInitialWorld()
    const hunter = world.survivors.find((entry) => entry.id === 'hunter')
    const bag = hunter ? world.inventories[hunter.inventoryId] : undefined
    if (!hunter || !bag) throw new Error('missing hunter')
    addItem(bag, 'water', 1)
    const first = handlePackClick(world, hunter, null, { place: 'bag', itemId: 'water' }, true)
    expect(first.cursor?.place).toBe('bag')
    const second = handlePackClick(world, hunter, first.cursor, { place: 'hot', index: 5 }, true)
    expect(second.notice).toContain('互换')
    expect(hunter.hotbar[5]?.itemId).toBe('water')
    expect(useBagItem(world, hunter, 'water')).toContain('没有开水')
  })

  it('renders an open backpack grid above the hotbar', () => {
    const world = createInitialWorld()
    const html = renderHudHtml(buildHudModel(world, '', { open: true, cursor: null }))
    expect(html).toContain('的背包')
    expect(html).toContain('data-bag-empty')
    expect(html).toContain('data-hot-index')
  })

  it('selects a hotbar meal with the number key instead of eating it', () => {
    const world = createInitialWorld()
    const hunter = world.survivors.find((entry) => entry.id === 'hunter')
    if (!hunter) throw new Error('missing hunter')
    hunter.hunger = 20
    const before = hunter.hunger
    const selected = handlePackClick(world, hunter, null, { place: 'hot', index: 1 }, false)
    expect(selected.cursor).toEqual({ place: 'hot', index: 1 })
    expect(hunter.hunger).toBe(before)
    expect(hunter.hotbar[1]?.count).toBe(2)
    expect(useSelected(world, hunter, selected.cursor)).toContain('熟食')
    expect(hunter.hunger).toBeGreaterThan(before)
  })

  it('drops a hotbar weapon on the ground with a right click', () => {
    const world = createInitialWorld()
    const hunter = world.survivors.find((entry) => entry.id === 'hunter')
    if (!hunter) throw new Error('missing hunter')
    const dropped = handlePackClick(world, hunter, null, { place: 'hot-drop', index: 0 }, false)
    expect(dropped.notice).toMatch(/丢掉/)
    expect(hunter.hotbar[0]).toBeNull()
    expect(world.groundLoot.some((drop) => drop.gearId === 'pistol' || drop.gearId.startsWith('g-'))).toBe(true)
  })

  it('salvages a selected weapon into warehouse scrap', () => {
    const world = createInitialWorld()
    const hunter = world.survivors.find((entry) => entry.id === 'hunter')
    const warehouse = world.inventories['inv-warehouse']
    if (!hunter || !warehouse) throw new Error('missing hunter')
    const scrap = countItem(warehouse, 'scrap')
    const pick = handlePackClick(world, hunter, null, { place: 'hot', index: 0 }, false)
    expect(salvageSelected(world, hunter, pick.cursor)).toMatch(/废铁/)
    expect(hunter.hotbar[0]).toBeNull()
    expect(countItem(warehouse, 'scrap')).toBeGreaterThan(scrap)
  })

  it('lists weapon damage on hover inspect', () => {
    const world = createInitialWorld()
    const hunter = world.survivors.find((entry) => entry.id === 'hunter')
    if (!hunter) throw new Error('missing hunter')
    const info = inspectItem(world, hunter, 'pistol')
    expect(info.lines.some((line) => line.includes('攻击'))).toBe(true)
    const html = renderHudHtml(buildHudModel(world, '', { open: false, cursor: { place: 'hot', index: 0 } }))
    expect(html).toContain('item-tip')
    expect(html).toContain('E 使用')
  })

  it('keeps the gun in slot 1 when pressing 1 then 2 with the bag closed', () => {
    const world = createInitialWorld()
    const hunter = world.survivors.find((entry) => entry.id === 'hunter')
    if (!hunter) throw new Error('missing hunter')
    const first = handlePackClick(world, hunter, null, { place: 'hot', index: 0 }, false)
    const second = handlePackClick(world, hunter, first.cursor, { place: 'hot', index: 1 }, false)
    expect(hunter.hotbar[0]?.itemId).toBe('pistol')
    expect(hunter.hotbar[1]?.itemId).toBe('meal')
    expect(second.cursor).toEqual({ place: 'hot', index: 1 })
    const again = selectHotbarSlot(world, hunter, 0)
    expect(again.cursor).toEqual({ place: 'hot', index: 0 })
    expect(hunter.hotbar[0]?.itemId).toBe('pistol')
  })

  it('still swaps two hotbar slots while the bag is open', () => {
    const world = createInitialWorld()
    const hunter = world.survivors.find((entry) => entry.id === 'hunter')
    if (!hunter) throw new Error('missing hunter')
    const first = handlePackClick(world, hunter, null, { place: 'hot', index: 0 }, true)
    const second = handlePackClick(world, hunter, first.cursor, { place: 'hot', index: 1 }, true)
    expect(second.notice).toContain('交换')
    expect(hunter.hotbar[0]?.itemId).toBe('meal')
    expect(hunter.hotbar[1]?.itemId).toBe('pistol')
  })
})
