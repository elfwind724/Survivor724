import { describe, expect, it } from 'vitest'
import { markDemolish, placeCreativeAsset, promoteBuildingDecorations, removeCreativeAt, sitePosition } from '@/base/construction'
import { decorationNear, placeDecoration, removeDecoration } from '@/base/decorations'
import { facilityFromAsset, structureLabel } from '@/data/facilities'
import { interiorProps } from '@/base/FacilityLife'
import { seedOutdoorScenery } from '@/data/outdoorScenery'
import { createInitialWorld } from '@/simulation/WorldState'

describe('map decorations', () => {
  it('plants groves and a mountain ring instead of tiled biome rectangles', () => {
    const world = createInitialWorld()
    expect(world.scenery.length).toBeGreaterThan(160)
    expect(world.scenery.every((pose) => Math.abs(pose.x) > 30 || Math.abs(pose.z) > 26)).toBe(true)
    expect(world.scenery.some((pose) => Math.hypot(pose.x, pose.z) > 140)).toBe(true)
    const forest = world.scenery.filter((pose) => Math.hypot(pose.x - 72, pose.z + 28) < 26)
    expect(forest.length).toBeGreaterThan(8)
    const hole = world.scenery.filter((pose) => Math.hypot(pose.x - 72, pose.z + 28) < 5)
    expect(hole.length).toBeLessThan(forest.length)
    expect(seedOutdoorScenery()).toEqual(seedOutdoorScenery())
  })

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
    const scaled = placeDecoration(world, 'nature/pine', 4, 4, 0.2, 3.5)
    expect(scaled?.scale).toBe(3.5)
    expect(scaled?.yaw).toBe(0.2)
    expect(world.decorations).toHaveLength(2)
    expect(decorationNear(world, 12, -7.5)?.id).toBe(placed?.id)
    expect(removeDecoration(world, placed?.id ?? '')).toBe(true)
    expect(removeDecoration(world, scaled?.id ?? '')).toBe(true)
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

  it('instantly deletes a creative house, decoration, and animal', () => {
    const world = createInitialWorld()
    const house = placeCreativeAsset(world, 'fort/house-2', 0, 10)
    if (house?.kind !== 'structure') throw new Error('expected structure')
    const erased = removeCreativeAt(world, { x: 0, y: 0, z: 10 })
    expect(erased?.kind).toBe('structure')
    expect(world.structures.some((entry) => entry.id === house.structure.id)).toBe(false)

    const tree = placeCreativeAsset(world, 'nature/pine', 12, -8)
    expect(tree?.kind).toBe('decoration')
    expect(removeCreativeAt(world, { x: 12, y: 0, z: -8 })?.kind).toBe('decoration')
    expect(world.decorations).toHaveLength(0)

    const deer = placeCreativeAsset(world, 'animals/deer', 50, -20)
    if (deer?.kind !== 'wildlife') throw new Error('expected wildlife')
    expect(removeCreativeAt(world, { x: 50, y: 0, z: -20 })?.kind).toBe('wildlife')
    expect(world.wildlife.some((entry) => entry.id === deer.animal.id)).toBe(false)
  })

  it('does not instantly delete a seed building', () => {
    const world = createInitialWorld()
    const kitchen = world.structures.find((entry) => entry.definitionId === 'kitchen' && entry.placedBy !== 'creative')
    if (!kitchen) throw new Error('missing kitchen')
    const at = sitePosition(world, kitchen)
    expect(removeCreativeAt(world, at)).toBeNull()
    expect(world.structures.some((entry) => entry.id === kitchen.id)).toBe(true)
  })
})
