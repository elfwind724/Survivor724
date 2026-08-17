import { describe, expect, it } from 'vitest'
import { demolishStructure, placeBlueprint } from '@/base/construction'
import { setWorkZone } from '@/base/workZones'
import { countItem } from '@/inventory/Inventory'
import { worldToCell } from '@/navigation/NavGrid'
import { BASE } from '@/simulation/WorldState'
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

  it('starts with a yard large enough for a kitchen', () => {
    const world = createInitialWorld()
    expect(BASE.east - BASE.west).toBeGreaterThanOrEqual(50)
    expect(BASE.north - BASE.south).toBeGreaterThanOrEqual(50)
    const cell = worldToCell(world.nav, { x: -4, y: 0, z: 8 })
    const inside = placeBlueprint(world, 'kitchen', cell.x, cell.z)
    expect(inside.ok).toBe(true)
  })

  it('demolishes a blueprint and returns hauled materials', () => {
    const world = createInitialWorld()
    const blueprint = world.structures.find((structure) => structure.stage !== 'complete')
    if (!blueprint) throw new Error('missing blueprint')
    const warehouse = world.inventories['inv-warehouse']
    if (!warehouse) throw new Error('missing warehouse')
    const before = countItem(warehouse, 'wood')
    world.inventories[blueprint.inventoryId]?.items.push({ itemId: 'wood', count: 4 })
    expect(demolishStructure(world, blueprint.id)).toBe(true)
    expect(world.structures.some((structure) => structure.id === blueprint.id)).toBe(false)
    expect(countItem(warehouse, 'wood')).toBe(before + 4)
  })

  it('gives the hauler the next blueprint after the first wall is finished', () => {
    const world = createInitialWorld()
    simulate(world, 90)
    expect(world.structures.some((structure) => structure.stage === 'complete' && structure.definitionId === 'wall')).toBe(true)

    const cell = worldToCell(world.nav, { x: -4, y: 0, z: 8 })
    const placed = placeBlueprint(world, 'kitchen', cell.x, cell.z)
    expect(placed.ok).toBe(true)
    expect(placed.structure).not.toBeNull()
    simulate(world, 1)

    const haul = world.jobs.find((job) => job.definitionId === 'haul' && job.targetId === placed.structure?.id)
    expect(haul?.assigneeId).toBe('hauler')
    const hauler = world.survivors.find((entry) => entry.id === 'hauler')
    expect(hauler?.currentJobId).toBe(haul?.id)
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
