import { decorationNear, persistDecorations, placeDecoration, removeDecoration } from '@/base/decorations'
import { assetById } from '@/data/assetIndex'
import {
  creativeFootprint,
  demolishDuration,
  facilityDefinition,
  facilityFromAsset,
  footprintCells,
  wallLineDuration,
} from '@/data/facilities'
import { addItem, countItem, createInventory, inventoryOf, removeItem } from '@/inventory/Inventory'
import { findContainer } from '@/simulation/EntityRegistry'
import type { GridCell, StructureState, Vec3, WildlifeState, WorldState } from '@/simulation/types'
import { spawnCreativeAnimal } from '@/world/Wildlife'
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

export function markDemolish(world: WorldState, structure: StructureState): 'marked' | 'cancelled' {
  if (structure.stage === 'demolishing') {
    structure.stage = 'complete'
    structure.buildElapsed = structure.buildDuration
    world.jobs = world.jobs.filter((job) => !(job.definitionId === 'demolish' && job.targetId === structure.id))
    for (const survivor of world.survivors) {
      if (survivor.currentJobId?.startsWith('demolish-') && survivor.currentJobId.includes(structure.id)) {
        survivor.currentJobId = null
        survivor.workerState = 'RestOrNextJob'
      }
    }
    markNavDirty(world)
    return 'cancelled'
  }
  if (structure.stage !== 'complete') {
    demolishStructure(world, structure.id, true)
    return 'marked'
  }
  structure.stage = 'demolishing'
  structure.buildElapsed = 0
  structure.buildDuration = demolishDuration(structure.cells.length)
  markNavDirty(world)
  return 'marked'
}

export function markDemolishAt(
  world: WorldState,
  point: Vec3,
): { result: 'marked' | 'cancelled'; structure: StructureState } | null {
  const target = demolishTarget(world, point)
  if (!target) return null
  const structure =
    target.structure.kind === 'wall' &&
    target.structure.stage === 'complete' &&
    target.structure.cells.length > 1 &&
    target.cells[0]
      ? extractWallCell(world, target.structure, target.cells[0])
      : target.structure
  if (!structure) return null
  return { result: markDemolish(world, structure), structure }
}

export function demolishTarget(
  world: WorldState,
  point: Vec3,
): { structure: StructureState; cells: GridCell[] } | undefined {
  const structure = structureNear(world, point, 4.5)
  if (!structure) return undefined
  if (structure.kind === 'wall' && structure.cells.length > 1 && structure.stage === 'complete') {
    const cell = nearestStructureCell(world, structure, point)
    return cell ? { structure, cells: [cell] } : { structure, cells: structure.cells }
  }
  return { structure, cells: structure.cells }
}

export function finishDemolish(world: WorldState, structure: StructureState): void {
  demolishStructure(world, structure.id, true)
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
    if (refund && (structure.stage === 'complete' || structure.stage === 'demolishing')) {
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
  persistCreativeStructures(world)
  return true
}

export function structureAt(world: WorldState, point: Vec3): StructureState | undefined {
  const cell = worldToCell(world.nav, point)
  return world.structures.find((structure) =>
    structure.cells.some((entry) => entry.x === cell.x && entry.z === cell.z),
  )
}

export function structureNear(world: WorldState, point: Vec3, radius = 3.8): StructureState | undefined {
  let best: StructureState | undefined
  let bestScore = radius
  for (const structure of world.structures) {
    const dist = distanceToStructure(world, structure, point)
    const score = dist + (structure.kind === 'building' ? 0 : 1.25)
    if (score < bestScore) {
      best = structure
      bestScore = score
    }
  }
  return best
}

function visualPad(structure: StructureState): number {
  if (structure.kind !== 'building') return 0
  if (structure.definitionId === 'watchtower') return 0.8
  if (structure.definitionId === 'bonfire' || structure.definitionId === 'brazier') return 0.4
  return 2.6
}

function distanceToStructure(world: WorldState, structure: StructureState, point: Vec3): number {
  if (structure.cells.length === 0) return Number.POSITIVE_INFINITY
  const half = world.nav.cellSize * 0.5
  const pad = visualPad(structure)
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY
  for (const cell of structure.cells) {
    const center = cellCenter(world.nav, cell)
    minX = Math.min(minX, center.x - half)
    maxX = Math.max(maxX, center.x + half)
    minZ = Math.min(minZ, center.z - half)
    maxZ = Math.max(maxZ, center.z + half)
  }
  const left = minX - pad
  const right = maxX + pad
  const south = minZ - pad
  const north = maxZ + pad
  const dx = point.x < left ? left - point.x : point.x > right ? point.x - right : 0
  const dz = point.z < south ? south - point.z : point.z > north ? point.z - north : 0
  return Math.hypot(dx, dz)
}

function nearestStructureCell(world: WorldState, structure: StructureState, point: Vec3): GridCell | undefined {
  let best: GridCell | undefined
  let bestDistance = Number.POSITIVE_INFINITY
  for (const cell of structure.cells) {
    const center = cellCenter(world.nav, cell)
    const distance = Math.hypot(center.x - point.x, center.z - point.z)
    if (distance < bestDistance) {
      best = cell
      bestDistance = distance
    }
  }
  return best
}

function extractWallCell(world: WorldState, structure: StructureState, cell: GridCell): StructureState | null {
  if (structure.kind !== 'wall' || structure.cells.length <= 1) return structure
  structure.cells = structure.cells.filter((entry) => entry.x !== cell.x || entry.z !== cell.z)
  if (structure.required[0] && structure.required[0].itemId === 'wood') {
    structure.required[0].count = Math.max(1, structure.cells.length)
  }
  const id = `structure-${world.structures.length + 1}-wall`
  const inventory = createInventory(`inv-${id}`, 40)
  world.inventories[inventory.id] = inventory
  const extracted: StructureState = {
    id,
    definitionId: 'wall',
    kind: 'wall',
    cells: [cell],
    stage: 'complete',
    inventoryId: inventory.id,
    required: [{ itemId: 'wood', count: 1 }],
    buildElapsed: structure.buildDuration,
    buildDuration: structure.buildDuration,
    open: false,
    hp: structure.hp,
    maxHp: structure.maxHp,
    level: structure.level || 1,
    upgrading: false,
    upgradeRequired: [],
    upgradeElapsed: 0,
    upgradeDuration: 0,
  }
  world.structures.push(extracted)
  markNavDirty(world)
  return extracted
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
    level: 1,
    upgrading: false,
    upgradeRequired: [],
    upgradeElapsed: 0,
    upgradeDuration: 0,
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

export interface CompleteExtras {
  visualAssetId?: string
  yaw?: number
  width?: number
  depth?: number
  placedBy?: 'creative'
}

export function createCompleteStructure(
  world: WorldState,
  definitionId: string,
  originX: number,
  originZ: number,
  open = true,
  extras?: CompleteExtras,
): StructureState {
  const definition = facilityDefinition(definitionId)
  if (!definition) throw new Error(`Unknown facility ${definitionId}`)
  const id = `structure-${world.structures.length + 1}-${definitionId}`
  const inventory = createInventory(`inv-${id}`, 40)
  world.inventories[inventory.id] = inventory
  const width = extras?.width ?? definition.width
  const depth = extras?.depth ?? definition.depth
  const structure: StructureState = {
    id,
    definitionId,
    kind: definition.kind,
    cells: footprintCells({ ...definition, width, depth }, originX, originZ),
    stage: 'complete',
    inventoryId: inventory.id,
    required: definition.required.map((item) => ({ ...item })),
    buildElapsed: definition.buildDuration,
    buildDuration: definition.buildDuration,
    open,
    hp: structureHp(definition.kind),
    maxHp: structureHp(definition.kind),
    level: 1,
    upgrading: false,
    upgradeRequired: [],
    upgradeElapsed: 0,
    upgradeDuration: 0,
  }
  if (extras?.visualAssetId) structure.visualAssetId = extras.visualAssetId
  if (extras?.yaw !== undefined) structure.yaw = extras.yaw
  if (extras?.placedBy) structure.placedBy = extras.placedBy
  world.structures.push(structure)
  markNavDirty(world)
  return structure
}

export function previewCreativePlacement(
  world: WorldState,
  assetId: string,
  worldX: number,
  worldZ: number,
): { cells: GridCell[]; valid: boolean; reason: string | null; definitionId: string } | null {
  const definitionId = facilityFromAsset(assetId)
  if (!definitionId) return null
  const definition = facilityDefinition(definitionId)
  if (!definition) return null
  const size = creativeFootprint(assetId, definitionId)
  const origin = worldToCell(world.nav, { x: worldX, y: 0, z: worldZ })
  const originX = origin.x - Math.floor(size.width / 2)
  const originZ = origin.z - Math.floor(size.depth / 2)
  const preview = evaluateCells(
    world,
    footprintCells({ ...definition, width: size.width, depth: size.depth }, originX, originZ),
    definition.kind === 'gate',
  )
  return { ...preview, definitionId }
}

export function placeCreativeAsset(
  world: WorldState,
  assetId: string,
  worldX: number,
  worldZ: number,
  yaw = 0,
  scale?: number,
): { kind: 'structure'; structure: StructureState } | { kind: 'decoration'; decoration: NonNullable<ReturnType<typeof placeDecoration>> } | { kind: 'wildlife'; animal: WildlifeState } | null {
  const animal = spawnCreativeAnimal(world, assetId, worldX, worldZ, yaw)
  if (animal) return { kind: 'wildlife', animal }
  const preview = previewCreativePlacement(world, assetId, worldX, worldZ)
  if (!preview) {
    const decoration = placeDecoration(world, assetId, worldX, worldZ, yaw, scale)
    return decoration ? { kind: 'decoration', decoration } : null
  }
  if (!preview.valid || preview.cells.length === 0) return null
  const first = preview.cells[0]
  if (!first) return null
  const size = creativeFootprint(assetId, preview.definitionId)
  const structure = createCompleteStructure(world, preview.definitionId, first.x, first.z, true, {
    visualAssetId: assetId,
    yaw,
    width: size.width,
    depth: size.depth,
    placedBy: 'creative',
  })
  persistCreativeStructures(world)
  return { kind: 'structure', structure }
}

const CREATIVE_STORAGE_KEY = 'dawn-bastion-creative-structures'

interface SavedCreativeStructure {
  definitionId: string
  visualAssetId: string
  originX: number
  originZ: number
  worldX?: number
  worldZ?: number
  yaw: number
  width: number
  depth: number
}

export function persistCreativeStructures(world: WorldState): void {
  if (typeof localStorage === 'undefined') return
  const saved: SavedCreativeStructure[] = world.structures
    .filter((entry) => entry.placedBy === 'creative' && entry.visualAssetId && entry.cells[0])
    .map((entry) => {
      const xs = entry.cells.map((cell) => cell.x)
      const zs = entry.cells.map((cell) => cell.z)
      const originX = Math.min(...xs)
      const originZ = Math.min(...zs)
      const at = cellCenter(world.nav, { x: originX, z: originZ })
      return {
        definitionId: entry.definitionId,
        visualAssetId: entry.visualAssetId ?? '',
        originX,
        originZ,
        worldX: at.x,
        worldZ: at.z,
        yaw: entry.yaw ?? 0,
        width: Math.max(...xs) - Math.min(...xs) + 1,
        depth: Math.max(...zs) - Math.min(...zs) + 1,
      }
    })
  localStorage.setItem(CREATIVE_STORAGE_KEY, JSON.stringify(saved))
}

export function loadCreativeStructures(world: WorldState): void {
  if (typeof localStorage === 'undefined') return
  try {
    const raw = localStorage.getItem(CREATIVE_STORAGE_KEY)
    if (!raw) return
    const saved = JSON.parse(raw) as SavedCreativeStructure[]
    if (!Array.isArray(saved)) return
    for (const entry of saved) {
      if (!facilityDefinition(entry.definitionId) || !assetById(entry.visualAssetId)) continue
      if (!Number.isFinite(entry.originX) || !Number.isFinite(entry.originZ)) continue
      const definition = facilityDefinition(entry.definitionId)
      if (!definition) continue
      const width = Math.max(1, entry.width || definition.width)
      const depth = Math.max(1, entry.depth || definition.depth)
      const origin = creativeOriginCell(world, entry)
      const cells = footprintCells({ ...definition, width, depth }, origin.x, origin.z)
      if (!evaluateCells(world, cells, definition.kind === 'gate').valid) continue
      createCompleteStructure(world, entry.definitionId, origin.x, origin.z, true, {
        visualAssetId: entry.visualAssetId,
        yaw: entry.yaw,
        width,
        depth,
        placedBy: 'creative',
      })
    }
  } catch {
    return
  }
}

function creativeOriginCell(world: WorldState, entry: SavedCreativeStructure): GridCell {
  if (typeof entry.worldX === 'number' && typeof entry.worldZ === 'number') {
    return worldToCell(world.nav, { x: entry.worldX, y: 0, z: entry.worldZ })
  }
  return worldToCell(world.nav, { x: -80 + entry.originX, y: 0, z: -80 + entry.originZ })
}

export function promoteBuildingDecorations(world: WorldState): number {
  let count = 0
  const keep = []
  for (const decoration of world.decorations) {
    if (!facilityFromAsset(decoration.assetId)) {
      keep.push(decoration)
      continue
    }
    const placed = placeCreativeAsset(world, decoration.assetId, decoration.x, decoration.z, decoration.yaw, decoration.scale)
    if (placed?.kind === 'structure') count += 1
    else keep.push(decoration)
  }
  if (count > 0) {
    world.decorations = keep
    persistDecorations(world)
    persistCreativeStructures(world)
  }
  return count
}

export function structureHp(kind: StructureState['kind']): number {
  if (kind === 'gate') return 140
  if (kind === 'building') return 180
  return 90
}

export const REPAIR_HP = 30

export function needsRepair(structure: StructureState): boolean {
  return structure.stage === 'complete' && structure.hp < structure.maxHp
}

export function repairStructure(world: WorldState, structure: StructureState, amount: number): boolean {
  if (!needsRepair(structure)) return false
  structure.hp = Math.min(structure.maxHp, structure.hp + amount)
  return true
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
