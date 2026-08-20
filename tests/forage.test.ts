import { describe, expect, it } from 'vitest'
import { countItem } from '@/inventory/Inventory'
import { assignPost } from '@/jobs/Roster'
import { stepWorld } from '@/simulation/SimStep'
import { createInitialWorld } from '@/simulation/WorldState'
import { activityCaption } from '@/survivors/Activity'
import { PICK_SECONDS, seedBerryBushes, stepGather } from '@/world/Forage'

describe('berry forage', () => {
  it('seeds pickable bushes in the gather zone', () => {
    const bushes = seedBerryBushes()
    expect(bushes).toHaveLength(5)
    expect(bushes.every((entry) => entry.berries === 3)).toBe(true)
    expect(bushes.every((entry) => entry.position.x >= 28 && entry.position.x <= 50)).toBe(true)
    expect(bushes.every((entry) => entry.position.z >= -30 && entry.position.z <= -4)).toBe(true)
  })

  it('stands still at a bush and waits before berries come off', () => {
    const world = createInitialWorld()
    const scav = world.survivors.find((entry) => entry.id === 'scavenger')
    const shrub = world.berryBushes[0]
    if (!scav || !shrub) throw new Error('missing gatherer')
    expect(assignPost(world, 'scavenger', 'gather')).toBe(true)
    scav.workerState = 'Work'
    scav.workElapsed = 0
    scav.position = { ...shrub.position }
    scav.destination = null
    scav.path = []
    shrub.occupantId = scav.id
    const bag = world.inventories[scav.inventoryId]
    const node = world.nodes.find((entry) => entry.id === 'node-berry')
    if (!bag || !node) throw new Error('missing bag')
    const reserve = node.reserve
    const start = { x: scav.position.x, z: scav.position.z }

    for (let i = 0; i < 30 * 2; i += 1) stepWorld(world, 1 / 30)
    expect(Math.hypot(scav.position.x - start.x, scav.position.z - start.z)).toBeLessThan(0.05)
    expect(countItem(bag, 'berry')).toBe(0)
    expect(activityCaption(world, scav)).toBe('摘果中')

    for (let i = 0; i < 30 * (PICK_SECONDS + 2); i += 1) stepWorld(world, 1 / 30)
    expect(countItem(bag, 'berry')).toBeGreaterThan(0)
    expect(node.reserve).toBe(reserve)
    expect(scav.lastYieldItem).toBe('berry')
  })

  it('does not drain the berry node reserve', () => {
    const world = createInitialWorld()
    const scav = world.survivors.find((entry) => entry.id === 'scavenger')
    const shrub = world.berryBushes[1]
    if (!scav || !shrub) throw new Error('missing gatherer')
    scav.dayAssignment = 'gather'
    scav.currentJobId = 'job-gather'
    scav.position = { ...shrub.position }
    shrub.occupantId = scav.id
    const node = world.nodes.find((entry) => entry.id === 'node-berry')
    if (!node) throw new Error('missing node')
    const reserve = node.reserve
    expect(stepGather(world, scav, PICK_SECONDS + 1, { autoTravel: true })).toBe('picked')
    expect(node.reserve).toBe(reserve)
    expect(shrub.berries).toBeLessThan(3)
  })

  it('sends a gatherer to bushes and brings berries home without teleporting', () => {
    const world = createInitialWorld()
    expect(assignPost(world, 'scavenger', 'gather')).toBe(true)
    const scav = world.survivors.find((entry) => entry.id === 'scavenger')
    if (!scav) throw new Error('missing scavenger')
    const start = { x: scav.position.x, z: scav.position.z }
    let maxJump = 0
    let sawPick = false
    for (let i = 0; i < 30 * 50; i += 1) {
      const before = { x: scav.position.x, z: scav.position.z }
      stepWorld(world, 1 / 30)
      maxJump = Math.max(maxJump, Math.hypot(scav.position.x - before.x, scav.position.z - before.z))
      if (activityCaption(world, scav) === '摘果中') sawPick = true
    }
    const bag = world.inventories[scav.inventoryId]
    const warehouse = world.inventories['inv-warehouse']
    if (!bag || !warehouse) throw new Error('missing stock')
    expect(Math.hypot(scav.position.x - start.x, scav.position.z - start.z)).toBeGreaterThan(8)
    expect(maxJump).toBeLessThanOrEqual(scav.moveSpeed / 30 + 1e-6)
    expect(sawPick).toBe(true)
    expect(countItem(bag, 'berry') + countItem(warehouse, 'berry')).toBeGreaterThan(0)
  })
})
