import { decorationNear, removeDecoration } from '@/base/decorations'
import { facilityDefinition, footprintCells, wallLineDuration } from '@/data/facilities'
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

export function nearestGate(world: WorldState, position: Vec3, radius = 3.4): StructureState | undefined {
  let best: StructureState | undefined
  let bestDistance = radius
  for (const structure of world.structures) {
    if (structure.kind !== 'gate' || structure.stage !== 'complete') continue
    const spot = gateCenter(world, structure)
    const distance = Math.hypot(spot.x - position.x, spot.z - position.z)
    if (distance < bestDistance) {
      best = structure
      bestDistance = distance
    }
  }
  return best
}

export function interactGate(world: WorldState, position: Vec3): StructureState | null {
  const gate = nearestGate(world, position)
  if (!gate) return null
  gate.open = !gate.open
  markNavDirty(world)
  return gate
}

export function demolishAt(world: WorldState, point: Vec3, refund = true): { removed: 'cell' | 'structure'; structureId: string } | null {
  const cell = worldToCell(world.nav, point)
  const structure = world.structures.find((entry) =>
    entry.cells.some((entryCell) => entryCell.x === cell.x && entryCell.z === cell.z),
  )
  if (!structure) return null
  if (structure.kind === 'wall' && structure.cells.length > 1) {
    structure.cells = structure.cells.filter((entry) => entry.x !== cell.x || entry.z !== cell.z)
    if (structure.required[0] && structure.required[0].itemId === 'wood') {
      structure.required[0].count = Math.max(1, structure.cells.length)
    }
    const warehouse = findContainer(world, 'warehouse')
    if (refund && warehouse && structure.stage === 'complete') {
      addItem(inventoryOf(world.inventories, warehouse.inventoryId), 'wood', 1)
    }
    const extra = decorationNear(world, cellCenter(world.nav, cell).x, cellCenter(world.nav, cell).z, 1.2)
    if (extra) removeDecoration(world, extra.id)
    markNavDirty(world)
    return { removed: 'cell', structureId: structure.id }
  }
  demolishStructure(world, structure.id, refund)
  return { removed: 'structure', structureId: structure.id }
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
  for (const cell of structure.cells) {
    const center = cellCenter(world.nav, cell)
    const extra = decorationNear(world, center.x, center.z, 1.2)
    if (extra) removeDecoration(world, extra.id)
  }
  markNavDirty(world)
  return true
}

export function structureAt(world: WorldState, point: Vec3): StructureState | undefined {
  const cell = worldToCell(world.nav, point)
  return world.structures.find((structure) =>
    structure.cells.some((entry) => entry.x === cell.x && entry.z === cell.z),
  )
}

/** Axis-aligned L: walk X first, then Z. Diagonal walls leave 4-connected gaps. */
export function lineCells(start: GridCell, end: GridCell): GridCell[] {
  const cells: GridCell[] = [{ x: start.x, z: start.z }]
  const stepX = Math.sign(end.x - start.x)
  const stepZ = Math.sign(end.z - start.z)
  let x = start.x
  let z = start.z
  while (x !== end.x) {
    x += stepX
    cells.push({ x, z })
  }
  while (z !== end.z) {
    z += stepZ
    cells.push({ x, z })
  }
  return cells
}

export function previewPlacement(
  world: WorldState,
  definitionId: string,
  originX: number,
  originZ: number,
): { cells: GridCell[]; valid: boolean; reason: string | null } {
  const definition = facilityDefinition(definitionId)
  if (!definition) return { cells: [], valid: false, reason: 'unknown_facility' }
  return evaluateCells(world, footprintCells(definition, originX, originZ), definition.kind === 'gate')
}

export function previewWallLine(
  world: WorldState,
  start: GridCell,
  end: GridCell,
): { cells: GridCell[]; valid: boolean; reason: string | null } {
  const raw = lineCells(start, end)
  if (raw.some((cell) => !inBounds(world.nav, cell))) {
    return { cells: raw, valid: false, reason: 'out_of_bounds' }
  }
  const cells = raw.filter((cell) => !cellOccupied(world, cell))
  if (cells.length === 0) {
    return { cells: raw, valid: false, reason: 'overlap' }
  }
  if (wouldBlockExit(world, cells, false)) {
    return { cells, valid: false, reason: 'blocks_exit' }
  }
  return { cells, valid: true, reason: null }
}

export function placeWallLine(world: WorldState, start: GridCell, end: GridCell): PlaceResult {
  const preview = previewWallLine(world, start, end)
  if (!preview.valid) return { ok: false, reason: preview.reason, structure: null }
  const cells = preview.cells
  const wood = Math.max(1, cells.length)
  return commitBlueprint(world, 'wall', cells, [{ itemId: 'wood', count: wood }], wallLineDuration(cells.length))
}

export function placeBlueprint(world: WorldState, definitionId: string, originX: number, originZ: number): PlaceResult {
  const definition = facilityDefinition(definitionId)
  if (!definition) return { ok: false, reason: 'unknown_facility', structure: null }

  const preview = previewPlacement(world, definitionId, originX, originZ)
  if (!preview.valid) return { ok: false, reason: preview.reason, structure: null }
  return commitBlueprint(
    world,
    definitionId,
    preview.cells,
    definition.required.map((item) => ({ ...item })),
    definition.buildDuration,
  )
}

function commitBlueprint(
  world: WorldState,
  definitionId: string,
  cells: GridCell[],
  required: StructureState['required'],
  buildDuration: number,
): PlaceResult {
  const definition = facilityDefinition(definitionId)
  if (!definition) return { ok: false, reason: 'unknown_facility', structure: null }
  const id = `structure-${world.structures.length + 1}-${definitionId}`
  const inventory = createInventory(`inv-${id}`, 80)
  world.inventories[inventory.id] = inventory
  const structure: StructureState = {
    id,
    definitionId,
    kind: definition.kind,
    cells,
    stage: 'blueprint',
    inventoryId: inventory.id,
    required,
    buildElapsed: 0,
    buildDuration,
    open: definition.kind === 'gate',
    hp: structureHp(definition.kind),
    maxHp: structureHp(definition.kind),
  }
  world.structures.push(structure)
  return { ok: true, reason: null, structure }
}

function evaluateCells(
  world: WorldState,
  cells: GridCell[],
  extraIsOpenGate: boolean,
): { cells: GridCell[]; valid: boolean; reason: string | null } {
  if (cells.some((cell) => !inBounds(world.nav, cell))) {
    return { cells, valid: false, reason: 'out_of_bounds' }
  }
  if (cellsOverlap(world, cells)) {
    return { cells, valid: false, reason: 'overlap' }
  }
  if (wouldBlockExit(world, cells, extraIsOpenGate)) {
    return { cells, valid: false, reason: 'blocks_exit' }
  }
  return { cells, valid: true, reason: null }
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

function gateCenter(world: WorldState, structure: StructureState): Vec3 {
  if (structure.cells.length === 0) return { x: 0, y: 0, z: 0 }
  let x = 0
  let z = 0
  for (const cell of structure.cells) {
    const center = cellCenter(world.nav, cell)
    x += center.x
    z += center.z
  }
  return { x: x / structure.cells.length, y: 0, z: z / structure.cells.length }
}

function cellOccupied(world: WorldState, cell: GridCell): boolean {
  return world.structures.some((structure) =>
    structure.cells.some((entry) => entry.x === cell.x && entry.z === cell.z),
  )
}

function cellsOverlap(world: WorldState, cells: GridCell[]): boolean {
  return cells.some((cell) => cellOccupied(world, cell))
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
