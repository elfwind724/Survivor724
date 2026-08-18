import { describe, expect, it } from 'vitest'
import { harvestWildlife, tryShoot, stepProjectiles } from '@/combat/Combat'
import { countItem } from '@/inventory/Inventory'
import { assignPost } from '@/jobs/Roster'
import { stepWorld } from '@/simulation/SimStep'
import { createInitialWorld } from '@/simulation/WorldState'
import { activityCaption, activityLines } from '@/survivors/Activity'
import { recordWorkYield } from '@/survivors/Progress'
import { WILDLIFE_SPECIES, nearestLivingWildlife, seedWildlife, stepWildlife } from '@/world/Wildlife'

describe('wildlife and field food', () => {
  it('seeds forest, grass, and river animals at people-sized heights', () => {
    const animals = seedWildlife()
    expect(animals.some((entry) => entry.kind === 'deer' && entry.habitat === 'forest')).toBe(true)
    expect(animals.some((entry) => entry.kind === 'cow' && entry.habitat === 'grass')).toBe(true)
    expect(animals.some((entry) => entry.habitat === 'river')).toBe(true)
    expect(animals.filter((entry) => entry.herdId === 'herd-forest').length).toBeGreaterThanOrEqual(3)
    expect(Object.values(WILDLIFE_SPECIES).every((species) => species.height <= 1.6)).toBe(true)
    expect(WILDLIFE_SPECIES.fox.height).toBeLessThan(0.8)
  })

  it('makes animals flee when a survivor walks up', () => {
    const world = createInitialWorld()
    const deer = world.wildlife.find((entry) => entry.kind === 'deer' && entry.alive)
    const hunter = world.survivors.find((entry) => entry.id === 'hunter')
    if (!deer || !hunter) throw new Error('missing deer')
    hunter.position = { x: deer.position.x + 2, y: 0, z: deer.position.z }
    const start = { x: deer.position.x, z: deer.position.z }
    stepWildlife(world, 0.5)
    expect(deer.mood).toBe('flee')
    expect(Math.hypot(deer.position.x - start.x, deer.position.z - start.z)).toBeGreaterThan(0.4)
  })

  it('turns a downed deer into raw meat and profession xp', () => {
    const world = createInitialWorld()
    const hunter = world.survivors.find((entry) => entry.id === 'hunter')
    const deer = world.wildlife.find((entry) => entry.kind === 'deer')
    if (!hunter || !deer) throw new Error('missing hunt')
    deer.alive = false
    deer.health = 0
    hunter.position = { ...deer.position }
    const bag = world.inventories[hunter.inventoryId]
    if (!bag) throw new Error('missing bag')
    const xp = hunter.xp
    expect(harvestWildlife(world, hunter)).toBe(true)
    expect(countItem(bag, 'raw_meat')).toBe(2)
    expect(deer.harvested).toBe(true)
    expect(hunter.xp).toBeGreaterThan(xp)
    expect(hunter.lastYieldItem).toBe('raw_meat')
  })

  it('lets a cook turn berries into meals', () => {
    const world = createInitialWorld()
    const warehouse = world.inventories['inv-warehouse']
    if (!warehouse) throw new Error('missing warehouse')
    warehouse.items.push({ itemId: 'berry', count: 3 })
    expect(assignPost(world, 'hauler', 'cook')).toBe(true)
    for (let i = 0; i < 30 * 45; i += 1) stepWorld(world, 1 / 30)
    expect(countItem(warehouse, 'meal')).toBeGreaterThan(6)
    const cook = world.survivors.find((entry) => entry.id === 'hauler')
    expect(cook?.lastYieldItem === 'meal' || countItem(warehouse, 'berry') < 3).toBe(true)
  })

  it('sends a gatherer out for berries', () => {
    const world = createInitialWorld()
    expect(assignPost(world, 'scavenger', 'gather')).toBe(true)
    for (let i = 0; i < 30 * 40; i += 1) stepWorld(world, 1 / 30)
    const scav = world.survivors.find((entry) => entry.id === 'scavenger')
    const bag = scav ? world.inventories[scav.inventoryId] : undefined
    const warehouse = world.inventories['inv-warehouse']
    if (!scav || !bag || !warehouse) throw new Error('missing gatherer')
    expect(countItem(bag, 'berry') + countItem(warehouse, 'berry')).toBeGreaterThan(0)
    expect(scav.currentJobId).toBe('job-gather')
  })

  it('writes cooking captions with cooldown and yield', () => {
    const world = createInitialWorld()
    const builder = world.survivors.find((entry) => entry.id === 'builder')
    if (!builder) throw new Error('missing builder')
    builder.dayAssignment = 'cook'
    builder.currentJobId = 'cook-kitchen'
    builder.workerState = 'Work'
    builder.workElapsed = 1.5
    builder.indoorId = world.structures.find((entry) => entry.definitionId === 'kitchen')?.id ?? null
    world.jobs.push({ id: 'cook-kitchen', definitionId: 'cook', targetId: 'kitchen', assigneeId: builder.id })
    expect(activityCaption(world, builder)).toBe('做饭中')
    recordWorkYield(world, builder, 'meal', 1, 5)
    const lines = activityLines(world, builder)
    expect(lines[0]).toMatch(/做饭中/)
    expect(lines[0]).toMatch(/CD/)
    expect(lines.some((line) => line.includes('熟食'))).toBe(true)
    expect(lines.some((line) => line.includes('经验'))).toBe(true)
  })

  it('lets a hunter shot drop nearby wildlife', () => {
    const world = createInitialWorld()
    const hunter = world.survivors.find((entry) => entry.id === 'hunter')
    if (!hunter) throw new Error('missing hunter')
    hunter.equipment.weapon = 'rifle'
    hunter.carriedTools = ['rifle']
    const deer = nearestLivingWildlife(world, { x: 52, z: -18 }, 20)
    if (!deer) throw new Error('missing deer')
    world.wildlife = [deer]
    hunter.position = { x: deer.position.x, y: 0, z: deer.position.z - 6 }
    hunter.facingYaw = 0
    expect(tryShoot(world, hunter)).toBe(true)
    for (let i = 0; i < 20; i += 1) stepProjectiles(world, 1 / 30)
    expect(deer.health).toBeLessThan(WILDLIFE_SPECIES.deer.health)
  })
})
