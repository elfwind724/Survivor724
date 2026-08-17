import { describe, expect, it } from 'vitest'
import { createEnemy, tryShoot } from '@/combat/Combat'
import { reinforceSector } from '@/combat/Defense'
import { stepNightCycle } from '@/combat/Night'
import { cellCenter } from '@/navigation/NavGrid'
import { stepWorld } from '@/simulation/SimStep'
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

  it('lets enemies break a damaged wall', () => {
    const world = createInitialWorld()
    const wall = world.structures.find((structure) => structure.kind === 'wall' && structure.stage === 'complete')
    if (!wall || !wall.cells[0]) throw new Error('missing wall')
    wall.hp = 10
    const point = cellCenter(world.nav, wall.cells[0])
    world.enemies.push(createEnemy('wanderer', { x: point.x + 1.1, y: 0, z: point.z }, 'ram'))
    const id = wall.id
    for (let i = 0; i < 90; i += 1) stepWorld(world, 1 / 30)
    expect(world.structures.some((structure) => structure.id === id)).toBe(false)
  })

  it('reinforces a sector by sending people to those posts', () => {
    const world = createInitialWorld()
    world.time.phase = 'night'
    stepNightCycle(world)
    reinforceSector(world, 'east')
    const east = world.survivors.filter((survivor) => {
      const post = world.nightPosts.find((entry) => entry.id === survivor.nightPostId)
      return post?.sector === 'east'
    })
    expect(east.length).toBeGreaterThan(1)
  })

  it('can skip into night and still keep the base standing', () => {
    const world = createInitialWorld()
    skipSeconds(world, 60 + 11 * 60 + 95)
    expect(world.time.phase === 'night' || world.time.phase === 'dusk' || world.time.phase === 'aftermath').toBe(true)
    expect(world.survivors.some((survivor) => !survivor.downed)).toBe(true)
  })
})
