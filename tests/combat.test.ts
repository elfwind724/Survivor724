import { describe, expect, it } from 'vitest'
import { createEnemy, reloadWeapon, stepProjectiles, towerRangeBonus, tryShoot } from '@/combat/Combat'
import { reinforceSector } from '@/combat/Defense'
import { assignedRescuer, nightLootFor, stepNightCycle, stepNightDefender } from '@/combat/Night'
import { demolishStructure } from '@/base/construction'
import { countItem } from '@/inventory/Inventory'
import { gunshotHordeExtra, hordeCounts, sectorOfPoint } from '@/data/enemies'
import { assignWatch } from '@/jobs/Roster'
import { TOWER_STAND_HEIGHT } from '@/data/outdoorScenery'
import { equippedWeapon, fireProfile, magazineSize, muzzleOrigin, readMag } from '@/data/weapons'
import { DAY_END, DUSK_END, duskWarningLevel } from '@/simulation/TimeSystem'
import { distanceXZ } from '@/simulation/types'
import { cellCenter, worldToCell } from '@/navigation/NavGrid'
import { stepWorld } from '@/simulation/SimStep'
import { possessSurvivor } from '@/controls/PlayerControl'
import { skipSeconds } from '@/simulation/SimStep'
import { BASE, createInitialWorld } from '@/simulation/WorldState'
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
    world.debugInfiniteAmmo = true
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
    expect(hunter.ammo).toBe(10)
    expect(world.projectiles).toHaveLength(0)
    expect(world.enemies[0]?.hitFlash ?? 0).toBeGreaterThan(0)
    expect(world.impacts.some((impact) => impact.kind === 'hit' || impact.kind === 'kill')).toBe(true)
  })

  it('lets a shot leave the yard through walls and buildings', () => {
    const world = createInitialWorld()
    const hunter = findSurvivor(world, 'hunter')
    if (!hunter) throw new Error('missing hunter')
    hunter.position = { x: 0, y: 0, z: 8 }
    hunter.facingYaw = 0
    hunter.ammo = 8
    hunter.equipment.weapon = 'rifle'
    world.enemies.push(createEnemy('wanderer', { x: 0, y: 0, z: 36 }, 'outside'))
    const before = world.enemies[0]?.health ?? 0
    expect(tryShoot(world, hunter)).toBe(true)
    flyShots(world, 0.6)
    expect(world.enemies[0]?.health ?? 0).toBeLessThan(before)
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
    expect(muzzle.x).toBeLessThan(-0.1)
    expect(muzzle.y).toBeGreaterThan(1.9)
    expect(tryShoot(world, hunter)).toBe(true)
    expect(world.projectiles[0]?.position.z).toBeCloseTo(muzzle.z, 5)
    expect(world.projectiles[0]?.position.y).toBeCloseTo(2.06, 5)
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
    world.debugInfiniteAmmo = true
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
    expect(tryShoot(world, hunter)).toBe(true)
    expect(hunter.ammo).toBe(0)
    expect(equipItem(world, hunter, 'pistol')).toBe(true)
    expect(hunter.ammo).toBe(3)
    hunter.fireCooldown = 0
    expect(tryShoot(world, hunter)).toBe(true)
    expect(hunter.ammo).toBe(3)
  })

  it('reloads the current gun from warehouse ammo without touching other magazines', () => {
    const world = createInitialWorld()
    const hunter = findSurvivor(world, 'hunter')
    const warehouse = world.inventories['inv-warehouse']
    if (!hunter || !warehouse) throw new Error('missing hunter')
    hunter.equipment.weapon = 'pistol'
    hunter.ammo = 2
    hunter.weaponAmmo = { pistol: 2, rifle: 9 }
    const stock = warehouse.items.find((item) => item.itemId === 'ammo')?.count ?? 0
    expect(reloadWeapon(world, hunter)).toBe('ok')
    expect(hunter.ammo).toBe(12)
    expect(hunter.weaponAmmo.rifle).toBe(9)
    expect(warehouse.items.find((item) => item.itemId === 'ammo')?.count).toBe(stock - 10)
    expect(reloadWeapon(world, hunter)).toBe('full')
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

  it('grows the night horde after the first night', () => {
    expect(hordeCounts(1).wanderers + hordeCounts(1).runners).toBe(26)
    expect(hordeCounts(3).wanderers).toBe(26)
    expect(hordeCounts(3).runners).toBe(12)
  })

  it('makes the night worse if the raid came back without a good gun', () => {
    const empty = hordeCounts(1, { entered: true, best: null })
    const legend = hordeCounts(1, { entered: true, best: 'legendary' })
    const skipped = hordeCounts(1)
    expect(empty.wanderers).toBeGreaterThan(skipped.wanderers)
    expect(empty.runners).toBeGreaterThan(skipped.runners)
    expect(legend.wanderers).toBeLessThan(skipped.wanderers)
  })

  it('adds extra night enemies from the direction of daytime gunshots', () => {
    const world = createInitialWorld()
    world.time.phase = 'day'
    const hunter = findSurvivor(world, 'hunter')
    if (!hunter) throw new Error('missing hunter')
    hunter.position = { x: 56, y: 0, z: -22 }
    hunter.facingYaw = 0
    hunter.equipment.weapon = 'rifle'
    hunter.fireCooldown = 0
    expect(sectorOfPoint(56, -22)).toBe('east')
    for (let i = 0; i < 20; i += 1) {
      hunter.fireCooldown = 0
      expect(tryShoot(world, hunter)).toBe(true)
    }
    expect(world.dayGunshots).toBe(20)
    expect(world.dayNoise.east).toBe(20)
    const extra = gunshotHordeExtra(20)
    expect(extra.wanderers).toBe(4)
    expect(extra.runners).toBe(2)
    const base = hordeCounts(world.time.dayIndex)
    world.time.phase = 'night'
    world.nightSpawnedDay = 0
    stepNightCycle(world)
    expect(world.nightSpawned).toBe(base.wanderers + base.runners + extra.wanderers + extra.runners)
    expect(world.enemies.filter((enemy) => enemy.position.x > 50).length).toBeGreaterThanOrEqual(extra.wanderers)
  })

  it('does not count night gunfire toward the next horde', () => {
    const world = createInitialWorld()
    world.time.phase = 'night'
    const hunter = findSurvivor(world, 'hunter')
    if (!hunter) throw new Error('missing hunter')
    hunter.equipment.weapon = 'rifle'
    hunter.fireCooldown = 0
    expect(tryShoot(world, hunter)).toBe(true)
    expect(world.dayGunshots).toBe(0)
  })

  it('clears hunting noise at dawn', () => {
    const world = createInitialWorld()
    world.dayGunshots = 20
    world.dayNoise.east = 20
    world.lastPhase = 'night'
    world.time.phase = 'dawn'
    stepNightCycle(world)
    expect(world.dayGunshots).toBe(0)
    expect(world.dayNoise.east).toBe(0)
  })

  it('pays salvage into the warehouse after a survived night', () => {
    const world = createInitialWorld()
    const warehouse = world.inventories['inv-warehouse']
    if (!warehouse) throw new Error('missing warehouse')
    const wood = countItem(warehouse, 'wood')
    world.nightKills = 12
    world.nightSpawned = 26
    world.nightWalls = 40
    world.lastPhase = 'night'
    world.time.phase = 'aftermath'
    stepNightCycle(world)
    expect(world.gameOver).toBe(false)
    expect(world.nightReport?.outcome).toBe('won')
    expect(world.nightReport?.kills).toBe(12)
    expect(countItem(warehouse, 'wood')).toBe(wood + nightLootFor(12)[0]!.count)
    expect(world.nightReport?.loot.some((item) => item.itemId === 'meal' && item.count > 0)).toBe(true)
    const nightGun = world.nightReport?.loot.find((item) => item.itemId.startsWith('g-'))
    expect(nightGun).toBeTruthy()
    if (nightGun) {
      expect(countItem(warehouse, nightGun.itemId)).toBe(0)
      expect(world.groundLoot.some((drop) => drop.gearId === nightGun.itemId)).toBe(true)
    }
  })

  it('ends the game when the whole roster is down', () => {
    const world = createInitialWorld()
    world.time.phase = 'night'
    for (const survivor of world.survivors) {
      survivor.downed = true
      survivor.health = 0
    }
    stepNightCycle(world)
    expect(world.gameOver).toBe(true)
    expect(world.nightReport?.outcome).toBe('lost')
    expect(world.nightReport?.reason).toContain('全员')
  })

  it('ends the game when the warehouse is destroyed', () => {
    const world = createInitialWorld()
    const warehouse = world.structures.find((entry) => entry.definitionId === 'warehouse')
    if (!warehouse) throw new Error('missing warehouse')
    demolishStructure(world, warehouse.id, false)
    world.time.phase = 'night'
    stepNightCycle(world)
    expect(world.gameOver).toBe(true)
    expect(world.nightReport?.reason).toContain('仓库')
  })

  it('spawns a night horde once per night and posts defenders', () => {
    const world = createInitialWorld()
    world.time.daySeconds = 60 + 11 * 60 + 90
    world.time.phase = 'night'
    stepNightCycle(world)
    expect(world.enemies.length).toBeGreaterThan(20)
    expect(world.nightPosts).toHaveLength(4)
    expect(world.nightPosts.every((post) => post.rangeBonus > 0)).toBe(true)
    expect(world.nightPosts.some((post) => post.occupantId !== null)).toBe(true)
    const count = world.enemies.length
    stepNightCycle(world)
    expect(world.enemies.length).toBe(count)
  })

  it('auto locks and fires for a possessed survivor without a click', () => {
    const world = createInitialWorld()
    possessSurvivor(world, 'hunter')
    const hunter = findSurvivor(world, 'hunter')
    if (!hunter) throw new Error('missing hunter')
    hunter.equipment.weapon = 'rifle'
    hunter.ammo = 10
    hunter.facingYaw = Math.PI
    world.enemies.push(createEnemy('wanderer', { x: hunter.position.x, y: 0, z: hunter.position.z + 6 }, 'auto-lock'))
    stepWorld(world, 1 / 30)
    expect(world.projectiles.length).toBeGreaterThan(0)
    expect(hunter.facingYaw).toBeCloseTo(0, 1)
    expect(world.projectiles[0]?.weaponId).toBe(equippedWeapon(hunter)?.id)
  })

  it('sends field workers walking home at dusk instead of teleporting them', () => {
    const world = createInitialWorld()
    const fisher = findSurvivor(world, 'fisher')
    const warehouse = world.containers.find((entry) => entry.kind === 'warehouse')
    if (!fisher || !warehouse) throw new Error('missing fisher')
    fisher.position = { x: -55, y: 0, z: 32 }
    fisher.workerState = 'Work'
    fisher.destination = null
    fisher.path = []
    world.lastPhase = 'day'
    world.time.daySeconds = DAY_END
    world.time.phase = 'dusk'
    const start = { x: fisher.position.x, z: fisher.position.z }
    const homeDist = distanceXZ(fisher.position, warehouse.position)
    for (let i = 0; i < 30; i += 1) stepWorld(world, 1 / 30)
    expect(fisher.workerState).toBe('ReturnToBase')
    expect(fisher.position.y).toBe(0)
    const moved = Math.hypot(fisher.position.x - start.x, fisher.position.z - start.z)
    expect(moved).toBeGreaterThan(0.4)
    expect(moved).toBeLessThan(fisher.moveSpeed * 1.2 + 0.5)
    expect(distanceXZ(fisher.position, warehouse.position)).toBeGreaterThan(homeDist - moved - 1)
    expect(distanceXZ(fisher.position, warehouse.position)).toBeGreaterThan(20)
  })

  it('keeps late field workers on the road at night instead of snapping them onto a tower', () => {
    const world = createInitialWorld()
    const fisher = findSurvivor(world, 'fisher')
    if (!fisher) throw new Error('missing fisher')
    fisher.position = { x: -55, y: 0, z: 32 }
    fisher.workerState = 'Work'
    fisher.destination = null
    fisher.path = []
    fisher.nightPostId = null
    world.lastPhase = 'dusk'
    world.time.daySeconds = DUSK_END
    world.time.phase = 'dusk'
    stepWorld(world, 1 / 30)
    expect(world.time.phase).toBe('night')
    expect(fisher.position.y).toBe(0)
    expect(fisher.workerState).toBe('ReturnToBase')
    expect(Math.abs(fisher.position.x + 55)).toBeLessThan(3)
  })

  it('keeps auto-aim on the enemy while the player walks sideways', () => {
    const world = createInitialWorld()
    possessSurvivor(world, 'hunter')
    const hunter = findSurvivor(world, 'hunter')
    if (!hunter) throw new Error('missing hunter')
    hunter.equipment.weapon = 'rifle'
    hunter.ammo = 10
    const enemy = createEnemy('wanderer', { x: hunter.position.x, y: 0, z: hunter.position.z + 8 }, 'side-lock')
    world.enemies.push(enemy)
    stepWorld(world, 1 / 30, { wishX: 1, wishZ: 0, faceX: null, faceZ: null, yawDelta: 0 })
    const expected = Math.atan2(enemy.position.x - hunter.position.x, enemy.position.z - hunter.position.z)
    expect(hunter.facingYaw).toBeCloseTo(expected, 5)
    expect(Math.abs(hunter.facingYaw - Math.PI / 2)).toBeGreaterThan(0.4)
  })

  it('puts a night watcher on the tower top and locks onto an enemy', () => {
    const world = createInitialWorld()
    const hunter = findSurvivor(world, 'fisher')
    const post = world.nightPosts[0]
    if (!hunter || !post) throw new Error('missing fisher or post')
    hunter.equipment.weapon = 'rifle'
    hunter.nightPostId = post.id
    hunter.position = { x: post.position.x, y: 0, z: post.position.z }
    hunter.facingYaw = 0
    world.time.phase = 'night'
    world.enemies.push(createEnemy('wanderer', { x: post.position.x, y: 0, z: post.position.z + 12 }, 'lock'))
    stepNightDefender(world, hunter, 1 / 30)
    expect(hunter.position.y).toBeCloseTo(TOWER_STAND_HEIGHT, 5)
    expect(world.projectiles.length).toBeGreaterThan(0)
  })

  it('lets the player appoint a survivor to a watchtower', () => {
    const world = createInitialWorld()
    const post = world.nightPosts[0]
    if (!post) throw new Error('missing post')
    expect(assignWatch(world, post.id, 'builder')).toBe(true)
    const builder = findSurvivor(world, 'builder')
    expect(builder?.watchPostId).toBe(post.id)
    expect(builder?.dayAssignment).toBe('watch')
    expect(post.occupantId).toBe('builder')
  })

  it('extends fire range when a survivor stands on a watchtower post', () => {
    const world = createInitialWorld()
    const hunter = findSurvivor(world, 'hunter')
    const post = world.nightPosts[0]
    if (!hunter || !post) throw new Error('missing hunter or post')
    hunter.equipment.weapon = 'rifle'
    hunter.nightPostId = post.id
    hunter.position = { ...post.position }
    expect(towerRangeBonus(world, hunter)).toBeGreaterThan(10)
    expect(tryShoot(world, hunter)).toBe(true)
    expect(world.projectiles[0]?.range).toBeGreaterThan(40)
  })

  it('lets enemies break a damaged wall', () => {
    const world = createInitialWorld()
    const west = worldToCell(world.nav, { x: BASE.west, y: 0, z: 0 })
    const wall = world.structures.find(
      (structure) =>
        structure.kind === 'wall' &&
        structure.stage === 'complete' &&
        structure.cells.some((cell) => cell.x === west.x && cell.z === west.z),
    )
    if (!wall || !wall.cells[0]) throw new Error('missing wall')
    wall.hp = 10
    const point = cellCenter(world.nav, west)
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
