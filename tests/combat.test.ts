import { describe, expect, it } from 'vitest'
import { createEnemy, tryShoot } from '@/combat/Combat'
import { reinforceSector } from '@/combat/Defense'
import { assignedRescuer, stepNightCycle } from '@/combat/Night'
import { duskWarningLevel } from '@/simulation/TimeSystem'
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

  it('sends the nearest free survivor to a downed ally', () => {
    const world = createInitialWorld()
    world.time.daySeconds = 60 + 11 * 60 + 90
    world.time.phase = 'night'
    world.nightSpawnedDay = world.time.dayIndex
    world.enemies = []
    const hunter = findSurvivor(world, 'hunter')
    const fisher = findSurvivor(world, 'fisher')
    if (!hunter || !fisher) throw new Error('missing people')
    hunter.downed = true
    hunter.health = 8
    hunter.position = { x: 0, y: 0, z: 0 }
    for (const survivor of world.survivors) {
      if (survivor.id === 'hunter' || survivor.id === 'fisher') continue
      survivor.position = { x: 40, y: 0, z: 40 }
    }
    fisher.position = { x: 10, y: 0, z: 0 }
    expect(assignedRescuer(world, hunter)?.id).toBe('fisher')
    const start = fisher.position.x
    for (let i = 0; i < 90; i += 1) stepWorld(world, 1 / 30)
    expect(Math.abs(fisher.position.x)).toBeLessThan(Math.abs(start))
  })

  it('lets the builder repair a damaged wall at night when no enemy is close', () => {
    const world = createInitialWorld()
    world.time.daySeconds = 60 + 11 * 60 + 90
    world.time.phase = 'night'
    world.nightSpawnedDay = world.time.dayIndex
    world.enemies = []
    const wall = world.structures.find((structure) => structure.kind === 'wall' && structure.stage === 'complete')
    const builder = findSurvivor(world, 'builder')
    if (!wall?.cells[0] || !builder) throw new Error('missing wall or builder')
    wall.hp = 20
    const point = cellCenter(world.nav, wall.cells[0])
    builder.position = { x: point.x, y: 0, z: point.z + 1 }
    builder.carriedTools = ['hammer']
    const before = wall.hp
    for (let i = 0; i < 60; i += 1) stepWorld(world, 1 / 30)
    expect(wall.hp).toBeGreaterThan(before)
  })

  it('raises dusk warnings as daylight runs out', () => {
    const world = createInitialWorld()
    expect(duskWarningLevel(world)).toBe(0)
    world.time.daySeconds = 60 + 11 * 60 - 20
    world.time.phase = 'day'
    expect(duskWarningLevel(world)).toBe(3)
    world.time.phase = 'dusk'
    expect(duskWarningLevel(world)).toBe(3)
  })
})
