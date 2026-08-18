import { damageStructure } from '@/base/construction'
import { ENEMY_DEFINITIONS } from '@/data/enemies'
import { derivedStats } from '@/data/equipment'
import { addItem, countItem, inventoryOf, removeItem } from '@/inventory/Inventory'
import { equippedWeapon, fireProfile, INFINITE_AMMO, magazineSize, muzzleOrigin, readMag, writeMag } from '@/data/weapons'
import { cellCenter, isBlocked, worldToCell } from '@/navigation/NavGrid'
import { lookXZ } from '@/controls/CameraWish'
import { findContainer } from '@/simulation/EntityRegistry'
import { WORK_XP } from '@/data/items'
import { extraYieldCount, skillDefenseBonus } from '@/data/skills'
import { grantSkillXp, grantXp, recordWorkYield } from '@/survivors/Progress'
import { markHarvested, nearestLivingWildlife, wildlifeKillXp, wildlifeMeat } from '@/world/Wildlife'
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
  const profile = fireProfile(survivor)
  if (!profile.weapon || profile.pellets <= 0) return false
  if (!INFINITE_AMMO) {
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
    world.projectiles.push({
      id: `proj-${(projectileSerial += 1)}`,
      ownerId: survivor.id,
      weaponId: profile.weapon.id,
      position: cloneVec3(origin),
      velocity: { x: vx, y: vy, z: vz },
      damage: profile.damage,
      remaining: range,
      range,
    })
  }
  return true
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
  const profile = fireProfile(survivor)
  if (!profile.weapon) return false
  const enemy = nearestLivingEnemy(world, survivor.position, profile.range + towerRangeBonus(world, survivor))
  if (!enemy) return false
  survivor.facingYaw = Math.atan2(enemy.position.x - survivor.position.x, enemy.position.z - survivor.position.z)
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
  carcass.butcherElapsed += dt * derivedStats(survivor.attributes, survivor.equipment).workRate
  if (carcass.butcherElapsed < BUTCHER_SECONDS) return 'working'
  return harvestWildlife(world, survivor) ? 'done' : 'working'
}

export function harvestWildlife(world: WorldState, survivor: SurvivorState): boolean {
  if (survivor.downed) return false
  const bag = inventoryOf(world.inventories, survivor.inventoryId)
  const carcass = nearestCarcass(world, survivor.position, 2.2)
  if (!carcass || carcass.butcherElapsed < BUTCHER_SECONDS) return false
  const meat = wildlifeMeat(carcass.kind) + extraYieldCount(survivor, 'hunt', carcass.id)
  if (!addItem(bag, 'raw_meat', meat)) return false
  markHarvested(carcass)
  recordWorkYield(world, survivor, 'raw_meat', meat, WORK_XP.hunt ?? 6, 'hunt')
  return true
}

export function stepEnemies(world: WorldState, dt: number): void {
  const warehouse = findContainer(world, 'warehouse')
  const goal = warehouse?.position ?? { x: 0, y: 0, z: 0 }
  for (const enemy of world.enemies) {
    const prey = nearestLivingSurvivor(world, enemy.position, 18)
    const target = prey && distanceXZ(prey.position, enemy.position) < 22 ? prey.position : goal
    const dx = target.x - enemy.position.x
    const dz = target.z - enemy.position.z
    const distance = Math.hypot(dx, dz)
    if (distance > 0.001) enemy.facingYaw = Math.atan2(dx, dz)
    const definition = ENEMY_DEFINITIONS[enemy.kind]
    if (prey && distance <= definition.attackRange) {
      if (enemy.attackCooldown <= 0 && !prey.downed) {
        const defense = derivedStats(prey.attributes, prey.equipment).defense
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
  const owner = world.survivors.find((entry) => entry.id === shot.ownerId)
  if (hit.kind === 'enemy') {
    hit.enemy.health -= shot.damage
    hit.enemy.hitFlash = 0.18
    spawnImpact(world, hit.enemy.health <= 0 ? 'kill' : 'hit', { x: hit.enemy.position.x, y: 1.35, z: hit.enemy.position.z }, 0.22)
    if (hit.enemy.health <= 0) {
      if (owner) {
        grantXp(owner, KILL_XP[hit.enemy.kind])
        grantSkillXp(owner, 'marksmanship', 6)
        grantSkillXp(owner, 'combat', 5)
      }
      world.nightKills += 1
      world.enemies = world.enemies.filter((entry) => entry.id !== hit.enemy.id)
    }
    return true
  }
  hit.wildlife.health -= shot.damage
  spawnImpact(world, 'hit', { x: hit.wildlife.position.x, y: 1.1, z: hit.wildlife.position.z }, 0.18)
  if (hit.wildlife.health <= 0) {
    hit.wildlife.alive = false
    if (owner) {
      grantXp(owner, wildlifeKillXp(hit.wildlife.kind))
      grantSkillXp(owner, 'marksmanship', 5)
      grantSkillXp(owner, 'hunt', 4)
    }
  }
  return true
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
