import { describe, expect, it } from 'vitest'
import { createCompleteStructure, demolishStructure, lineCells, placeBlueprint, placeWallLine, previewPlacement, previewWallLine } from '@/base/construction'
import { FACILITY_DEFINITIONS, wallLineDuration } from '@/data/facilities'
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
  it('exposes every placeable facility from data instead of hard-coded keys', () => {
    expect(FACILITY_DEFINITIONS.length).toBeGreaterThanOrEqual(3)
    for (const facility of FACILITY_DEFINITIONS) {
      expect(facility.label.length).toBeGreaterThan(0)
      expect(facility.id.length).toBeGreaterThan(0)
    }
  })

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

  it('traces an L-shaped wall line on the grid', () => {
    const cells = lineCells({ x: 2, z: 4 }, { x: 6, z: 7 })
    expect(cells[0]).toEqual({ x: 2, z: 4 })
    expect(cells[cells.length - 1]).toEqual({ x: 6, z: 7 })
    expect(cells).toContainEqual({ x: 6, z: 4 })
    expect(cells).toHaveLength(8)
  })

  it('previews a kitchen footprint and rejects overlap', () => {
    const world = createInitialWorld()
    const cell = worldToCell(world.nav, { x: -4, y: 0, z: 8 })
    const preview = previewPlacement(world, 'kitchen', cell.x, cell.z)
    expect(preview.valid).toBe(true)
    expect(preview.cells).toHaveLength(80)

    const wall = world.structures.find((structure) => structure.definitionId === 'wall' && structure.stage === 'complete')
    if (!wall?.cells[0]) throw new Error('missing wall')
    const blocked = previewPlacement(world, 'wall', wall.cells[0].x, wall.cells[0].z)
    expect(blocked.valid).toBe(false)
    expect(blocked.reason).toBe('overlap')
  })

  it('places a distant wall line as one blueprint and skips existing cells', () => {
    const world = createInitialWorld()
    const start = worldToCell(world.nav, { x: -8, y: 0, z: 6 })
    createCompleteStructure(world, 'wall', start.x, start.z)
    const end = worldToCell(world.nav, { x: 8, y: 0, z: 10 })
    const preview = previewWallLine(world, start, end)
    expect(preview.valid).toBe(true)
    expect(preview.cells.some((cell) => cell.x === start.x && cell.z === start.z)).toBe(false)

    const placed = placeWallLine(world, start, end)
    expect(placed.ok).toBe(true)
    expect(placed.structure?.cells.length).toBe(preview.cells.length)
    expect(placed.structure?.required[0]?.count).toBe(preview.cells.length)
    expect(placed.structure?.buildDuration).toBe(wallLineDuration(preview.cells.length))
    expect(placed.structure?.buildDuration).toBeLessThan(3)
  })

  it('hauls and finishes a long wall line in one construction job', () => {
    const world = createInitialWorld()
    const seed = world.structures.find((structure) => structure.stage !== 'complete')
    if (seed) demolishStructure(world, seed.id)

    const start = worldToCell(world.nav, { x: -8, y: 0, z: 6 })
    const end = worldToCell(world.nav, { x: 8, y: 0, z: 6 })
    const placed = placeWallLine(world, start, end)
    expect(placed.ok).toBe(true)
    expect(placed.structure?.cells.length).toBeGreaterThan(10)

    simulate(world, 25)
    expect(placed.structure?.stage).toBe('complete')
  })
})
