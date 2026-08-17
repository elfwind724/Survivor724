import { describe, expect, it } from 'vitest'
import { demolishAt, placeBlueprint, setGateOpen } from '@/base/construction'
import { findPath, pathExists } from '@/navigation/AStar'
import { isBlocked, rebuildNav, worldToCell } from '@/navigation/NavGrid'
import { BASE, createInitialWorld } from '@/simulation/WorldState'
import { vec3 } from '@/simulation/types'

function forestPosition(world: ReturnType<typeof createInitialWorld>) {
  const forest = world.nodes.find((node) => node.id === 'node-forest')
  if (!forest) throw new Error('missing forest')
  return forest.position
}

describe('navigation', () => {
  it('paths around complete walls instead of walking through them', () => {
    const world = createInitialWorld()
    const from = vec3(-10, 0, -8)
    const forest = world.nodes.find((node) => node.id === 'node-forest')
    if (!forest) throw new Error('missing forest')
    const to = forest.position
    const path = findPath(world, from, to)
    expect(path).not.toBeNull()
    const wallHit = path?.some((point) => {
      const cell = worldToCell(world.nav, point)
      return world.structures.some(
        (structure) =>
          structure.stage === 'complete' &&
          structure.kind === 'wall' &&
          structure.cells.some((entry) => entry.x === cell.x && entry.z === cell.z),
      )
    })
    expect(wallHit).toBe(false)
  })

  it('treats a closed gate as blocked and an open gate as walkable', () => {
    const world = createInitialWorld()
    const gate = world.structures.find((structure) => structure.kind === 'gate')
    if (!gate) throw new Error('missing gate')
    const cell = gate.cells[0]
    if (!cell) throw new Error('missing gate cell')

    expect(isBlocked(world.nav, cell)).toBe(false)
    setGateOpen(world, gate.id, false)
    rebuildNav(world)
    expect(isBlocked(world.nav, cell)).toBe(true)
    setGateOpen(world, gate.id, true)
    rebuildNav(world)
    expect(isBlocked(world.nav, cell)).toBe(false)
  })

  it('rejects a wall blueprint that would seal the only remaining exit', () => {
    const world = createInitialWorld()
    for (const gate of world.structures.filter((structure) => structure.kind === 'gate')) {
      setGateOpen(world, gate.id, false)
    }
    const holePoint = vec3(BASE.east, 0, 0)
    expect(demolishAt(world, holePoint, false)).toBeTruthy()
    rebuildNav(world)

    const hole = worldToCell(world.nav, holePoint)
    const result = placeBlueprint(world, 'wall', hole.x, hole.z)
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('blocks_exit')
    expect(pathExists(world, vec3(0, 0, 0), forestPosition(world))).toBe(true)
  })
})
