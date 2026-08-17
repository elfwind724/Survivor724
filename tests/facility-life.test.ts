import { describe, expect, it } from 'vitest'
import { bedSpot, enterFacility, facilityApproach, findFacility, isSleeping, leaveFacility, occupiedFacilityIds } from '@/base/FacilityLife'
import { isLifeBuilding } from '@/data/outdoorScenery'
import { createInitialWorld } from '@/simulation/WorldState'
import { stepWorld } from '@/simulation/SimStep'

describe('facility life', () => {
  it('puts a resting survivor into the quarters and marks the building occupied', () => {
    const world = createInitialWorld()
    const quarters = findFacility(world, 'quarters')
    const hunter = world.survivors.find((entry) => entry.id === 'hunter')
    if (!quarters || !hunter) throw new Error('missing camp')
    enterFacility(world, hunter, quarters, bedSpot(world, hunter))
    hunter.workerState = 'Rest'
    expect(hunter.indoorId).toBe(quarters.id)
    expect(isSleeping(hunter)).toBe(true)
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
    expect(isSleeping(hunter)).toBe(true)
  })

  it('treats kitchen and quarters as open living buildings', () => {
    expect(isLifeBuilding('kitchen')).toBe(true)
    expect(isLifeBuilding('quarters')).toBe(true)
    expect(isLifeBuilding('watchtower')).toBe(false)
  })
})
