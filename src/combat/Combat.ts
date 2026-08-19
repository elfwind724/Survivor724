import { damageStructure } from '@/base/construction'
import { ENEMY_DEFINITIONS, sectorOfPoint } from '@/data/enemies'
import { statsOf } from '@/data/equipment'
import { addItem, canAdd, countItem, inventoryOf, removeItem } from '@/inventory/Inventory'
import { equippedWeapon, fireProfile, infiniteAmmo, magazineSize, muzzleOrigin, readMag, writeMag } from '@/data/weapons'
import { cellCenter, isBlocked, worldToCell } from '@/navigation/NavGrid'
import { lookXZ } from '@/controls/CameraWish'
import { findContainer } from '@/simulation/EntityRegistry'
import { WORK_XP } from '@/data/items'
import { maybeDropGear } from '@/data/loot'
import { extraYieldCount, skillDefenseBonus } from '@/data/skills'
import { grantSkillXp, grantXp, recordWorkYield } from '@/survivors/Progress'
import { markHarvested, nearestLivingWildlife, wildlifeKillXp, wildlifeYield } from '@/world/Wildlife'
import { cloneVec3, distanceXZ, type EnemyState, type ImpactState, type ProjectileState, type StructureState, type SurvivorState, type Vec3, type WildlifeState, type WorldState } from '@/simulation/types'

const HIT_RADIUS = 0.78
const WILDLIFE_HIT_RADIUS = 0.92
const PROJECTILE_SUBSTEP = 0.42
const KILL_XP = { wanderer: 14, runner: 20 } as const

let projectileSerial = 0
let impactSerial = 0

export function tickCooldowns(world: WorldState, dt: number): void {
  for (const survivor of world.survivors) {
    if (survivor.fireCooldown > 0) survivor.fireCooldown = Math.max(0, survivor.fireCooldown - dt)
  }
  for (const enemy of world.enemies) {
    if (enemy.attackCooldown > 0) enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt)
    if (enemy.hitFlash > 0) enemy.hitFlash = Math.max(0, enemy.hitFlash - dt)
  }
  if (world.impacts.length > 0) {
    const next: ImpactState[] = []
    for (const impact of world.impacts) {
      impact.life -= dt
      if (impact.life > 0) next.push(impact)
    }
    world.impacts = next
  }
}

export function tryShoot(world: WorldState, survivor: SurvivorState): boolean {
  if (survivor.downed || survivor.fireCooldown > 0) return false
  const profile = fireProfile(survivor, 0, world)
  if (!profile.weapon || profile.pellets <= 0) return false
  if (!infiniteAmmo(world)) {
    const mag = readMag(survivor, profile.weapon.id)
    if (mag < profile.ammoCost) return false
    writeMag(survivor, profile.weapon.id, mag - profile.ammoCost)
  }
  survivor.fireCooldown = profile.cooldown
  survivor.fireCooldownMax = profile.cooldown
  const aimJitter = (unitNoise(`${survivor.id}:${world.time.daySeconds.toFixed(2)}`) * 2 - 1) * profile.spread
  const origin = muzzleOrigin(survivor)
  const range = profile.range + towerRangeBonus(world, survivor)
  const aimed = nearestLivingEnemy(world, survivor.position, range)
    ?? nearestLivingWildlife(world, survivor.position, range)
  spawnImpact(world, 'muzzle', origin, 0.08)
  for (let index = 0; index < profile.pellets; index += 1) {
    const yaw = survivor.facingYaw + aimJitter + pelletSpread(index, profile.spread)
    const look = lookXZ(yaw)
    let vx = look.x * profile.speed
    let vy = 0
    let vz = look.z * profile.speed
    if (aimed) {
      const dx = aimed.position.x - origin.x
      const dy = ('alive' in aimed ? 0.7 : 0.95) - origin.y
      const dz = aimed.position.z - origin.z
      const len = Math.hypot(dx, dy, dz) || 1
      const side = pelletSpread(index, profile.spread)
      vx = (dx / len) * profile.speed + lookXZ(yaw + Math.PI / 2).x * side * 8
      vy = (dy / len) * profile.speed
      vz = (dz / len) * profile.speed + lookXZ(yaw + Math.PI / 2).z * side * 8
    }
    const roll = unitNoise(`${survivor.id}:dmg:${world.time.daySeconds.toFixed(3)}:${index}`)
    const span = Math.max(0, profile.maxDamage - profile.minDamage)
    let damage = Math.round(profile.minDamage + span * roll)
    const crit = roll > 1 - profile.critChance
    if (crit) damage = Math.round(damage * profile.critDamage)
    const status = profile.procs.includes('burn') ? 'burn'
      : profile.procs.includes('freeze') ? 'freeze'
        : profile.procs.includes('poison') ? 'poison'
          : profile.procs.includes('paralyze') ? 'paralyze'
            : null
    world.projectiles.push({
      id: `proj-${(projectileSerial += 1)}`,
      ownerId: survivor.id,
      weaponId: profile.weapon.id,
      position: cloneVec3(origin),
      velocity: { x: vx, y: vy, z: vz },
      damage,
      remaining: range,
      range,
      pierce: profile.procs.includes('pierce') ? 2 : 0,
      explode: profile.procs.includes('explode') ? 2.4 : 0,
      split: profile.procs.includes('split'),
      lightning: profile.procs.includes('lightning'),
      knockback: profile.knockback,
      charm: profile.charm,
      status,
      crit,
      hitIds: [],
    })
  }
  recordDayGunshot(world, survivor.position)
  return true
}

export function recordDayGunshot(world: WorldState, position: { x: number; z: number }): void {
  if (world.time.phase === 'night' || world.time.phase === 'aftermath') return
  world.dayGunshots += 1
  const sector = sectorOfPoint(position.x, position.z)
  world.dayNoise[sector] = (world.dayNoise[sector] ?? 0) + 1
}

export function nearestLivingEnemy(
  world: WorldState,
  from: { x: number; z: number },
  range: number,
): EnemyState | undefined {
  let best: EnemyState | undefined
  let bestDist = range
  for (const enemy of world.enemies) {
    if (enemy.health <= 0) continue
    const distance = Math.hypot(enemy.position.x - from.x, enemy.position.z - from.z)
    if (distance < bestDist) {
      best = enemy
      bestDist = distance
    }
  }
  return best
}

export function autoCombat(world: WorldState, survivor: SurvivorState): boolean {
  if (survivor.downed) return false
  const profile = fireProfile(survivor, 0, world)
  if (!profile.weapon) return false
  const range = profile.range + towerRangeBonus(world, survivor)
  const target = nearestLivingEnemy(world, survivor.position, range)
    ?? nearestLivingWildlife(world, survivor.position, range)
  if (!target) return false
  survivor.facingYaw = Math.atan2(target.position.x - survivor.position.x, target.position.z - survivor.position.z)
  return tryShoot(world, survivor)
}

export function towerRangeBonus(world: WorldState, survivor: SurvivorState): number {
  const post = world.nightPosts.find((entry) => entry.id === survivor.nightPostId)
  if (!post || post.rangeBonus <= 0) return 0
  if (distanceXZ(survivor.position, post.position) > 2.2) return 0
  return post.rangeBonus
}

export function stepProjectiles(world: WorldState, dt: number): void {
  if (world.projectiles.length === 0) return
  const next: ProjectileState[] = []
  for (const shot of world.projectiles) {
    if (!advanceProjectile(world, shot, dt)) next.push(shot)
  }
  world.projectiles = next
}

export function reloadWeapon(world: WorldState, survivor: SurvivorState): 'ok' | 'full' | 'no_gun' | 'no_stock' {
  const gun = equippedWeapon(survivor)
  if (!gun) return 'no_gun'
  const have = readMag(survivor, gun.id)
  const cap = magazineSize(gun.id)
  if (have >= cap) return 'full'
  const warehouse = findContainer(world, 'warehouse')
  if (!warehouse) return 'no_stock'
  const stock = inventoryOf(world.inventories, warehouse.inventoryId)
  const take = Math.min(cap - have, countItem(stock, 'ammo'))
  if (take <= 0) return 'no_stock'
  if (!removeItem(stock, 'ammo', take)) return 'no_stock'
  writeMag(survivor, gun.id, have + take)
  survivor.fireCooldown = Math.max(survivor.fireCooldown, 0.55)
  survivor.fireCooldownMax = Math.max(survivor.fireCooldownMax, 0.55)
  return 'ok'
}

export const BUTCHER_SECONDS = 3.2

export function nearestCarcass(
  world: WorldState,
  from: { x: number; z: number },
  range: number,
): WildlifeState | undefined {
  let best: WildlifeState | undefined
  let bestDist = range
  for (const animal of world.wildlife) {
    if (animal.alive || animal.harvested) continue
    const distance = Math.hypot(animal.position.x - from.x, animal.position.z - from.z)
    if (distance < bestDist) {
      best = animal
      bestDist = distance
    }
  }
  return best
}

export function butcherWildlife(world: WorldState, survivor: SurvivorState, dt: number): 'none' | 'working' | 'done' {
  if (survivor.downed) return 'none'
  const carcass = nearestCarcass(world, survivor.position, 1.8)
  if (!carcass) return 'none'
  const dx = carcass.position.x - survivor.position.x
  const dz = carcass.position.z - survivor.position.z
  if (Math.hypot(dx, dz) > 0.001) survivor.facingYaw = Math.atan2(dx, dz)
  carcass.butcherElapsed += dt * statsOf(survivor).workRate
  if (carcass.butcherElapsed < BUTCHER_SECONDS) return 'working'
  return harvestWildlife(world, survivor) ? 'done' : 'working'
}

export function harvestWildlife(world: WorldState, survivor: SurvivorState): boolean {
  if (survivor.downed) return false
  const bag = inventoryOf(world.inventories, survivor.inventoryId)
  const carcass = nearestCarcass(world, survivor.position, 2.2)
  if (!carcass || carcass.butcherElapsed < BUTCHER_SECONDS) return false
  const yieldOf = wildlifeYield(carcass.kind)
  const meat = yieldOf.meat + extraYieldCount(survivor, 'hunt', carcass.id)
  const hide = yieldOf.hide
  const bone = yieldOf.bone
  if (!canAdd(bag, meat + hide + bone)) return false
  if (meat > 0) addItem(bag, 'raw_meat', meat)
  if (hide > 0) addItem(bag, 'hide', hide)
  if (bone > 0) addItem(bag, 'bone', bone)
  markHarvested(carcass)
  recordWorkYield(world, survivor, 'raw_meat', meat, WORK_XP.hunt ?? 6, 'hunt')
  return true
}

export function stepEnemies(world: WorldState, dt: number): void {
  const warehouse = findContainer(world, 'warehouse')
  const goal = warehouse?.position ?? { x: 0, y: 0, z: 0 }
  for (const enemy of world.enemies) {
    if (enemy.paralyze > 0) continue
    const prey = nearestLivingSurvivor(world, enemy.position, 18)
    const flee = enemy.charm > 0
    const target = flee
      ? { x: enemy.position.x * 2 - (prey?.position.x ?? 0), z: enemy.position.z * 2 - (prey?.position.z ?? 0) }
      : prey && distanceXZ(prey.position, enemy.position) < 22 ? prey.position : goal
    const dx = target.x - enemy.position.x
    const dz = target.z - enemy.position.z
    const distance = Math.hypot(dx, dz)
    if (distance > 0.001) enemy.facingYaw = Math.atan2(dx, dz)
    const definition = ENEMY_DEFINITIONS[enemy.kind]
    if (enemy.freeze > 0 || flee) {
      if (distance > 0.2) {
        const slow = enemy.freeze > 0 ? 0.35 : 1
        slideMove(world, enemy.position, (dx / distance) * enemy.moveSpeed * dt * slow, (dz / distance) * enemy.moveSpeed * dt * slow)
      }
      continue
    }
    if (prey && distance <= definition.attackRange) {
      if (enemy.attackCooldown <= 0 && !prey.downed) {
        const defense = statsOf(prey).defense
        prey.health -= Math.max(1, definition.damage - defense - skillDefenseBonus(prey))
        enemy.attackCooldown = definition.attackCooldown
        if (prey.health <= 0) {
          prey.health = 0
          prey.downed = true
        }
      }
      continue
    }
    const wall = adjacentStructure(world, enemy.position)
    if (wall && (!prey || distance > 3)) {
      if (enemy.attackCooldown <= 0) {
        enemy.attackCooldown = definition.attackCooldown
        damageStructure(world, wall, definition.damage + 6)
      }
      continue
    }
    if (distance < 0.2) continue
    const step = enemy.moveSpeed * dt
    slideMove(world, enemy.position, (dx / distance) * step, (dz / distance) * step)
  }
}

export function stepRevive(world: WorldState, dt: number): void {
  for (const downed of world.survivors) {
    if (!downed.downed) continue
    const helper = world.survivors.find(
      (entry) => !entry.downed && entry.id !== downed.id && distanceXZ(entry.position, downed.position) < 1.8,
    )
    if (!helper) continue
    downed.health = Math.min(40, downed.health + 12 * dt)
    if (downed.health >= 30) downed.downed = false
  }
}

export { createDeer, stepWildlife } from '@/world/Wildlife'

export function createEnemy(kind: EnemyState['kind'], position: Vec3, id: string): EnemyState {
  const definition = ENEMY_DEFINITIONS[kind]
  return {
    id,
    kind,
    position: cloneVec3(position),
    health: definition.health,
    moveSpeed: definition.moveSpeed,
    facingYaw: 0,
    attackCooldown: 0,
    hitFlash: 0,
    burn: 0,
    freeze: 0,
    poison: 0,
    paralyze: 0,
    charm: 0,
  }
}

function advanceProjectile(world: WorldState, shot: ProjectileState, dt: number): boolean {
  const speed = Math.hypot(shot.velocity.x, shot.velocity.z)
  if (speed < 0.01 || shot.remaining <= 0) return true
  const travel = Math.min(speed * dt, shot.remaining)
  const slices = Math.max(1, Math.ceil(travel / PROJECTILE_SUBSTEP))
  const step = travel / slices
  const dirX = shot.velocity.x / speed
  const dirZ = shot.velocity.z / speed
  for (let i = 0; i < slices; i += 1) {
    const from = cloneVec3(shot.position)
    shot.position.x += dirX * step
    shot.position.z += dirZ * step
    shot.remaining -= step
    if (impactTarget(world, shot, from)) return true
    if (shot.remaining <= 0) return true
  }
  return false
}

function impactTarget(world: WorldState, shot: ProjectileState, from: Vec3): boolean {
  let bestDist = Number.POSITIVE_INFINITY
  let hit: { kind: 'enemy'; enemy: EnemyState } | { kind: 'wildlife'; wildlife: WildlifeState } | null = null
  for (const enemy of world.enemies) {
    const distance = distToSegment(from, shot.position, enemy.position)
    if (distance > HIT_RADIUS || distance >= bestDist) continue
    bestDist = distance
    hit = { kind: 'enemy', enemy }
  }
  for (const wildlife of world.wildlife) {
    if (!wildlife.alive) continue
    const distance = distToSegment(from, shot.position, wildlife.position)
    if (distance > WILDLIFE_HIT_RADIUS || distance >= bestDist) continue
    bestDist = distance
    hit = { kind: 'wildlife', wildlife }
  }
  if (!hit) return false
  const targetId = hit.kind === 'enemy' ? hit.enemy.id : hit.wildlife.id
  if (shot.hitIds.includes(targetId)) return false
  shot.hitIds.push(targetId)
  const owner = world.survivors.find((entry) => entry.id === shot.ownerId)
  const point = hit.kind === 'enemy' ? hit.enemy.position : hit.wildlife.position
  if (hit.kind === 'enemy') {
    applyShotToEnemy(world, shot, hit.enemy)
    spawnImpact(world, hit.enemy.health <= 0 ? 'kill' : shot.crit ? 'hit' : 'hit', { x: point.x, y: 1.35, z: point.z }, 0.22)
    if (hit.enemy.health <= 0) {
      if (owner) {
        grantXp(owner, KILL_XP[hit.enemy.kind])
        grantSkillXp(owner, 'marksmanship', 6)
        grantSkillXp(owner, 'combat', 5)
        maybeDropGear(world, owner, `${hit.enemy.id}:${owner.id}`, hit.enemy.kind, point)
      }
      world.nightKills += 1
      world.enemies = world.enemies.filter((entry) => entry.id !== hit.enemy.id)
    }
  } else {
    hit.wildlife.health -= shot.damage
    spawnImpact(world, 'hit', { x: point.x, y: 1.1, z: point.z }, 0.18)
    if (hit.wildlife.health <= 0) {
      hit.wildlife.alive = false
      if (owner) {
        grantXp(owner, wildlifeKillXp(hit.wildlife.kind))
        grantSkillXp(owner, 'marksmanship', 5)
        grantSkillXp(owner, 'hunt', 4)
        maybeDropGear(world, owner, `${hit.wildlife.id}:${owner.id}`, 'wildlife', point)
      }
    }
  }
  if (shot.explode > 0) explodeAt(world, shot, point)
  if (shot.lightning) chainLightning(world, shot, point)
  if (shot.split) splitShot(world, shot)
  if (shot.pierce > 0) {
    shot.pierce -= 1
    return false
  }
  return true
}

function applyShotToEnemy(world: WorldState, shot: ProjectileState, enemy: EnemyState): void {
  enemy.health -= shot.damage
  enemy.hitFlash = 0.18
  if (shot.knockback > 0) {
    const dx = enemy.position.x - shot.position.x
    const dz = enemy.position.z - shot.position.z
    const len = Math.hypot(dx, dz) || 1
    enemy.position.x += (dx / len) * shot.knockback
    enemy.position.z += (dz / len) * shot.knockback
  }
  if (shot.status === 'burn') enemy.burn = Math.max(enemy.burn, 2.8)
  if (shot.status === 'freeze') enemy.freeze = Math.max(enemy.freeze, 1.6)
  if (shot.status === 'poison') enemy.poison = Math.max(enemy.poison, 3.2)
  if (shot.status === 'paralyze') enemy.paralyze = Math.max(enemy.paralyze, 1.1)
  if (shot.charm > 0 && unitNoise(`${enemy.id}:charm:${shot.id}`) < shot.charm) enemy.charm = Math.max(enemy.charm, 2.2)
}

function explodeAt(world: WorldState, shot: ProjectileState, point: Vec3): void {
  for (const enemy of world.enemies) {
    if (shot.hitIds.includes(enemy.id)) continue
    if (distanceXZ(enemy.position, point) > shot.explode) continue
    enemy.health -= Math.max(1, Math.round(shot.damage * 0.45))
    enemy.hitFlash = 0.14
    if (enemy.health <= 0) {
      world.nightKills += 1
      world.enemies = world.enemies.filter((entry) => entry.id !== enemy.id)
    }
  }
}

function chainLightning(world: WorldState, shot: ProjectileState, point: Vec3): void {
  const next = nearestLivingEnemy(world, point, 8)
  if (!next || shot.hitIds.includes(next.id)) return
  next.health -= Math.max(1, Math.round(shot.damage * 0.55))
  next.hitFlash = 0.16
  spawnImpact(world, 'hit', { x: next.position.x, y: 1.35, z: next.position.z }, 0.16)
}

function splitShot(world: WorldState, shot: ProjectileState): void {
  if (shot.hitIds.length > 1) return
  const speed = Math.hypot(shot.velocity.x, shot.velocity.z) || 1
  for (const side of [-0.4, 0.4]) {
    const yaw = Math.atan2(shot.velocity.x, shot.velocity.z) + side
    const look = lookXZ(yaw)
    world.projectiles.push({
      ...shot,
      id: `proj-${(projectileSerial += 1)}`,
      velocity: { x: look.x * speed, y: shot.velocity.y, z: look.z * speed },
      damage: Math.max(1, Math.round(shot.damage * 0.55)),
      remaining: shot.range * 0.45,
      range: shot.range * 0.45,
      split: false,
      pierce: 0,
      explode: 0,
      hitIds: [...shot.hitIds],
    })
  }
}

export function stepAilments(world: WorldState, dt: number): void {
  for (const enemy of [...world.enemies]) {
    if (enemy.burn > 0) {
      enemy.health -= 7 * dt
      enemy.burn -= dt
    }
    if (enemy.poison > 0) {
      enemy.health -= 4 * dt
      enemy.poison -= dt
    }
    if (enemy.freeze > 0) enemy.freeze -= dt
    if (enemy.paralyze > 0) enemy.paralyze -= dt
    if (enemy.charm > 0) enemy.charm -= dt
    if (enemy.health > 0) continue
    world.nightKills += 1
    world.enemies = world.enemies.filter((entry) => entry.id !== enemy.id)
  }
}

function spawnImpact(world: WorldState, kind: ImpactState['kind'], position: Vec3, life: number): void {
  world.impacts.push({
    id: `fx-${(impactSerial += 1)}`,
    kind,
    position: cloneVec3(position),
    life,
    maxLife: life,
  })
}

function distToSegment(from: Vec3, to: Vec3, point: Vec3): number {
  const vx = to.x - from.x
  const vz = to.z - from.z
  const length2 = vx * vx + vz * vz
  if (length2 < 1e-8) return Math.hypot(point.x - from.x, point.z - from.z)
  const t = Math.max(0, Math.min(1, ((point.x - from.x) * vx + (point.z - from.z) * vz) / length2))
  return Math.hypot(point.x - (from.x + vx * t), point.z - (from.z + vz * t))
}

function pelletSpread(index: number, spread: number): number {
  if (index === 0) return 0
  const ring = Math.ceil(index / 2)
  return (index % 2 === 0 ? 1 : -1) * ring * spread
}

function unitNoise(seed: string): number {
  let hash = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return ((hash >>> 0) % 10_000) / 10_000
}

function nearestLivingSurvivor(world: WorldState, from: Vec3, range: number): SurvivorState | undefined {
  let best: SurvivorState | undefined
  let bestDist = range
  for (const survivor of world.survivors) {
    if (survivor.downed) continue
    const distance = distanceXZ(survivor.position, from)
    if (distance < bestDist) {
      best = survivor
      bestDist = distance
    }
  }
  return best
}

function adjacentStructure(world: WorldState, from: Vec3): StructureState | undefined {
  let best: StructureState | undefined
  let bestDist = 2.1
  for (const structure of world.structures) {
    if (structure.stage !== 'complete' || structure.kind === 'building') continue
    const first = structure.cells[0]
    if (!first) continue
    const point = cellCenter(world.nav, first)
    const distance = distanceXZ(from, point)
    if (distance < bestDist) {
      best = structure
      bestDist = distance
    }
  }
  return best
}

function slideMove(world: WorldState, position: Vec3, dx: number, dz: number): void {
  const nextX = { x: position.x + dx, y: 0, z: position.z }
  if (!isBlocked(world.nav, worldToCell(world.nav, nextX))) position.x = nextX.x
  const nextZ = { x: position.x, y: 0, z: position.z + dz }
  if (!isBlocked(world.nav, worldToCell(world.nav, nextZ))) position.z = nextZ.z
}
