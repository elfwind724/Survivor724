import { describe, expect, it } from 'vitest'
import { setWorkZone } from '@/base/workZones'
import { countItem } from '@/inventory/Inventory'
import { stepWorld } from '@/simulation/SimStep'
import { createInitialWorld } from '@/simulation/WorldState'

const DT = 1 / 30

function simulate(world: ReturnType<typeof createInitialWorld>, seconds: number): void {
  const steps = Math.round(seconds / DT)
  for (let i = 0; i < steps; i += 1) stepWorld(world, DT)
}

describe('construction and work zones', () => {
  it('does not complete a blueprint without hauled materials', () => {
    const world = createInitialWorld()
    const warehouse = world.inventories['inv-warehouse']
    if (!warehouse) throw new Error('missing warehouse')
    warehouse.items = []
    const blueprint = world.structures.find((structure) => structure.stage !== 'complete')
    if (!blueprint) throw new Error('missing blueprint')

    simulate(world, 40)
    expect(blueprint.stage === 'blueprint' || blueprint.stage === 'hauling').toBe(true)
    expect(countItem(world.inventories[blueprint.inventoryId] ?? { id: '', capacity: 0, items: [] }, 'wood')).toBe(0)
  })

  it('hauls wood and constructs the seeded wall blueprint', () => {
    const world = createInitialWorld()
    const blueprint = world.structures.find((structure) => structure.stage !== 'complete')
    if (!blueprint) throw new Error('missing blueprint')

    simulate(world, 90)
    expect(blueprint.stage).toBe('complete')
    expect(world.structures.filter((structure) => structure.stage === 'complete').length).toBeGreaterThan(3)
  })

  it('keeps a hunter inside the assigned work zone', () => {
    const world = createInitialWorld()
    setWorkZone(world, 'hunt', -40, -40, -20, -20)
    const forest = world.nodes.find((node) => node.id === 'node-forest')
    if (!forest) throw new Error('missing forest')
    const reserve = forest.reserve

    simulate(world, 40)
    const hunter = world.survivors.find((entry) => entry.id === 'hunter')
    if (!hunter) throw new Error('missing hunter')
    expect(forest.reserve).toBe(reserve)
    expect(hunter.position.x).toBeLessThan(20)
  })
})
