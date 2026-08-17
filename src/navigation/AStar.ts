import { cloneVec3, distanceXZ, type GridCell, type Vec3, type WorldState } from '@/simulation/types'
import { cellCenter, cellIndex, inBounds, isBlocked, worldToCell } from './NavGrid'

interface Node {
  x: number
  z: number
  g: number
  f: number
  parent: number
}

const OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

export function findPath(world: WorldState, from: Vec3, to: Vec3): Vec3[] | null {
  if (distanceXZ(from, to) < 0.2) return [cloneVec3(to)]

  const nav = world.nav
  const start = worldToCell(nav, from)
  let goal = worldToCell(nav, to)
  if (isBlocked(nav, goal)) {
    const nearby = nearestWalkable(world, goal)
    if (!nearby) return null
    goal = nearby
  }

  const startWalkable = inBounds(nav, start)
  if (!startWalkable) return null

  const startIndex = cellIndex(nav, start)
  const goalIndex = cellIndex(nav, goal)
  if (startIndex === goalIndex) return [cloneVec3(to)]

  const nodes = new Map<number, Node>()
  const open: number[] = [startIndex]
  nodes.set(startIndex, {
    x: start.x,
    z: start.z,
    g: 0,
    f: manhattan(start, goal),
    parent: -1,
  })

  while (open.length > 0) {
    let bestAt = 0
    let best = open[0]
    if (best === undefined) break
    for (let i = 1; i < open.length; i += 1) {
      const candidate = open[i]
      if (candidate === undefined) continue
      const candidateNode = nodes.get(candidate)
      const bestNode = nodes.get(best)
      if (!candidateNode || !bestNode) continue
      if (candidateNode.f < bestNode.f) {
        best = candidate
        bestAt = i
      }
    }
    open.splice(bestAt, 1)
    if (best === goalIndex) return buildWorldPath(world, nodes, best, to)

    const current = nodes.get(best)
    if (!current) continue
    for (const [dx, dz] of OFFSETS) {
      const nextCell = { x: current.x + dx, z: current.z + dz }
      if (!inBounds(nav, nextCell)) continue
      const nextIndex = cellIndex(nav, nextCell)
      const blocked = isBlocked(nav, nextCell) && nextIndex !== startIndex
      if (blocked) continue
      const g = current.g + 1
      const existing = nodes.get(nextIndex)
      if (existing && g >= existing.g) continue
      nodes.set(nextIndex, {
        x: nextCell.x,
        z: nextCell.z,
        g,
        f: g + manhattan(nextCell, goal),
        parent: best,
      })
      if (!open.includes(nextIndex)) open.push(nextIndex)
    }
  }

  return null
}

export function pathExists(world: WorldState, from: Vec3, to: Vec3): boolean {
  return findPath(world, from, to) !== null
}

function manhattan(a: GridCell, b: GridCell): number {
  return Math.abs(a.x - b.x) + Math.abs(a.z - b.z)
}

function nearestWalkable(world: WorldState, cell: GridCell): GridCell | null {
  const nav = world.nav
  for (let radius = 1; radius <= 4; radius += 1) {
    for (let x = -radius; x <= radius; x += 1) {
      for (let z = -radius; z <= radius; z += 1) {
        const candidate = { x: cell.x + x, z: cell.z + z }
        if (!isBlocked(nav, candidate)) return candidate
      }
    }
  }
  return null
}

function buildWorldPath(world: WorldState, nodes: Map<number, Node>, end: number, target: Vec3): Vec3[] {
  const cells: GridCell[] = []
  let cursor: number | undefined = end
  while (cursor !== undefined && cursor >= 0) {
    const node = nodes.get(cursor)
    if (!node) break
    cells.push({ x: node.x, z: node.z })
    cursor = node.parent
  }
  cells.reverse()
  const path = cells.map((cell) => cellCenter(world.nav, cell))
  path.push(cloneVec3(target))
  return path
}
