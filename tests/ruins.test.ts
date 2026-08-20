import { describe, expect, it } from 'vitest'
import { countItem } from '@/inventory/Inventory'
import { stepWorld } from '@/simulation/SimStep'
import { createInitialWorld } from '@/simulation/WorldState'
import { activityCaption } from '@/survivors/Activity'
import { SEARCH_SECONDS, claimRuinCrate, seedRuinCrates, stepScavenge } from '@/world/Ruins'

describe('ruin scavenging', () => {
  it('seeds crates around the ruin and leaves the generator too heavy to pocket', () => {
    const boxes = seedRuinCrates()
    expect(boxes.filter((entry) => entry.kind !== 'heavy').length).toBe(4)
    expect(boxes.some((entry) => entry.kind === 'heavy' && entry.loot.length === 0)).toBe(true)
    expect(boxes.every((entry) => entry.position.x > 25 && entry.position.x < 55)).toBe(true)
    expect(boxes.every((entry) => entry.position.z > 40 && entry.position.z < 72)).toBe(true)
  })

  it('does not let a scavenger claim the generator', () => {
    const world = createInitialWorld()
    const scav = world.survivors.find((entry) => entry.id === 'scavenger')
    if (!scav) throw new Error('missing scavenger')
    for (const box of world.ruinCrates) {
      if (box.kind !== 'heavy') box.searched = true
    }
    expect(claimRuinCrate(world, scav)).toBeNull()
  })

  it('stands still at a crate and waits before scrap comes out', () => {
    const world = createInitialWorld()
    const scav = world.survivors.find((entry) => entry.id === 'scavenger')
    const box = world.ruinCrates.find((entry) => entry.kind === 'crate')
    if (!scav || !box) throw new Error('missing scavenger')
    scav.carriedTools = ['crowbar']
    scav.workerState = 'Work'
    scav.workElapsed = 0
    scav.position = { ...box.position }
    scav.destination = null
    scav.path = []
    box.occupantId = scav.id
    const bag = world.inventories[scav.inventoryId]
    const ruin = world.nodes.find((node) => node.id === 'node-ruin')
    if (!bag || !ruin) throw new Error('missing bag')
    const reserve = ruin.reserve
    const start = { x: scav.position.x, z: scav.position.z }

    for (let i = 0; i < 30 * 3; i += 1) stepWorld(world, 1 / 30)
    expect(Math.hypot(scav.position.x - start.x, scav.position.z - start.z)).toBeLessThan(0.05)
    expect(countItem(bag, 'scrap')).toBe(0)
    expect(activityCaption(world, scav)).toBe('翻箱中')

    for (let i = 0; i < 30 * (SEARCH_SECONDS.crate + 2); i += 1) stepWorld(world, 1 / 30)
    expect(countItem(bag, 'scrap')).toBeGreaterThan(0)
    expect(ruin.reserve).toBe(reserve)
    expect(scav.lastYieldItem).toBe('scrap')
  })

  it('does not drain the ruin node reserve', () => {
    const world = createInitialWorld()
    const scav = world.survivors.find((entry) => entry.id === 'scavenger')
    const box = world.ruinCrates.find((entry) => entry.kind === 'pile')
    if (!scav || !box) throw new Error('missing scavenger')
    scav.carriedTools = ['crowbar']
    scav.position = { ...box.position }
    box.occupantId = scav.id
    const ruin = world.nodes.find((node) => node.id === 'node-ruin')
    if (!ruin) throw new Error('missing ruin')
    const reserve = ruin.reserve
    expect(stepScavenge(world, scav, SEARCH_SECONDS.pile + 1, { autoTravel: true })).toBe('looted')
    expect(ruin.reserve).toBe(reserve)
  })

  it('walks out to the ruins and brings scrap home without teleporting', () => {
    const world = createInitialWorld()
    const scav = world.survivors.find((entry) => entry.id === 'scavenger')
    if (!scav) throw new Error('missing scavenger')
    const start = { x: scav.position.x, z: scav.position.z }
    let maxJump = 0
    let sawSearch = false
    for (let i = 0; i < 30 * 90; i += 1) {
      const before = { x: scav.position.x, z: scav.position.z }
      stepWorld(world, 1 / 30)
      const jumped = Math.hypot(scav.position.x - before.x, scav.position.z - before.z)
      maxJump = Math.max(maxJump, jumped)
      if (activityCaption(world, scav) === '翻箱中') sawSearch = true
    }
    const bag = world.inventories[scav.inventoryId]
    const warehouse = world.inventories['inv-warehouse']
    if (!bag || !warehouse) throw new Error('missing stock')
    expect(Math.hypot(scav.position.x - start.x, scav.position.z - start.z)).toBeGreaterThan(8)
    expect(maxJump).toBeLessThanOrEqual(scav.moveSpeed / 30 + 1e-6)
    expect(sawSearch).toBe(true)
    expect(countItem(bag, 'scrap') + countItem(warehouse, 'scrap') + countItem(bag, 'ammo') + countItem(warehouse, 'ammo')).toBeGreaterThan(24)
  })
})
