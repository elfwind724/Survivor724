import { facilityDefinition, footprintCells } from '@/data/facilities'
import { addItem, countItem, createInventory, inventoryOf, removeItem } from '@/inventory/Inventory'
import { findContainer } from '@/simulation/EntityRegistry'
import type { GridCell, StructureState, Vec3, WorldState } from '@/simulation/types'
import { cellCenter, cellIndex, inBounds, markNavDirty, rebuildNav, worldToCell } from '@/navigation/NavGrid'
import { pathExists } from '@/navigation/AStar'

export interface PlaceResult {
  ok: boolean
  reason: string | null
  structure: StructureState | null
}

export function findStructure(world: WorldState, id: string): StructureState | undefined {
  return world.structures.find((entry) => entry.id === id)
}

export function sitePosition(world: WorldState, structure: StructureState): Vec3 {
  const first = structure.cells[0]
  if (!first) return { x: 0, y: 0, z: 0 }
  return cellCenter(world.nav, first)
}

export function materialsMet(world: WorldState, structure: StructureState): boolean {
  const inventory = inventoryOf(world.inventories, structure.inventoryId)
  return structure.required.every((item) => countItem(inventory, item.itemId) >= item.count)
}

export function stillNeeded(world: WorldState, structure: StructureState): Array<{ itemId: string; count: number }> {
  const inventory = inventoryOf(world.inventories, structure.inventoryId)
  return structure.required
    .map((item) => ({ itemId: item.itemId, count: item.count - countItem(inventory, item.itemId) }))
    .filter((item) => item.count > 0)
}

export function completeStructure(world: WorldState, structure: StructureState): void {
  const inventory = inventoryOf(world.inventories, structure.inventoryId)
  for (const item of structure.required) removeItem(inventory, item.itemId, item.count)
  structure.stage = 'complete'
  structure.buildElapsed = structure.buildDuration
  markNavDirty(world)
}

export function setGateOpen(world: WorldState, structureId: string, open: boolean): boolean {
  const structure = findStructure(world, structureId)
  if (!structure || structure.kind !== 'gate' || structure.stage !== 'complete') return false
  structure.open = open
  markNavDirty(world)
  return true
}

export function toggleGates(world: WorldState): void {
  for (const structure of world.structures) {
    if (structure.kind !== 'gate' || structure.stage !== 'complete') continue
    structure.open = !structure.open
    markNavDirty(world)
  }
}

export function demolishStructure(world: WorldState, structureId: string, refund = true): boolean {
  const index = world.structures.findIndex((entry) => entry.id === structureId)
  const structure = world.structures[index]
  if (index < 0 || !structure) return false

  const warehouse = findContainer(world, 'warehouse')
  if (warehouse) {
    const stock = inventoryOf(world.inventories, warehouse.inventoryId)
    const site = inventoryOf(world.inventories, structure.inventoryId)
    for (const item of site.items) addItem(stock, item.itemId, item.count)
    site.items = []
    if (refund && structure.stage === 'complete') {
      for (const item of structure.required) addItem(stock, item.itemId, item.count)
    }
  }

  const removedJobs = new Set(
    world.jobs.filter((job) => job.targetId === structure.id).map((job) => job.id),
  )
  world.jobs = world.jobs.filter((job) => job.targetId !== structure.id)
  for (const survivor of world.survivors) {
    if (!survivor.currentJobId || !removedJobs.has(survivor.currentJobId)) continue
    survivor.currentJobId = null
    survivor.workerState = 'RestOrNextJob'
    survivor.path = []
    survivor.destination = null
  }

  delete world.inventories[structure.inventoryId]
  world.structures.splice(index, 1)
  markNavDirty(world)
  return true
}

export function structureAt(world: WorldState, point: Vec3): StructureState | undefined {
  const cell = worldToCell(world.nav, point)
  return world.structures.find((structure) =>
    structure.cells.some((entry) => entry.x === cell.x && entry.z === cell.z),
  )
}

export function placeBlueprint(world: WorldState, definitionId: string, originX: number, originZ: number): PlaceResult {
  const definition = facilityDefinition(definitionId)
  if (!definition) return { ok: false, reason: 'unknown_facility', structure: null }

  const cells = footprintCells(definition, originX, originZ)
  if (cells.some((cell) => !inBounds(world.nav, cell))) {
    return { ok: false, reason: 'out_of_bounds', structure: null }
  }
  if (cellsOverlap(world, cells)) {
    return { ok: false, reason: 'overlap', structure: null }
  }
  if (definition.blocksNav && wouldBlockExit(world, cells, definition.kind === 'gate')) {
    return { ok: false, reason: 'blocks_exit', structure: null }
  }

  const id = `structure-${world.structures.length + 1}-${definitionId}`
  const inventory = createInventory(`inv-${id}`, 40)
  world.inventories[inventory.id] = inventory
  const structure: StructureState = {
    id,
    definitionId,
    kind: definition.kind,
    cells,
    stage: 'blueprint',
    inventoryId: inventory.id,
    required: definition.required.map((item) => ({ ...item })),
    buildElapsed: 0,
    buildDuration: definition.buildDuration,
    open: definition.kind === 'gate',
    hp: structureHp(definition.kind),
    maxHp: structureHp(definition.kind),
  }
  world.structures.push(structure)
  return { ok: true, reason: null, structure }
}

export function createCompleteStructure(
  world: WorldState,
  definitionId: string,
  originX: number,
  originZ: number,
  open = true,
): StructureState {
  const definition = facilityDefinition(definitionId)
  if (!definition) throw new Error(`Unknown facility ${definitionId}`)
  const id = `structure-${world.structures.length + 1}-${definitionId}`
  const inventory = createInventory(`inv-${id}`, 40)
  world.inventories[inventory.id] = inventory
  const structure: StructureState = {
    id,
    definitionId,
    kind: definition.kind,
    cells: footprintCells(definition, originX, originZ),
    stage: 'complete',
    inventoryId: inventory.id,
    required: definition.required.map((item) => ({ ...item })),
    buildElapsed: definition.buildDuration,
    buildDuration: definition.buildDuration,
    open,
    hp: structureHp(definition.kind),
    maxHp: structureHp(definition.kind),
  }
  world.structures.push(structure)
  markNavDirty(world)
  return structure
}

export function structureHp(kind: StructureState['kind']): number {
  if (kind === 'gate') return 140
  if (kind === 'building') return 180
  return 90
}

export function damageStructure(world: WorldState, structure: StructureState, amount: number): boolean {
  if (structure.stage !== 'complete') return false
  structure.hp = Math.max(0, structure.hp - amount)
  if (structure.hp > 0) return false
  demolishStructure(world, structure.id, false)
  return true
}

function cellsOverlap(world: WorldState, cells: GridCell[]): boolean {
  return world.structures.some((structure) =>
    structure.cells.some((cell) => cells.some((candidate) => candidate.x === cell.x && candidate.z === cell.z)),
  )
}

function wouldBlockExit(world: WorldState, extraCells: GridCell[], extraIsOpenGate: boolean): boolean {
  if (extraIsOpenGate) return false
  const warehouse = findContainer(world, 'warehouse')
  const locker = findContainer(world, 'tool_locker')
  const forest = world.nodes.find((node) => node.kind === 'hunt')
  if (!warehouse || !locker || !forest) return false

  const previous = world.nav.blocked.slice()
  const previousVersion = world.nav.version
  rebuildNav(world)
  for (const cell of extraCells) {
    if (!inBounds(world.nav, cell)) continue
    world.nav.blocked[cellIndex(world.nav, cell)] = 1
  }

  const ok =
    pathExists(world, warehouse.position, forest.position) &&
    pathExists(world, warehouse.position, locker.position)

  world.nav.blocked = previous
  world.nav.version = previousVersion
  return !ok
}
