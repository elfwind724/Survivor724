import { describe, expect, it } from 'vitest'
import { createEnemy, tryShoot } from '@/combat/Combat'
import { stepNightCycle } from '@/combat/Night'
import { possessSurvivor } from '@/controls/PlayerControl'
import { skipSeconds } from '@/simulation/SimStep'
import { createInitialWorld } from '@/simulation/WorldState'
import { findSurvivor } from '@/simulation/EntityRegistry'

describe('combat and night', () => {
  it('lets a possessed survivor shoot an enemy standing in front', () => {
    const world = createInitialWorld()
    possessSurvivor(world, 'hunter')
    const hunter = findSurvivor(world, 'hunter')
    if (!hunter) throw new Error('missing hunter')
    hunter.facingYaw = 0
    hunter.ammo = 10
    hunter.carriedTools = ['rifle']
    world.enemies.push(createEnemy('wanderer', { x: hunter.position.x, y: 0, z: hunter.position.z + 6 }, 'dummy'))
    const before = world.enemies[0]?.health ?? 0
    expect(tryShoot(world, hunter)).toBe(true)
    expect(world.enemies[0]?.health ?? 0).toBeLessThan(before)
    expect(hunter.ammo).toBe(9)
  })

  it('spawns a night horde once per night and posts defenders', () => {
    const world = createInitialWorld()
    world.time.daySeconds = 60 + 11 * 60 + 90
    world.time.phase = 'night'
    stepNightCycle(world)
    expect(world.enemies.length).toBeGreaterThan(8)
    expect(world.nightPosts.some((post) => post.occupantId !== null)).toBe(true)
    const count = world.enemies.length
    stepNightCycle(world)
    expect(world.enemies.length).toBe(count)
  })

  it('can skip into night and still keep the base standing', () => {
    const world = createInitialWorld()
    skipSeconds(world, 60 + 11 * 60 + 95)
    expect(world.time.phase === 'night' || world.time.phase === 'dusk' || world.time.phase === 'aftermath').toBe(true)
    expect(world.survivors.some((survivor) => !survivor.downed)).toBe(true)
  })
})
