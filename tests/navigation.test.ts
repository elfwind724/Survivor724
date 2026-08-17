import { describe, expect, it } from 'vitest'
import { createCompleteStructure, placeBlueprint, setGateOpen } from '@/base/construction'
import { findPath, pathExists } from '@/navigation/AStar'
import { isBlocked, rebuildNav, worldToCell } from '@/navigation/NavGrid'
import { createInitialWorld } from '@/simulation/WorldState'
import { vec3 } from '@/simulation/types'

describe('navigation', () => {
  it('paths around complete walls instead of walking through them', () => {
    const world = createInitialWorld()
    const from = vec3(0, 0, -6)
    const to = vec3(36, 0, -8)
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
    const gate = world.structures.find((structure) => structure.kind === 'gate')
    if (!gate) throw new Error('missing gate')
    setGateOpen(world, gate.id, false)
    rebuildNav(world)

    const west = worldToCell(world.nav, vec3(-8, 0, -9))
    const gap = worldToCell(world.nav, vec3(7, 0, -9))
    for (let x = west.x; x < gap.x; x += 1) {
      createCompleteStructure(world, 'wall', x, west.z)
    }
    rebuildNav(world)

    const result = placeBlueprint(world, 'wall', gap.x, west.z)
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('blocks_exit')
    expect(pathExists(world, vec3(0, 0, -6), vec3(36, 0, -8))).toBe(true)
  })
})
