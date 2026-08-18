import { describe, expect, it } from 'vitest'
import { cameraRelativeWish, firstPersonWish, followCameraOffset, lookXZ, turnYaw } from '@/controls/CameraWish'
import { cycleControlled, possessSurvivor, releaseControl } from '@/controls/PlayerControl'
import { stepWorld } from '@/simulation/SimStep'
import { createInitialWorld } from '@/simulation/WorldState'
import { findSurvivor } from '@/simulation/EntityRegistry'

describe('player control', () => {
  it('maps D to screen-right in top-down and first-person', () => {
    const north = cameraRelativeWish(1, 0, 0, -1)
    expect(north.x).toBeGreaterThan(0.9)
    expect(Math.abs(north.z)).toBeLessThan(0.1)

    const facingNorth = firstPersonWish(1, 0, Math.PI)
    expect(facingNorth.x).toBeGreaterThan(0.9)

    const facingSouth = firstPersonWish(1, 0, 0)
    expect(facingSouth.x).toBeLessThan(-0.9)
  })

  it('pulls the follow camera to a lower side view', () => {
    const high = followCameraOffset(0, 42, 0)
    const side = followCameraOffset(0, 42, 1)
    expect(side.y).toBeLessThan(high.y)
    expect(Math.abs(side.x)).toBeGreaterThan(Math.abs(high.x))
  })

  it('turns first-person look toward screen-right when the mouse moves right', () => {
    const yaw = turnYaw(0, 20)
    const look = lookXZ(yaw)
    expect(look.x).toBeLessThan(0)
  })

  it('takes over an existing survivor instead of creating a new character', () => {
    const world = createInitialWorld()
    const before = world.survivors.length
    expect(possessSurvivor(world, 'hunter')).toBe(true)
    expect(world.survivors.length).toBe(before)
    expect(world.player.controlledId).toBe('hunter')
    expect(findSurvivor(world, 'hunter')?.name).toBe('冯老师')
    expect(possessSurvivor(world, 'fisher')).toBe(false)
    expect(world.player.controlledId).toBe('hunter')
  })

  it('strafes first-person D toward screen-right', () => {
    const world = createInitialWorld()
    possessSurvivor(world, 'hunter')
    world.player.view = 'firstperson'
    const hunter = findSurvivor(world, 'hunter')
    if (!hunter) throw new Error('missing hunter')
    hunter.facingYaw = 0
    const startX = hunter.position.x
    for (let i = 0; i < 30; i += 1) {
      stepWorld(world, 1 / 30, { wishX: 1, wishZ: 0, faceX: null, faceZ: null, yawDelta: 0 })
    }
    expect(hunter.position.x).toBeLessThan(startX - 2)
  })

  it('faces the key direction instead of the mouse in top-down', () => {
    const world = createInitialWorld()
    possessSurvivor(world, 'hunter')
    const hunter = findSurvivor(world, 'hunter')
    if (!hunter) throw new Error('missing hunter')
    hunter.facingYaw = 0
    stepWorld(world, 1 / 30, { wishX: 1, wishZ: 0, faceX: hunter.position.x, faceZ: hunter.position.z + 20, yawDelta: 0 })
    expect(hunter.facingYaw).toBeCloseTo(Math.PI / 2, 5)
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
    expect(world.player.controlledId).toBe('hunter')
  })

  it('does not walk through complete walls', () => {
    const world = createInitialWorld()
    possessSurvivor(world, 'hunter')
    const hunter = findSurvivor(world, 'hunter')
    if (!hunter) throw new Error('missing hunter')
    hunter.position.x = 29.2
    hunter.position.z = 0

    for (let i = 0; i < 45; i += 1) {
      stepWorld(world, 1 / 30, { wishX: 1, wishZ: 0, faceX: null, faceZ: null, yawDelta: 0 })
    }

    expect(hunter.position.x).toBeLessThan(30.4)
  })

  it('selects teammates without taking control of them', () => {
    const world = createInitialWorld()
    possessSurvivor(world, 'hunter')
    cycleControlled(world)
    expect(world.player.controlledId).toBe('hunter')
    expect(world.player.selectedId).toBe('fisher')
    releaseControl(world)
    expect(world.player.controlledId).toBe('hunter')
    expect(world.player.view).toBe('topdown')
  })
})
