import { describe, expect, it } from 'vitest'
import { usedSlots } from '@/inventory/Inventory'
import { stepWorld } from '@/simulation/SimStep'
import { createInitialWorld } from '@/simulation/WorldState'
import { moveToward } from '@/survivors/Survivor'

describe('simulation layer', () => {
  it('advances the clock without Three.js objects', () => {
    const world = createInitialWorld()
    stepWorld(world, 1)
    expect(world.time.daySeconds).toBe(1)
    expect(world.time.phase).toBe('dawn')
  })

  it('moves a survivor toward a destination using only sim state', () => {
    const world = createInitialWorld()
    const hunter = world.survivors[0]
    if (!hunter) throw new Error('missing hunter')
    const startX = hunter.position.x
    const arrived = moveToward(hunter, 1)
    expect(arrived).toBe(false)
    expect(hunter.position.x).not.toBe(startX)
    expect(hunter.position.x).toBeGreaterThan(startX)
  })

  it('walks, works, carries an item, and deposits it into a warehouse', () => {
    const world = createInitialWorld()
    for (let i = 0; i < 30 * 40; i += 1) {
      stepWorld(world, 1 / 30)
    }

    const hunter = world.survivors.find((entry) => entry.id === 'hunter')
    const warehouse = world.inventories['inv-warehouse']
    if (!hunter || !warehouse) throw new Error('missing hunter or warehouse')

    expect(hunter.workerState).toBe('Idle')
    expect(usedSlots(world.inventories[hunter.inventoryId] ?? { id: '', capacity: 0, items: [] })).toBe(0)
    expect(usedSlots(warehouse)).toBeGreaterThan(0)
    expect(warehouse.items.some((item) => item.itemId === 'raw_meat')).toBe(true)
  })
})
