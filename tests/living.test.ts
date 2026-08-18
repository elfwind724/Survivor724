import { describe, expect, it } from 'vitest'
import { createCompleteStructure, demolishStructure } from '@/base/construction'
import { countItem } from '@/inventory/Inventory'
import { worldToCell } from '@/navigation/NavGrid'
import { stepWorld } from '@/simulation/SimStep'
import { createInitialWorld } from '@/simulation/WorldState'
import { diningSpot, drinkOne, eatAtBase, eatOne } from '@/survivors/Living'
import { stepVitals } from '@/survivors/Vitals'

const DT = 1 / 30

function simulate(world: ReturnType<typeof createInitialWorld>, seconds: number): void {
  const steps = Math.round(seconds / DT)
  for (let i = 0; i < steps; i += 1) stepWorld(world, DT)
}

describe('living loop', () => {
  it('feeds a survivor standing at the dining spot', () => {
    const world = createInitialWorld()
    const hunter = world.survivors.find((entry) => entry.id === 'hunter')
    const warehouse = world.inventories['inv-warehouse']
    if (!hunter || !warehouse) throw new Error('missing hunter')
    hunter.hunger = 40
    hunter.thirst = 40
    hunter.position = { ...diningSpot(world) }
    const meals = countItem(warehouse, 'meal')
    expect(eatAtBase(world)).toBeGreaterThan(0)
    expect(eatOne(world, hunter)).toBe(true)
    expect(hunter.hunger).toBeGreaterThan(70)
    expect(countItem(warehouse, 'meal')).toBe(meals - 2)
  })

  it('walks hungry people to the warehouse to eat, then home to rest', () => {
    const world = createInitialWorld()
    const fisher = world.survivors.find((entry) => entry.id === 'fisher')
    const warehouse = world.inventories['inv-warehouse']
    if (!fisher || !warehouse) throw new Error('missing fisher')
    fisher.hunger = 40
    fisher.thirst = 40
    fisher.fatigue = 40
    fisher.position = { x: 0, y: 0, z: 0 }
    fisher.workerState = 'Idle'
    fisher.destination = null
    fisher.path = []
    world.time.daySeconds = 60 + 11 * 60 + 10
    world.time.phase = 'dusk'
    world.lastPhase = 'dusk'
    const meals = countItem(warehouse, 'meal')
    simulate(world, 20)
    expect(fisher.hunger).toBeGreaterThan(70)
    expect(countItem(warehouse, 'meal')).toBeLessThan(meals)
    expect(['Rest', 'Eat', 'RestOrNextJob']).toContain(fisher.workerState)
    simulate(world, 12)
    expect(fisher.fatigue).toBeLessThan(40)
  })

  it('hurts survivors still in the field when night falls', () => {
    const world = createInitialWorld()
    const hunter = world.survivors.find((entry) => entry.id === 'hunter')
    if (!hunter) throw new Error('missing hunter')
    hunter.position = { x: 70, y: 0, z: -20 }
    hunter.health = 90
    hunter.hunger = 70
    world.lastPhase = 'dusk'
    world.time.daySeconds = 810
    world.time.phase = 'dusk'
    stepWorld(world, DT)
    expect(world.time.phase).toBe('night')
    expect(hunter.health).toBeLessThan(90)
    expect(hunter.hunger).toBeLessThan(70)
  })

  it('drains about two meals and two waters from a working day, and night no longer refills them', () => {
    const world = createInitialWorld()
    const fisher = world.survivors.find((entry) => entry.id === 'fisher')
    if (!fisher) throw new Error('missing fisher')
    fisher.hunger = 100
    fisher.thirst = 100
    fisher.workerState = 'Work'
    world.time.phase = 'day'
    const startHunger = fisher.hunger
    const startThirst = fisher.thirst
    for (let i = 0; i < 12 * 60 * 30; i += 1) stepVitals(world, 1 / 30)
    const dayHunger = startHunger - fisher.hunger
    const dayThirst = startThirst - fisher.thirst
    expect(dayHunger).toBeGreaterThan(40)
    expect(dayThirst).toBeGreaterThan(40)
    expect(dayHunger).toBeLessThan(90)
    const afterDayHunger = fisher.hunger
    world.time.phase = 'night'
    fisher.workerState = 'Rest'
    for (let i = 0; i < 30 * 30; i += 1) stepVitals(world, 1 / 30)
    expect(fisher.hunger).toBeLessThan(afterDayHunger)
  })

  it('drinks warehouse water to recover thirst', () => {
    const world = createInitialWorld()
    const hunter = world.survivors.find((entry) => entry.id === 'hunter')
    const warehouse = world.inventories['inv-warehouse']
    if (!hunter || !warehouse) throw new Error('missing hunter')
    hunter.thirst = 30
    const water = countItem(warehouse, 'water')
    expect(drinkOne(world, hunter)).toBe(true)
    expect(hunter.thirst).toBeGreaterThan(70)
    expect(countItem(warehouse, 'water')).toBe(water - 1)
  })

  it('turns raw meat into meals at a finished kitchen', () => {
    const world = createInitialWorld()
    const seed = world.structures.find((structure) => structure.stage !== 'complete')
    if (seed) demolishStructure(world, seed.id)
    const cell = worldToCell(world.nav, { x: -4, y: 0, z: 8 })
    createCompleteStructure(world, 'kitchen', cell.x, cell.z)
    const warehouse = world.inventories['inv-warehouse']
    if (!warehouse) throw new Error('missing warehouse')
    warehouse.items.push({ itemId: 'raw_meat', count: 4 })
    simulate(world, 45)
    expect(countItem(warehouse, 'meal')).toBeGreaterThan(0)
  })
})
