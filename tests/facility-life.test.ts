import { describe, expect, it } from 'vitest'
import { BED_SCALE, bedSpot, enterFacility, facilityApproach, findFacility, interiorProps, isSleeping, leaveFacility, occupiedFacilityIds, sleeperEuler } from '@/base/FacilityLife'
import { isLifeBuilding } from '@/data/outdoorScenery'
import { createInitialWorld } from '@/simulation/WorldState'
import { stepWorld } from '@/simulation/SimStep'

describe('facility life', () => {
  it('puts a resting survivor into the quarters and marks the building occupied', () => {
    const world = createInitialWorld()
    const quarters = findFacility(world, 'quarters')
    const hunter = world.survivors.find((entry) => entry.id === 'hunter')
    if (!quarters || !hunter) throw new Error('missing camp')
    hunter.position = bedSpot(world, hunter)
    enterFacility(world, hunter, quarters, bedSpot(world, hunter))
    hunter.workerState = 'Rest'
    expect(hunter.indoorId).toBe(quarters.id)
    expect(isSleeping(world, hunter)).toBe(true)
    expect(occupiedFacilityIds(world).has(quarters.id)).toBe(true)
    leaveFacility(world, hunter)
    expect(hunter.indoorId).toBeNull()
  })

  it('walks a tired survivor home and lies them down in the quarters', () => {
    const world = createInitialWorld()
    const hunter = world.survivors.find((entry) => entry.id === 'hunter')
    const quarters = findFacility(world, 'quarters')
    if (!hunter || !quarters) throw new Error('missing hunter')
    hunter.hunger = 90
    hunter.thirst = 90
    hunter.fatigue = 40
    hunter.carriedTools = hunter.carriedTools.filter((tool) => tool === 'rifle')
    hunter.position = facilityApproach(world, quarters)
    hunter.workerState = 'Idle'
    hunter.destination = null
    hunter.path = []
    world.time.phase = 'dusk'
    world.lastPhase = 'dusk'
    world.time.daySeconds = 60 + 11 * 60 + 10
    for (let i = 0; i < 30 * 5; i += 1) stepWorld(world, 1 / 30)
    expect(hunter.indoorId).toBe(quarters.id)
    expect(hunter.workerState).toBe('Rest')
    expect(isSleeping(world, hunter)).toBe(true)
    const bed = bedSpot(world, hunter)
    const xs = quarters.cells.map((cell) => cell.x)
    const zs = quarters.cells.map((cell) => cell.z)
    const west = world.nav.originX + Math.min(...xs)
    const east = world.nav.originX + Math.max(...xs) + 1
    const south = world.nav.originZ + Math.min(...zs)
    const north = world.nav.originZ + Math.max(...zs) + 1
    expect(bed.x).toBeGreaterThan(west + 1.5)
    expect(bed.x).toBeLessThan(east - 1.5)
    expect(bed.z).toBeGreaterThan(south + 1.5)
    expect(bed.z).toBeLessThan(north - 1.5)
    const beds = world.survivors.map((entry) => bedSpot(world, entry))
    for (let i = 1; i < beds.length; i += 1) {
      expect(Math.abs((beds[i]?.x ?? 0) - (beds[i - 1]?.x ?? 0))).toBeGreaterThan(1.6)
    }
  })

  it('lays sleepers on their back with heads toward the bed headboard', () => {
    const world = createInitialWorld()
    const quarters = findFacility(world, 'quarters')
    if (!quarters) throw new Error('missing quarters')
    const beds = interiorProps(world, quarters).filter((prop) => prop.assetId === 'interior/bed-single')
    expect(beds.length).toBe(5)
    expect(beds.every((bed) => Math.abs(bed.yaw - Math.PI) < 1e-6)).toBe(true)
    expect(beds.every((bed) => (bed.scale ?? 0) >= 0.75)).toBe(true)
    expect(BED_SCALE).toBeGreaterThanOrEqual(0.75)
    const pose = sleeperEuler()
    expect(pose.order).toBe('YXZ')
    expect(pose.x).toBeCloseTo(-Math.PI / 2, 5)
    expect(pose.y).toBeCloseTo(Math.PI, 5)
  })

  it('treats kitchen and quarters as open living buildings', () => {
    expect(isLifeBuilding('kitchen')).toBe(true)
    expect(isLifeBuilding('quarters')).toBe(true)
    expect(isLifeBuilding('watchtower')).toBe(false)
  })

  it('can switch between interior cutaway and full buildings', () => {
    const world = createInitialWorld()
    expect(world.showInteriors).toBe(true)
    world.showInteriors = false
    expect(world.showInteriors).toBe(false)
  })
})
