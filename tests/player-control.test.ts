import { describe, expect, it } from 'vitest'
import { cycleControlled, possessSurvivor, releaseControl, stepPlayerControl } from '@/controls/PlayerControl'
import { stepWorld } from '@/simulation/SimStep'
import { createInitialWorld } from '@/simulation/WorldState'
import { findSurvivor } from '@/simulation/EntityRegistry'

describe('player control', () => {
  it('takes over an existing survivor instead of creating a new character', () => {
    const world = createInitialWorld()
    const before = world.survivors.length
    expect(possessSurvivor(world, 'hunter')).toBe(true)
    expect(world.survivors.length).toBe(before)
    expect(world.player.controlledId).toBe('hunter')
    expect(findSurvivor(world, 'hunter')?.currentJobId).toBe('job-hunt')
  })

  it('moves the possessed survivor with control intent and pauses their job AI', () => {
    const world = createInitialWorld()
    possessSurvivor(world, 'hunter')
    const hunter = findSurvivor(world, 'hunter')
    if (!hunter) throw new Error('missing hunter')
    const start = { x: hunter.position.x, z: hunter.position.z }

    for (let i = 0; i < 30; i += 1) {
      stepWorld(world, 1 / 30, { wishX: 1, wishZ: 0, faceX: start.x + 10, faceZ: start.z, yawDelta: 0 })
    }

    expect(hunter.position.x).toBeGreaterThan(start.x + 2)
    expect(hunter.workerState).toBe('Idle')
    expect(world.jobs.find((job) => job.id === 'job-hunt')?.assigneeId).toBe('hunter')
  })

  it('does not walk through complete walls', () => {
    const world = createInitialWorld()
    possessSurvivor(world, 'hunter')
    const hunter = findSurvivor(world, 'hunter')
    if (!hunter) throw new Error('missing hunter')
    hunter.position.x = 7.2
    hunter.position.z = 0

    for (let i = 0; i < 45; i += 1) {
      stepWorld(world, 1 / 30, { wishX: 1, wishZ: 0, faceX: null, faceZ: null, yawDelta: 0 })
    }

    expect(hunter.position.x).toBeLessThan(8.4)
  })

  it('cycles through living survivors and resumes AI after release', () => {
    const world = createInitialWorld()
    possessSurvivor(world, 'hunter')
    cycleControlled(world)
    expect(world.player.controlledId).toBe('fisher')
    releaseControl(world)
    expect(world.player.controlledId).toBeNull()
    expect(world.player.view).toBe('topdown')

    const fisher = findSurvivor(world, 'fisher')
    if (!fisher) throw new Error('missing fisher')
    const start = fisher.workerState
    stepWorld(world, 1 / 30)
    expect(fisher.workerState === start || fisher.workerState === 'AcquireEquipment' || fisher.workerState === 'TravelToTarget' || fisher.workerState === 'RestOrNextJob').toBe(true)
  })
})
