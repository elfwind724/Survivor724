import { facilityDefinition } from '@/data/facilities'
import type { GridCell, NavGridState, StructureState, Vec3, WorldState } from '@/simulation/types'

export const NAV_CELL = 1
export const NAV_SIZE = 160
export const NAV_ORIGIN = -80

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
