import { describe, expect, it } from 'vitest'
import { addItem, countItem, usedSlots } from '@/inventory/Inventory'
import { bagFill, depositBag, depositIfNearWarehouse } from '@/inventory/Cargo'
import { createInitialWorld } from '@/simulation/WorldState'
import { buildHudModel, renderHudHtml } from '@/ui/GameHud'

describe('backpack and warehouse', () => {
  it('lists raw food and other cargo separately on the top hud', () => {
    const world = createInitialWorld()
    const warehouse = world.inventories['inv-warehouse']
    const hunter = world.survivors.find((entry) => entry.id === 'hunter')
    if (!warehouse || !hunter) throw new Error('missing camp')
    warehouse.items.push({ itemId: 'raw_meat', count: 4 })
    warehouse.items.push({ itemId: 'raw_fish', count: 2 })
    warehouse.items.push({ itemId: 'berry', count: 3 })
    addItem(world.inventories[hunter.inventoryId]!, 'raw_meat', 2)
    const model = buildHudModel(world)
    expect(model.stocks.find((item) => item.id === 'raw_meat')?.count).toBe(4)
    expect(model.stocks.find((item) => item.id === 'raw_fish')?.count).toBe(2)
    expect(model.stocks.find((item) => item.id === 'berry')?.count).toBe(3)
    expect(model.stocks.find((item) => item.id === 'meal')?.count).toBe(6)
    expect(model.bag.used).toBe(2)
    expect(model.bag.items.some((item) => item.id === 'raw_meat' && item.count === 2)).toBe(true)
    const html = renderHudHtml(model)
    expect(html).toContain('仓库')
    expect(html).toContain('生肉 4')
    expect(html).toContain('生鱼 2')
    expect(html).toContain('果子 3')
    expect(html).toContain('熟食 6')
    expect(html).toContain('袋2/8')
    expect(html).not.toContain('class="hud-bag')
    expect(html).not.toContain('>食 ')
  })

  it('dumps a full backpack into the warehouse when the survivor reaches it', () => {
    const world = createInitialWorld()
    const hunter = world.survivors.find((entry) => entry.id === 'hunter')
    const warehouse = world.inventories['inv-warehouse']
    const bag = hunter ? world.inventories[hunter.inventoryId] : undefined
    if (!hunter || !warehouse || !bag) throw new Error('missing hunter')
    addItem(bag, 'raw_meat', 5)
    addItem(bag, 'berry', 3)
    expect(bagFill(bag).full).toBe(true)
    const meat = countItem(warehouse, 'raw_meat')
    const door = world.containers.find((entry) => entry.kind === 'warehouse')
    if (!door) throw new Error('missing warehouse door')
    hunter.position = { ...door.position }
    expect(depositIfNearWarehouse(world, hunter)).toBe(8)
    expect(usedSlots(bag)).toBe(0)
    expect(countItem(warehouse, 'raw_meat')).toBe(meat + 5)
    expect(countItem(warehouse, 'berry')).toBe(3)
  })

  it('keeps leftover cargo if the warehouse cannot take it', () => {
    const world = createInitialWorld()
    const hunter = world.survivors.find((entry) => entry.id === 'hunter')
    const warehouse = world.inventories['inv-warehouse']
    const bag = hunter ? world.inventories[hunter.inventoryId] : undefined
    if (!hunter || !warehouse || !bag) throw new Error('missing hunter')
    warehouse.capacity = usedSlots(warehouse)
    addItem(bag, 'raw_fish', 2)
    const result = depositBag(world, hunter)
    expect(result.moved).toBe(0)
    expect(result.remaining).toBe(2)
    expect(countItem(bag, 'raw_fish')).toBe(2)
    expect(hunter.blockedReason).toBe('warehouse_full')
  })

  it('keeps unique guns in the bag and off the warehouse hud', () => {
    const world = createInitialWorld()
    const hunter = world.survivors.find((entry) => entry.id === 'hunter')
    const warehouse = world.inventories['inv-warehouse']
    const bag = hunter ? world.inventories[hunter.inventoryId] : undefined
    if (!hunter || !warehouse || !bag) throw new Error('missing hunter')
    const gunId = 'g-rifle-99'
    world.gear[gunId] = {
      id: gunId,
      baseId: 'rifle',
      slot: 'weapon',
      rarity: 'legendary',
      plus: 0,
      affixes: [{ id: 'max_dmg', label: '最大攻击', value: 8 }],
      procs: ['explode'],
      name: '裂地步枪之怒（爆炸）',
    }
    addItem(bag, gunId, 1)
    addItem(bag, 'raw_meat', 2)
    warehouse.items.push({ itemId: gunId, count: 1 })
    const meat = countItem(warehouse, 'raw_meat')
    const result = depositBag(world, hunter)
    expect(result.moved).toBe(2)
    expect(countItem(bag, gunId)).toBe(1)
    expect(countItem(warehouse, gunId)).toBe(1)
    expect(countItem(warehouse, 'raw_meat')).toBe(meat + 2)
    const model = buildHudModel(world, '', { open: true, cursor: null })
    expect(model.extras.some((item) => item.id === gunId)).toBe(false)
    expect(model.bag.items.some((item) => item.id === gunId && item.label.includes('裂地步枪之怒'))).toBe(true)
    const html = renderHudHtml(model)
    expect(html).toContain('data-bag-item="g-rifle-99"')
    expect(html).not.toContain('data-stock="g-rifle-99"')
  })
})
