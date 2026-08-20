import { describe, expect, it } from 'vitest'
import { assignedRescuer } from '@/jobs/Rescue'
import { insideBase } from '@/survivors/Living'
import { activityCaption } from '@/survivors/Activity'
import { stepWorld } from '@/simulation/SimStep'
import { createInitialWorld } from '@/simulation/WorldState'
import { distanceXZ } from '@/simulation/types'

describe('daytime field rescue', () => {
  it('does not let a downed field worker keep walking the job', () => {
    const world = createInitialWorld()
    const scav = world.survivors.find((entry) => entry.id === 'scavenger')
    if (!scav) throw new Error('missing scavenger')
    scav.position = { x: 40, y: 0, z: 55 }
    scav.destination = { x: 50, y: 0, z: 62 }
    scav.workerState = 'Work'
    scav.downed = true
    scav.health = 6
    const start = { x: scav.position.x, z: scav.position.z }
    for (let i = 0; i < 30 * 2; i += 1) stepWorld(world, 1 / 30)
    expect(Math.hypot(scav.position.x - start.x, scav.position.z - start.z)).toBeLessThan(2.2)
    expect(scav.downed).toBe(true)
  })

  it('sends the nearest free survivor walking toward a downed ally in the field', () => {
    const world = createInitialWorld()
    const scav = world.survivors.find((entry) => entry.id === 'scavenger')
    const builder = world.survivors.find((entry) => entry.id === 'builder')
    if (!scav || !builder) throw new Error('missing people')
    scav.position = { x: 40, y: 0, z: 55 }
    scav.downed = true
    scav.health = 8
    const fisher = world.survivors.find((entry) => entry.id === 'fisher')
    const hauler = world.survivors.find((entry) => entry.id === 'hauler')
    if (fisher) fisher.position = { x: -55, y: 0, z: 32 }
    if (hauler) hauler.position = { x: -22, y: 0, z: -16 }
    expect(insideBase(scav.position)).toBe(false)
    expect(assignedRescuer(world, scav)?.id).toBe('builder')
    const start = { x: builder.position.x, z: builder.position.z }
    const goal = distanceXZ(builder.position, scav.position)
    for (let i = 0; i < 30 * 4; i += 1) stepWorld(world, 1 / 30)
    expect(distanceXZ(builder.position, scav.position)).toBeLessThan(goal)
    expect(Math.hypot(builder.position.x - start.x, builder.position.z - start.z)).toBeGreaterThan(2)
    expect(activityCaption(world, scav)).toMatch(/倒地/)
    expect(activityCaption(world, builder)).toMatch(/救/)
  })

  it('drags the downed ally toward the base without teleporting', () => {
    const world = createInitialWorld()
    const scav = world.survivors.find((entry) => entry.id === 'scavenger')
    const builder = world.survivors.find((entry) => entry.id === 'builder')
    if (!scav || !builder) throw new Error('missing people')
    scav.position = { x: 40, y: 0, z: 55 }
    scav.downed = true
    scav.health = 8
    builder.position = { x: 39.2, y: 0, z: 55 }
    builder.facingYaw = Math.PI / 2
    const home = { x: -20, y: 0, z: -19 }
    const startDist = distanceXZ(scav.position, home)
    let maxJump = 0
    for (let i = 0; i < 30 * 8; i += 1) {
      const before = { x: scav.position.x, z: scav.position.z }
      stepWorld(world, 1 / 30)
      maxJump = Math.max(maxJump, Math.hypot(scav.position.x - before.x, scav.position.z - before.z))
    }
    expect(distanceXZ(scav.position, home)).toBeLessThan(startDist)
    expect(maxJump).toBeLessThan(2.2)
    expect(scav.downed).toBe(true)
    expect(activityCaption(world, scav)).toMatch(/拖回/)
    expect(activityCaption(world, builder)).toMatch(/拖回/)
  })
})
