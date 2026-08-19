import { describe, expect, it } from 'vitest'
import { autoCombat, butcherWildlife, harvestWildlife, tryShoot, stepProjectiles } from '@/combat/Combat'
import { countItem } from '@/inventory/Inventory'
import { assignPost } from '@/jobs/Roster'
import { stepWorld } from '@/simulation/SimStep'
import { createInitialWorld } from '@/simulation/WorldState'
import { activityCaption, activityLines } from '@/survivors/Activity'
import { recordWorkYield } from '@/survivors/Progress'
import { recallFieldWorkers } from '@/jobs/DayWorker'
import { WILDLIFE_SPECIES, nearestLivingWildlife, seedWildlife, stepWildlife } from '@/world/Wildlife'

describe('wildlife and field food', () => {
  it('sends 冯老师 hunting when the player is possessing someone else', () => {
    const world = createInitialWorld()
    world.player.controlledId = null
    const hunter = world.survivors.find((entry) => entry.id === 'hunter')
    if (!hunter) throw new Error('missing hunter')
    const start = { x: hunter.position.x, z: hunter.position.z }
    for (let i = 0; i < 30 * 18; i += 1) stepWorld(world, 1 / 30)
    const moved = Math.hypot(hunter.position.x - start.x, hunter.position.z - start.z)
    expect(hunter.dayAssignment).toBe('hunt')
    expect(moved).toBeGreaterThan(8)
    expect(hunter.position.x).toBeGreaterThan(start.x)
  })

  it('recalls field workers home without teleporting them', () => {
    const world = createInitialWorld()
    const fisher = world.survivors.find((entry) => entry.id === 'fisher')
    if (!fisher) throw new Error('missing fisher')
    fisher.position = { x: -55, y: 0, z: 32 }
    fisher.workerState = 'Work'
    fisher.destination = null
    fisher.path = []
    expect(recallFieldWorkers(world)).toBeGreaterThan(0)
    expect(fisher.workerState).toBe('ReturnToBase')
    expect(Math.hypot(fisher.position.x + 55, fisher.position.z - 32)).toBeLessThan(0.05)
  })

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
    deer.butcherElapsed = 4
    hunter.position = { ...deer.position }
    const bag = world.inventories[hunter.inventoryId]
    if (!bag) throw new Error('missing bag')
    const xp = hunter.xp
    expect(harvestWildlife(world, hunter)).toBe(true)
    expect(countItem(bag, 'raw_meat')).toBeGreaterThanOrEqual(2)
    expect(countItem(bag, 'hide')).toBeGreaterThanOrEqual(1)
    expect(countItem(bag, 'bone')).toBeGreaterThanOrEqual(1)
    expect(deer.harvested).toBe(true)
    expect(hunter.xp).toBeGreaterThan(xp)
    expect(hunter.lastYieldItem).toBe('raw_meat')
  })

  it('skins a fox for meat and hide without bone', () => {
    const world = createInitialWorld()
    const hunter = world.survivors.find((entry) => entry.id === 'hunter')
    const fox = world.wildlife.find((entry) => entry.kind === 'fox')
    if (!hunter || !fox) throw new Error('missing fox')
    fox.alive = false
    fox.health = 0
    fox.butcherElapsed = 4
    hunter.position = { ...fox.position }
    const bag = world.inventories[hunter.inventoryId]
    if (!bag) throw new Error('missing bag')
    expect(harvestWildlife(world, hunter)).toBe(true)
    expect(countItem(bag, 'raw_meat')).toBeGreaterThanOrEqual(1)
    expect(countItem(bag, 'hide')).toBeGreaterThanOrEqual(1)
    expect(countItem(bag, 'bone')).toBe(0)
  })

  it('needs a butcher action before meat can be taken', () => {
    const world = createInitialWorld()
    const hunter = world.survivors.find((entry) => entry.id === 'hunter')
    const deer = world.wildlife.find((entry) => entry.kind === 'deer')
    if (!hunter || !deer) throw new Error('missing hunt')
    deer.alive = false
    deer.health = 0
    hunter.position = { ...deer.position }
    expect(harvestWildlife(world, hunter)).toBe(false)
    expect(butcherWildlife(world, hunter, 1)).toBe('working')
    expect(butcherWildlife(world, hunter, 3)).toBe('done')
    expect(deer.harvested).toBe(true)
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

  it('lets followers auto-shoot wildlife when no zombies are nearby', () => {
    const world = createInitialWorld()
    const hunter = world.survivors.find((entry) => entry.id === 'hunter')
    if (!hunter) throw new Error('missing hunter')
    hunter.equipment.weapon = 'rifle'
    hunter.carriedTools = ['rifle']
    hunter.fireCooldown = 0
    const deer = nearestLivingWildlife(world, { x: 52, z: -18 }, 20)
    if (!deer) throw new Error('missing deer')
    hunter.position = { x: deer.position.x, y: 0, z: deer.position.z - 6 }
    expect(autoCombat(world, hunter)).toBe(true)
    expect(world.projectiles.length).toBeGreaterThan(0)
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
