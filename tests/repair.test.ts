import { describe, expect, it } from 'vitest'
import { needsRepair } from '@/base/construction'
import { countItem } from '@/inventory/Inventory'
import { assignPost } from '@/jobs/Roster'
import { planJobs } from '@/jobs/JobPlanner'
import { stepWorld } from '@/simulation/SimStep'
import { createInitialWorld } from '@/simulation/WorldState'

describe('repair crew', () => {
  it('sends a repairer to patch a damaged wall with warehouse wood', () => {
    const world = createInitialWorld()
    const wall = world.structures.find((entry) => entry.kind === 'wall' && entry.stage === 'complete')
    const warehouse = world.inventories['inv-warehouse']
    if (!wall || !warehouse) throw new Error('missing wall')
    wall.hp = 20
    expect(needsRepair(wall)).toBe(true)
    const wood = countItem(warehouse, 'wood')
    expect(assignPost(world, 'builder', 'repair')).toBe(true)
    planJobs(world)
    const builder = world.survivors.find((entry) => entry.id === 'builder')
    expect(builder?.currentJobId).toMatch(/repair/)
    for (let i = 0; i < 30 * 50; i += 1) stepWorld(world, 1 / 30)
    expect(wall.hp).toBeGreaterThan(20)
    expect(countItem(warehouse, 'wood') + (builder ? countItem(world.inventories[builder.inventoryId] ?? { id: '', capacity: 0, items: [] }, 'wood') : 0)).toBeLessThan(wood)
  })
})
