import { describe, expect, it } from 'vitest'
import { markDemolish, placeCreativeAsset, promoteBuildingDecorations } from '@/base/construction'
import { decorationNear, placeDecoration, removeDecoration } from '@/base/decorations'
import { facilityFromAsset, structureLabel } from '@/data/facilities'
import { interiorProps } from '@/base/FacilityLife'
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

  it('does not place character models as decorations', () => {
    const world = createInitialWorld()
    expect(placeDecoration(world, 'people/man', 0, 0)).toBeNull()
    expect(world.decorations).toHaveLength(0)
  })

  it('turns a creative house into a real facility with interiors', () => {
    const world = createInitialWorld()
    const placed = placeCreativeAsset(world, 'fort/house-2', 0, 10, 0.4)
    expect(placed?.kind).toBe('structure')
    if (placed?.kind !== 'structure') throw new Error('expected structure')
    expect(placed.structure.definitionId).toBe('shelter')
    expect(placed.structure.stage).toBe('complete')
    expect(placed.structure.visualAssetId).toBe('fort/house-2')
    expect(placed.structure.placedBy).toBe('creative')
    expect(world.decorations).toHaveLength(0)
    expect(interiorProps(world, placed.structure).length).toBeGreaterThan(0)
    expect(structureLabel(placed.structure)).toBe('房屋')
  })

  it('spawns a living animal from the creative animal tab instead of a statue', () => {
    const world = createInitialWorld()
    const placed = placeCreativeAsset(world, 'animals/deer', 50, -20, 0.4)
    expect(placed?.kind).toBe('wildlife')
    if (placed?.kind !== 'wildlife') throw new Error('expected wildlife')
    expect(placed.animal.alive).toBe(true)
    expect(placed.animal.kind).toBe('deer')
    expect(placed.animal.mood).toBe('wander')
    expect(world.decorations.some((entry) => entry.assetId === 'animals/deer')).toBe(false)
    const house = placeCreativeAsset(world, 'fort/house-2', 0, 10)
    expect(house?.kind).toBe('structure')
    if (house?.kind !== 'structure') throw new Error('expected structure')
    expect(house.structure.stage).toBe('complete')
  })

  it('keeps trees as decorations and maps known buildings to facilities', () => {
    const world = createInitialWorld()
    const tree = placeCreativeAsset(world, 'nature/pine', 12, -8)
    expect(tree?.kind).toBe('decoration')
    expect(facilityFromAsset('fort/house')).toBe('kitchen')
    expect(facilityFromAsset('fort/hut')).toBe('quarters')
    expect(facilityFromAsset('fort/wooden-wall')).toBe('wall')
    expect(facilityFromAsset('nature/pine')).toBeUndefined()
    expect(facilityFromAsset('fort/mountain')).toBeUndefined()
  })

  it('promotes an old decorative house into a demolishable facility', () => {
    const world = createInitialWorld()
    const leftover = placeDecoration(world, 'fort/house-3', 2, 12)
    expect(leftover).not.toBeNull()
    expect(promoteBuildingDecorations(world)).toBe(1)
    expect(world.decorations.some((entry) => entry.assetId === 'fort/house-3')).toBe(false)
    const house = world.structures.find((entry) => entry.visualAssetId === 'fort/house-3')
    expect(house?.stage).toBe('complete')
    expect(house?.definitionId).toBe('shelter')
  })

  it('marks a creative house for demolish like a built facility', () => {
    const world = createInitialWorld()
    const placed = placeCreativeAsset(world, 'fort/house-2', 0, 10)
    if (placed?.kind !== 'structure') throw new Error('expected structure')
    expect(markDemolish(world, placed.structure)).toBe('marked')
    expect(placed.structure.stage).toBe('demolishing')
    expect(placed.structure.buildDuration).toBeGreaterThan(2)
  })
})
