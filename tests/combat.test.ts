import { describe, expect, it } from 'vitest'
import { createEnemy, stepProjectiles, tryShoot } from '@/combat/Combat'
import { reinforceSector } from '@/combat/Defense'
import { assignedRescuer, stepNightCycle } from '@/combat/Night'
import { fireProfile, magazineSize, muzzleOrigin, readMag } from '@/data/weapons'
import { duskWarningLevel } from '@/simulation/TimeSystem'
import { cellCenter } from '@/navigation/NavGrid'
import { stepWorld } from '@/simulation/SimStep'
import { possessSurvivor } from '@/controls/PlayerControl'
import { skipSeconds } from '@/simulation/SimStep'
import { createInitialWorld } from '@/simulation/WorldState'
import { findSurvivor } from '@/simulation/EntityRegistry'
import { equipItem } from '@/survivors/Equipment'
import { grantXp } from '@/survivors/Progress'

function flyShots(world: ReturnType<typeof createInitialWorld>, seconds = 0.5): void {
  const dt = 1 / 30
  for (let i = 0; i < Math.round(seconds / dt); i += 1) stepProjectiles(world, dt)
}

describe('combat and night', () => {
  it('spawns a rifle projectile that hits after travel time', () => {
    const world = createInitialWorld()
    possessSurvivor(world, 'hunter')
    const hunter = findSurvivor(world, 'hunter')
    if (!hunter) throw new Error('missing hunter')
    hunter.facingYaw = 0
    hunter.ammo = 10
    hunter.equipment.weapon = 'rifle'
    hunter.carriedTools = ['rifle']
    world.enemies.push(createEnemy('wanderer', { x: hunter.position.x, y: 0, z: hunter.position.z + 6 }, 'dummy'))
    const before = world.enemies[0]?.health ?? 0
    expect(tryShoot(world, hunter)).toBe(true)
    expect(world.projectiles).toHaveLength(1)
    expect(world.enemies[0]?.health ?? 0).toBe(before)
    flyShots(world, 0.2)
    expect(world.enemies[0]?.health ?? 0).toBeLessThan(before)
    expect(hunter.ammo).toBe(9)
    expect(world.projectiles).toHaveLength(0)
  })

  it('spawns shots from the raised muzzle, not the belly', () => {
    const world = createInitialWorld()
    const hunter = findSurvivor(world, 'hunter')
    if (!hunter) throw new Error('missing hunter')
    hunter.position = { x: 0, y: 0, z: 0 }
    hunter.facingYaw = 0
    hunter.ammo = 8
    hunter.equipment.weapon = 'rifle'
    const muzzle = muzzleOrigin(hunter)
    expect(muzzle.z).toBeGreaterThan(0.8)
    expect(muzzle.x).toBeGreaterThan(0.1)
    expect(muzzle.y).toBeGreaterThan(1.5)
    expect(tryShoot(world, hunter)).toBe(true)
    expect(world.projectiles[0]?.position.z).toBeCloseTo(muzzle.z, 5)
    expect(world.projectiles[0]?.position.y).toBeCloseTo(1.72, 5)
  })

  it('splits shotgun pellets and keeps other guns as single shots', () => {
    const world = createInitialWorld()
    const hunter = findSurvivor(world, 'hunter')
    if (!hunter) throw new Error('missing hunter')
    hunter.ammo = 20
    hunter.facingYaw = 0
    hunter.equipment.weapon = 'shotgun'
    expect(tryShoot(world, hunter)).toBe(true)
    expect(world.projectiles).toHaveLength(6)
    hunter.fireCooldown = 0
    hunter.equipment.weapon = 'smg'
    world.projectiles = []
    expect(tryShoot(world, hunter)).toBe(true)
    expect(world.projectiles).toHaveLength(1)
    expect(fireProfile(hunter).cooldown).toBeLessThan(0.2)
    hunter.fireCooldown = 0
    hunter.equipment.weapon = 'sniper'
    world.projectiles = []
    const sniper = fireProfile(hunter)
    expect(sniper.range).toBeGreaterThan(40)
    expect(sniper.damage).toBeGreaterThan(40)
    expect(tryShoot(world, hunter)).toBe(true)
    expect(world.projectiles[0]?.velocity.x !== 0 || (world.projectiles[0]?.velocity.z ?? 0) > 80).toBe(true)
  })

  it('keeps a separate magazine for each gun', () => {
    const world = createInitialWorld()
    const hunter = findSurvivor(world, 'hunter')
    if (!hunter) throw new Error('missing hunter')
    hunter.ammo = 3
    hunter.equipment.weapon = 'pistol'
    hunter.weaponAmmo = { pistol: 3 }
    expect(equipItem(world, hunter, 'rifle')).toBe(true)
    expect(hunter.equipment.weapon).toBe('rifle')
    expect(hunter.ammo).toBe(magazineSize('rifle'))
    expect(readMag(hunter, 'pistol')).toBe(3)
    hunter.ammo = 0
    hunter.weaponAmmo.rifle = 0
    hunter.fireCooldown = 0
    expect(tryShoot(world, hunter)).toBe(false)
    expect(equipItem(world, hunter, 'pistol')).toBe(true)
    expect(hunter.ammo).toBe(3)
    hunter.fireCooldown = 0
    expect(tryShoot(world, hunter)).toBe(true)
    expect(hunter.ammo).toBe(2)
  })

  it('lets a survivor equip a locker gun and refuses to fire without one', () => {
    const world = createInitialWorld()
    const fisher = findSurvivor(world, 'fisher')
    if (!fisher) throw new Error('missing fisher')
    fisher.ammo = 6
    fisher.equipment.weapon = null
    fisher.carriedTools = []
    expect(tryShoot(world, fisher)).toBe(false)
    expect(equipItem(world, fisher, 'revolver')).toBe(true)
    expect(fisher.equipment.weapon).toBe('revolver')
    expect(tryShoot(world, fisher)).toBe(true)
    expect(world.projectiles[0]?.weaponId).toBe('revolver')
  })

  it('levels a survivor and makes the same gun hit harder and farther', () => {
    const world = createInitialWorld()
    const hunter = findSurvivor(world, 'hunter')
    if (!hunter) throw new Error('missing hunter')
    hunter.equipment.weapon = 'rifle'
    const before = fireProfile(hunter)
    expect(hunter.level).toBe(1)
    grantXp(hunter, 400)
    expect(hunter.level).toBeGreaterThan(1)
    const after = fireProfile(hunter)
    expect(after.damage).toBeGreaterThan(before.damage)
    expect(after.range).toBeGreaterThan(before.range)
    expect(after.cooldown).toBeLessThan(before.cooldown)
    expect(after.spread).toBeLessThan(before.spread)
  })

  it('grants experience when a flying shot kills', () => {
    const world = createInitialWorld()
    const hunter = findSurvivor(world, 'hunter')
    if (!hunter) throw new Error('missing hunter')
    hunter.facingYaw = 0
    hunter.ammo = 10
    hunter.equipment.weapon = 'sniper'
    hunter.xp = 0
    hunter.level = 1
    world.enemies.push(createEnemy('runner', { x: hunter.position.x, y: 0, z: hunter.position.z + 4 }, 'xp-dummy'))
    const runner = world.enemies[0]
    if (runner) runner.health = 20
    expect(tryShoot(world, hunter)).toBe(true)
    flyShots(world, 0.2)
    expect(world.enemies.find((entry) => entry.id === 'xp-dummy')).toBeUndefined()
    expect(hunter.xp).toBeGreaterThan(0)
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
