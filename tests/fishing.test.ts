import { describe, expect, it } from 'vitest'
import { countItem } from '@/inventory/Inventory'
import { stepWorld } from '@/simulation/SimStep'
import { createInitialWorld } from '@/simulation/WorldState'
import { activityCaption, activityLines } from '@/survivors/Activity'
import { CAST_SECONDS, canFishDeep, claimFishingSpot, seedFishingSpots, stepFishing } from '@/world/Fishing'

describe('river fishing', () => {
  it('seeds shallow holes and one deep hole on the bank', () => {
    const holes = seedFishingSpots()
    expect(holes.filter((entry) => entry.kind === 'shallow')).toHaveLength(3)
    expect(holes.some((entry) => entry.kind === 'deep')).toBe(true)
    expect(holes.every((entry) => entry.position.x < -40 && entry.position.x > -70)).toBe(true)
  })

  it('makes a skilled fisher take the deep hole', () => {
    const world = createInitialWorld()
    const fisher = world.survivors.find((entry) => entry.id === 'fisher')
    if (!fisher) throw new Error('missing fisher')
    expect(canFishDeep(fisher)).toBe(false)
    const shallow = claimFishingSpot(world, fisher)
    expect(shallow?.kind).toBe('shallow')
    fisher.skills.fish.level = 3
    if (shallow) shallow.occupantId = null
    const deep = claimFishingSpot(world, fisher)
    expect(deep?.kind).toBe('deep')
    expect(canFishDeep(fisher)).toBe(true)
  })

  it('stands still on the bank and waits before a fish bites', () => {
    const world = createInitialWorld()
    const fisher = world.survivors.find((entry) => entry.id === 'fisher')
    const hole = world.fishingSpots.find((entry) => entry.kind === 'shallow')
    if (!fisher || !hole) throw new Error('missing fisher')
    fisher.carriedTools = ['rod']
    fisher.workerState = 'Work'
    fisher.workElapsed = 0
    fisher.position = { ...hole.position }
    fisher.destination = null
    fisher.path = []
    hole.occupantId = fisher.id
    const bag = world.inventories[fisher.inventoryId]
    const river = world.nodes.find((node) => node.id === 'node-river')
    if (!bag || !river) throw new Error('missing bag')
    const reserve = river.reserve
    const start = { x: fisher.position.x, z: fisher.position.z }

    for (let i = 0; i < 30 * 4; i += 1) stepWorld(world, 1 / 30)
    expect(Math.hypot(fisher.position.x - start.x, fisher.position.z - start.z)).toBeLessThan(0.05)
    expect(countItem(bag, 'raw_fish')).toBe(0)
    expect(activityCaption(world, fisher)).toBe('下竿等待')
    expect(activityLines(world, fisher)[0]).toMatch(/CD/)

    for (let i = 0; i < 30 * (CAST_SECONDS.shallow + 2); i += 1) stepWorld(world, 1 / 30)
    expect(countItem(bag, 'raw_fish')).toBeGreaterThan(0)
    expect(river.reserve).toBe(reserve)
    expect(fisher.lastYieldItem).toBe('raw_fish')
  })

  it('does not pull fish from the river node reserve', () => {
    const world = createInitialWorld()
    const fisher = world.survivors.find((entry) => entry.id === 'fisher')
    const hole = world.fishingSpots[0]
    if (!fisher || !hole) throw new Error('missing fisher')
    fisher.carriedTools = ['rod']
    fisher.position = { ...hole.position }
    hole.occupantId = fisher.id
    const river = world.nodes.find((node) => node.id === 'node-river')
    if (!river) throw new Error('missing river')
    const reserve = river.reserve
    expect(stepFishing(world, fisher, CAST_SECONDS.shallow + 1, { autoTravel: true })).toBe('caught')
    expect(river.reserve).toBe(reserve)
  })

  it('walks out, casts, and brings fish home without teleporting', () => {
    const world = createInitialWorld()
    const fisher = world.survivors.find((entry) => entry.id === 'fisher')
    if (!fisher) throw new Error('missing fisher')
    const start = { x: fisher.position.x, z: fisher.position.z }
    let maxJump = 0
    let sawWait = false
    for (let i = 0; i < 30 * 90; i += 1) {
      const before = { x: fisher.position.x, z: fisher.position.z }
      stepWorld(world, 1 / 30)
      const jumped = Math.hypot(fisher.position.x - before.x, fisher.position.z - before.z)
      maxJump = Math.max(maxJump, jumped)
      if (activityCaption(world, fisher) === '下竿等待') sawWait = true
    }
    const bag = world.inventories[fisher.inventoryId]
    const warehouse = world.inventories['inv-warehouse']
    if (!bag || !warehouse) throw new Error('missing stock')
    expect(Math.hypot(fisher.position.x - start.x, fisher.position.z - start.z)).toBeGreaterThan(8)
    expect(maxJump).toBeLessThanOrEqual(fisher.moveSpeed / 30 + 1e-6)
    expect(sawWait).toBe(true)
    expect(countItem(bag, 'raw_fish') + countItem(warehouse, 'raw_fish') + countItem(warehouse, 'meal')).toBeGreaterThan(0)
  })
})
