import { facilityDefinition } from '@/data/facilities'
import type { GridCell, NavGridState, StructureState, Vec3, WorldState } from '@/simulation/types'

export const NAV_CELL = 1
export const NAV_SIZE = 360
export const NAV_ORIGIN = -180
export const NAV_EXTENT = NAV_ORIGIN + NAV_SIZE

export function createNavGrid(): NavGridState {
  return {
    originX: NAV_ORIGIN,
    originZ: NAV_ORIGIN,
    cellSize: NAV_CELL,
    width: NAV_SIZE,
    height: NAV_SIZE,
    blocked: new Array<number>(NAV_SIZE * NAV_SIZE).fill(0),
    version: 1,
  }
}

export function worldToCell(nav: NavGridState, point: Vec3): GridCell {
  return {
    x: Math.floor((point.x - nav.originX) / nav.cellSize),
    z: Math.floor((point.z - nav.originZ) / nav.cellSize),
  }
}

export function cellCenter(nav: NavGridState, cell: GridCell): Vec3 {
  return {
    x: nav.originX + (cell.x + 0.5) * nav.cellSize,
    y: 0,
    z: nav.originZ + (cell.z + 0.5) * nav.cellSize,
  }
}

export function inBounds(nav: NavGridState, cell: GridCell): boolean {
  return cell.x >= 0 && cell.z >= 0 && cell.x < nav.width && cell.z < nav.height
}

export function cellIndex(nav: NavGridState, cell: GridCell): number {
  return cell.z * nav.width + cell.x
}

export function isBlocked(nav: NavGridState, cell: GridCell): boolean {
  if (!inBounds(nav, cell)) return true
  return nav.blocked[cellIndex(nav, cell)] === 1
}

export function structureBlocksNav(structure: StructureState): boolean {
  if (structure.stage !== 'complete') return false
  if (structure.kind === 'gate') return !structure.open
  const definition = facilityDefinition(structure.definitionId)
  if (definition && !definition.blocksNav) return false
  return true
}

export function rebuildNav(world: WorldState): void {
  const nav = world.nav
  nav.blocked.fill(0)
  for (const structure of world.structures) {
    if (!structureBlocksNav(structure)) continue
    for (const cell of structure.cells) {
      if (!inBounds(nav, cell)) continue
      nav.blocked[cellIndex(nav, cell)] = 1
    }
  }
  nav.version += 1
  world.navDirty = false
}

export function markNavDirty(world: WorldState): void {
  world.navDirty = true
}

export function remapNav(world: WorldState): boolean {
  const nav = world.nav
  if (
    nav
    && nav.width === NAV_SIZE
    && nav.height === NAV_SIZE
    && nav.originX === NAV_ORIGIN
    && nav.originZ === NAV_ORIGIN
    && nav.blocked.length === NAV_SIZE * NAV_SIZE
  ) {
    return false
  }
  const cellSize = nav?.cellSize || NAV_CELL
  const oldOriginX = typeof nav?.originX === 'number' ? nav.originX : -80
  const oldOriginZ = typeof nav?.originZ === 'number' ? nav.originZ : -80
  const shiftX = Math.round((oldOriginX - NAV_ORIGIN) / cellSize)
  const shiftZ = Math.round((oldOriginZ - NAV_ORIGIN) / cellSize)
  if (shiftX !== 0 || shiftZ !== 0) {
    for (const structure of world.structures) {
      for (const cell of structure.cells) {
        cell.x += shiftX
        cell.z += shiftZ
      }
    }
  }
  world.nav = createNavGrid()
  world.navDirty = true
  return true
}
