import { describe, expect, it } from 'vitest'
import { countItem } from '@/inventory/Inventory'
import { assignPost } from '@/jobs/Roster'
import { stepWorld } from '@/simulation/SimStep'
import { createInitialWorld } from '@/simulation/WorldState'
import { activityCaption } from '@/survivors/Activity'
import { SCOOP_SECONDS, seedWaterScoops, stepDraw } from '@/world/Draw'

describe('river drawing', () => {
  it('seeds scoop spots on the river bank inside the draw zone', () => {
    const banks = seedWaterScoops()
    expect(banks).toHaveLength(4)
    expect(banks.every((entry) => entry.position.x >= -70 && entry.position.x <= -40)).toBe(true)
    expect(banks.every((entry) => entry.position.z >= 15 && entry.position.z <= 50)).toBe(true)
  })

  it('stands still on the bank and waits before raw water is scooped', () => {
    const world = createInitialWorld()
    const scav = world.survivors.find((entry) => entry.id === 'scavenger')
    const bank = world.waterScoops[0]
    if (!scav || !bank) throw new Error('missing drawer')
    expect(assignPost(world, 'scavenger', 'draw')).toBe(true)
    scav.workerState = 'Work'
    scav.workElapsed = 0
    scav.position = { ...bank.position }
    scav.destination = null
    scav.path = []
    bank.occupantId = scav.id
    const bag = world.inventories[scav.inventoryId]
    const node = world.nodes.find((entry) => entry.id === 'node-water')
    if (!bag || !node) throw new Error('missing bag')
    const reserve = node.reserve
    const start = { x: scav.position.x, z: scav.position.z }

    for (let i = 0; i < 30 * 2; i += 1) stepWorld(world, 1 / 30)
    expect(Math.hypot(scav.position.x - start.x, scav.position.z - start.z)).toBeLessThan(0.05)
    expect(countItem(bag, 'raw_water')).toBe(0)
    expect(activityCaption(world, scav)).toBe('舀水中')

    for (let i = 0; i < 30 * (SCOOP_SECONDS + 2); i += 1) stepWorld(world, 1 / 30)
    expect(countItem(bag, 'raw_water')).toBeGreaterThan(0)
    expect(node.reserve).toBe(reserve)
    expect(scav.lastYieldItem).toBe('raw_water')
  })

  it('does not drain the water node reserve', () => {
    const world = createInitialWorld()
    const scav = world.survivors.find((entry) => entry.id === 'scavenger')
    const bank = world.waterScoops[1]
    if (!scav || !bank) throw new Error('missing drawer')
    scav.dayAssignment = 'draw'
    scav.currentJobId = 'job-draw'
    scav.position = { ...bank.position }
    bank.occupantId = scav.id
    const node = world.nodes.find((entry) => entry.id === 'node-water')
    if (!node) throw new Error('missing node')
    const reserve = node.reserve
    expect(stepDraw(world, scav, SCOOP_SECONDS + 1, { autoTravel: true })).toBe('scooped')
    expect(node.reserve).toBe(reserve)
  })

  it('walks out to the river and brings raw water home without teleporting', () => {
    const world = createInitialWorld()
    expect(assignPost(world, 'scavenger', 'draw')).toBe(true)
    const scav = world.survivors.find((entry) => entry.id === 'scavenger')
    if (!scav) throw new Error('missing scavenger')
    const start = { x: scav.position.x, z: scav.position.z }
    let maxJump = 0
    let sawScoop = false
    for (let i = 0; i < 30 * 50; i += 1) {
      const before = { x: scav.position.x, z: scav.position.z }
      stepWorld(world, 1 / 30)
      maxJump = Math.max(maxJump, Math.hypot(scav.position.x - before.x, scav.position.z - before.z))
      if (activityCaption(world, scav) === '舀水中') sawScoop = true
    }
    const bag = world.inventories[scav.inventoryId]
    const warehouse = world.inventories['inv-warehouse']
    if (!bag || !warehouse) throw new Error('missing stock')
    expect(Math.hypot(scav.position.x - start.x, scav.position.z - start.z)).toBeGreaterThan(8)
    expect(maxJump).toBeLessThanOrEqual(scav.moveSpeed / 30 + 1e-6)
    expect(sawScoop).toBe(true)
    expect(countItem(bag, 'raw_water') + countItem(warehouse, 'raw_water')).toBeGreaterThan(0)
  })
})
