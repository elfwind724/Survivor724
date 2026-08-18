import { describe, expect, it } from 'vitest'
import { countItem, usedSlots } from '@/inventory/Inventory'
import { stepWorld } from '@/simulation/SimStep'
import { createInitialWorld } from '@/simulation/WorldState'
import { distanceXZ } from '@/simulation/types'
import { moveToward } from '@/survivors/Survivor'
import type { WorldState } from '@/simulation/types'

const DT = 1 / 30

function simulate(world: WorldState, seconds: number): { maxJump: number } {
  let maxJump = 0
  const steps = Math.round(seconds / DT)
  for (let i = 0; i < steps; i += 1) {
    const previous = world.survivors.map((survivor) => ({
      id: survivor.id,
      position: { ...survivor.position },
      speed: survivor.moveSpeed,
    }))
    stepWorld(world, DT)
    for (const survivor of world.survivors) {
      const before = previous.find((entry) => entry.id === survivor.id)
      if (!before) continue
      const jumped = distanceXZ(before.position, survivor.position)
      maxJump = Math.max(maxJump, jumped)
      expect(jumped).toBeLessThanOrEqual(before.speed * DT + 1e-6)
    }
  }
  return { maxJump }
}

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
    hunter.destination = { x: hunter.position.x + 10, y: 0, z: hunter.position.z }
    const startX = hunter.position.x
    const arrived = moveToward(hunter, 1)
    expect(arrived).toBe(false)
    expect(hunter.position.x).not.toBe(startX)
    expect(hunter.position.x).toBeGreaterThan(startX)
  })

  it('picks tools, walks to the node, carries output, and deposits it', () => {
    const world = createInitialWorld()
    const fisher = world.survivors.find((entry) => entry.id === 'fisher')
    if (!fisher) throw new Error('missing fisher')
    fisher.returnFill = 1 / 8

    simulate(world, 220)

    const warehouse = world.inventories['inv-warehouse']
    const bag = world.inventories[fisher.inventoryId]
    if (!warehouse || !bag) throw new Error('missing inventories')

    expect(fisher.carriedTools.includes('rod'), fisher.blockedReason ?? 'no reason').toBe(true)
    expect(countItem(warehouse, 'raw_fish') + usedSlots(bag)).toBeGreaterThan(0)
    expect(fisher.currentJobId).toBe('job-fish')
  })

  it('cannot collect without tools', () => {
    const world = createInitialWorld()
    const locker = world.inventories['inv-locker']
    if (!locker) throw new Error('missing locker')
    locker.items = []

    simulate(world, 20)

    const fisher = world.survivors.find((entry) => entry.id === 'fisher')
    const warehouse = world.inventories['inv-warehouse']
    if (!fisher || !warehouse) throw new Error('missing fisher or warehouse')

    expect(fisher.blockedReason).toBe('missing_tool')
    expect(fisher.carriedTools).toEqual([])
    expect(countItem(warehouse, 'raw_fish')).toBe(0)
    expect(world.nodes.find((node) => node.id === 'node-forest')?.reserve).toBe(80)
  })

  it('returns when the backpack is full', () => {
    const world = createInitialWorld()
    const fisher = world.survivors.find((entry) => entry.id === 'fisher')
    if (!fisher) throw new Error('missing fisher')
    const bag = world.inventories[fisher.inventoryId]
    if (!bag) throw new Error('missing bag')
    bag.capacity = 2

    let sawFullBag = false
    let sawReturn = false
    for (let i = 0; i < 30 * 80; i += 1) {
      stepWorld(world, DT)
      const currentBag = world.inventories[fisher.inventoryId]
      if (currentBag && usedSlots(currentBag) >= 2) sawFullBag = true
      if (fisher.workerState === 'ReturnToBase' || fisher.workerState === 'DepositItems') sawReturn = true
      if (sawFullBag && sawReturn && countItem(world.inventories['inv-warehouse'] ?? { id: '', capacity: 0, items: [] }, 'raw_fish') >= 2) {
        break
      }
    }

    expect(sawFullBag).toBe(true)
    expect(sawReturn).toBe(true)
    const stock = world.inventories['inv-warehouse'] ?? { id: '', capacity: 0, items: [] }
    expect(countItem(stock, 'raw_fish') + countItem(stock, 'water')).toBeGreaterThanOrEqual(2)
  })

  it('runs hunter, fisher, and scavenger for three days without losing jobs, teleporting, or stalling', () => {
    const world = createInitialWorld()
    const worked = new Set<string>()
    const deposited = new Set<string>()
    const steps = Math.round((world.time.dayLengthSeconds * 3 + 2) / DT)
    let maxJump = 0

    for (let i = 0; i < steps; i += 1) {
      const previous = world.survivors.map((survivor) => ({
        id: survivor.id,
        position: { ...survivor.position },
        speed: survivor.moveSpeed,
      }))
      stepWorld(world, DT)
      for (const survivor of world.survivors) {
        if (survivor.workerState === 'Work') worked.add(survivor.id)
        if (survivor.workerState === 'DepositItems') deposited.add(survivor.id)
        const before = previous.find((entry) => entry.id === survivor.id)
        if (!before) continue
        const jumped = distanceXZ(before.position, survivor.position)
        maxJump = Math.max(maxJump, jumped)
        const cap = Math.max(before.speed, survivor.moveSpeed) * DT + 1e-6
        expect(jumped).toBeLessThanOrEqual(cap)
      }
    }

    expect(world.time.dayIndex).toBeGreaterThanOrEqual(4)
    const topSpeed = Math.max(...world.survivors.map((survivor) => survivor.moveSpeed))
    expect(maxJump).toBeLessThanOrEqual(topSpeed * DT + 1e-6)

    const warehouse = world.inventories['inv-warehouse']
    if (!warehouse) throw new Error('missing warehouse')
    expect(countItem(warehouse, 'raw_fish') + countItem(warehouse, 'meal')).toBeGreaterThan(6)
    expect(countItem(warehouse, 'scrap')).toBeGreaterThan(0)

    for (const id of ['fisher', 'scavenger'] as const) {
      const survivor = world.survivors.find((entry) => entry.id === id)
      const job = world.jobs.find((entry) => entry.assigneeId === id)
      if (!survivor || !job) throw new Error(`missing ${id}`)
      expect(survivor.currentJobId).toBe(job.id)
      expect(job.definitionId).toBe(survivor.dayAssignment)
      expect(survivor.blockedReason).toBeNull()
      expect(worked.has(id)).toBe(true)
      expect(deposited.has(id)).toBe(true)
    }
  }, 10_000)
})
