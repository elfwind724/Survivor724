import { describe, expect, it } from 'vitest'
import { createCompleteStructure, demolishStructure } from '@/base/construction'
import { countItem } from '@/inventory/Inventory'
import { worldToCell } from '@/navigation/NavGrid'
import { stepWorld } from '@/simulation/SimStep'
import { createInitialWorld } from '@/simulation/WorldState'
import { diningSpot, eatAtBase, eatOne } from '@/survivors/Living'

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
    const hunter = world.survivors.find((entry) => entry.id === 'hunter')
    const warehouse = world.inventories['inv-warehouse']
    if (!hunter || !warehouse) throw new Error('missing hunter')
    hunter.hunger = 40
    hunter.thirst = 40
    hunter.fatigue = 40
    hunter.position = { x: 0, y: 0, z: 0 }
    hunter.workerState = 'Idle'
    hunter.destination = null
    hunter.path = []
    world.time.daySeconds = 60 + 11 * 60 + 10
    world.time.phase = 'dusk'
    world.lastPhase = 'dusk'
    const meals = countItem(warehouse, 'meal')
    simulate(world, 20)
    expect(hunter.hunger).toBeGreaterThan(70)
    expect(countItem(warehouse, 'meal')).toBeLessThan(meals)
    expect(['Rest', 'Eat', 'RestOrNextJob']).toContain(hunter.workerState)
    simulate(world, 12)
    expect(hunter.fatigue).toBeLessThan(40)
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
