import { describe, expect, it } from 'vitest'
import { canUpgrade, facilityCap, finishUpgrade, hallLevel, markUpgrade, upgradeCost } from '@/base/upgrade'
import { countItem } from '@/inventory/Inventory'
import { assignPost } from '@/jobs/Roster'
import { planJobs } from '@/jobs/JobPlanner'
import { stepWorld } from '@/simulation/SimStep'
import { createInitialWorld } from '@/simulation/WorldState'

describe('hall and facility upgrades', () => {
  it('locks other buildings to the hall level', () => {
    const world = createInitialWorld()
    const hall = world.structures.find((entry) => entry.definitionId === 'hall')
    const kitchen = world.structures.find((entry) => entry.definitionId === 'kitchen')
    if (!hall || !kitchen) throw new Error('missing hall')
    expect(hallLevel(world)).toBe(1)
    expect(canUpgrade(world, kitchen)).toBe(false)
    expect(canUpgrade(world, hall)).toBe(true)
    expect(upgradeCost(hall)[0]?.count).toBeGreaterThan(20)
    expect(markUpgrade(world, hall)).toBe(true)
    expect(hall.upgrading).toBe(true)
  })

  it('lets a builder spend warehouse stock to raise the hall, then unlock kitchen upgrades', () => {
    const world = createInitialWorld()
    const hall = world.structures.find((entry) => entry.definitionId === 'hall')
    const kitchen = world.structures.find((entry) => entry.definitionId === 'kitchen')
    const warehouse = world.inventories['inv-warehouse']
    if (!hall || !kitchen || !warehouse) throw new Error('missing hall')
    warehouse.items.push({ itemId: 'scrap', count: 20 })
    expect(markUpgrade(world, hall)).toBe(true)
    expect(assignPost(world, 'builder', 'upgrade')).toBe(true)
    planJobs(world)
    const wood = countItem(warehouse, 'wood')
    for (let i = 0; i < 30 * 40; i += 1) stepWorld(world, 1 / 30)
    expect(hall.level).toBe(2)
    expect(hall.upgrading).toBe(false)
    expect(facilityCap(world)).toBe(2)
    expect(canUpgrade(world, kitchen)).toBe(true)
    expect(countItem(warehouse, 'wood')).toBeLessThan(wood)
    finishUpgrade(world, kitchen)
    expect(kitchen.level).toBe(2)
  })
})
