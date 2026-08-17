import { describe, expect, it } from 'vitest'
import { decorationNear, placeDecoration, removeDecoration } from '@/base/decorations'
import { createInitialWorld } from '@/simulation/WorldState'

describe('map decorations', () => {
  it('starts with an empty player-placed decoration list', () => {
    const world = createInitialWorld()
    expect(world.decorations).toEqual([])
  })

  it('places and removes a named asset on the ground grid', () => {
    const world = createInitialWorld()
    const placed = placeDecoration(world, 'nature/pine', 12.2, -7.6, 0.5)
    expect(placed).not.toBeNull()
    expect(placed?.x).toBe(12)
    expect(placed?.z).toBe(-7.5)
    expect(world.decorations).toHaveLength(1)
    expect(decorationNear(world, 12, -7.5)?.id).toBe(placed?.id)
    expect(removeDecoration(world, placed?.id ?? '')).toBe(true)
    expect(world.decorations).toHaveLength(0)
  })

  it('rejects unknown asset names', () => {
    const world = createInitialWorld()
    expect(placeDecoration(world, 'missing/nope', 0, 0)).toBeNull()
  })
})
