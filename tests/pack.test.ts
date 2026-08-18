import { describe, expect, it } from 'vitest'
import { addItem } from '@/inventory/Inventory'
import { handlePackClick, swapBagAndHotbar, useBagItem, useHotbarSlot } from '@/inventory/Pack'
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
})
