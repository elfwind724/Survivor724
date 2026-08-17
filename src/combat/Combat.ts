import { damageStructure } from '@/base/construction'
import { ENEMY_DEFINITIONS } from '@/data/enemies'
import { derivedStats } from '@/data/equipment'
import { addItem, countItem, inventoryOf, removeItem } from '@/inventory/Inventory'
import { equippedWeapon, fireProfile, INFINITE_AMMO, magazineSize, muzzleOrigin, readMag, writeMag } from '@/data/weapons'
import { cellCenter, isBlocked, worldToCell } from '@/navigation/NavGrid'
import { lookXZ } from '@/controls/CameraWish'
import { findContainer } from '@/simulation/EntityRegistry'
import { grantXp } from '@/survivors/Progress'
import { cloneVec3, distanceXZ, type EnemyState, type ProjectileState, type StructureState, type SurvivorState, type Vec3, type WildlifeState, type WorldState } from '@/simulation/types'

const HIT_RADIUS = 0.78
const WILDLIFE_HIT_RADIUS = 0.92
const PROJECTILE_SUBSTEP = 0.42
const KILL_XP = { wanderer: 14, runner: 20, deer: 8 } as const

let projectileSerial = 0

export function tickCooldowns(world: WorldState, dt: number): void {
  for (const survivor of world.survivors) {
    if (survivor.fireCooldown > 0) survivor.fireCooldown = Math.max(0, survivor.fireCooldown - dt)
  }
  for (const enemy of world.enemies) {
    if (enemy.attackCooldown > 0) enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt)
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
  for (let index = 0; index < profile.pellets; index += 1) {
    const yaw = survivor.facingYaw + aimJitter + pelletSpread(index, profile.spread)
    const look = lookXZ(yaw)
    world.projectiles.push({
      id: `proj-${(projectileSerial += 1)}`,
      ownerId: survivor.id,
      weaponId: profile.weapon.id,
      position: cloneVec3(origin),
      velocity: { x: look.x * profile.speed, y: 0, z: look.z * profile.speed },
      damage: profile.damage,
      remaining: range,
      range,
    })
  }
  return true
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

export function harvestWildlife(world: WorldState, survivor: SurvivorState): boolean {
  if (survivor.downed) return false
  const bag = inventoryOf(world.inventories, survivor.inventoryId)
  const carcass = world.wildlife.find((entry) => !entry.alive && distanceXZ(entry.position, survivor.position) < 2)
  if (!carcass) return false
  if (!addItem(bag, 'raw_meat', 2)) return false
  world.wildlife = world.wildlife.filter((entry) => entry.id !== carcass.id)
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
        prey.health -= Math.max(1, definition.damage - defense)
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

export function stepWildlife(world: WorldState, dt: number): void {
  for (const animal of world.wildlife) {
    if (!animal.alive) continue
    animal.position.x += Math.sin(world.time.daySeconds + animal.position.z) * dt * 0.4
    animal.position.z += Math.cos(world.time.daySeconds + animal.position.x) * dt * 0.4
  }
}

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
  }
}

export function createDeer(id: string, position: Vec3): WildlifeState {
  return { id, kind: 'deer', position: cloneVec3(position), health: 28, alive: true }
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
    if (blockedByNav(world, shot.position) || impactTarget(world, shot, from)) return true
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
    if (hit.enemy.health <= 0) {
      if (owner) grantXp(owner, KILL_XP[hit.enemy.kind])
      world.enemies = world.enemies.filter((entry) => entry.id !== hit.enemy.id)
    }
    return true
  }
  hit.wildlife.health -= shot.damage
  if (hit.wildlife.health <= 0) {
    hit.wildlife.alive = false
    if (owner) grantXp(owner, KILL_XP.deer)
  }
  return true
}

function blockedByNav(world: WorldState, point: Vec3): boolean {
  return isBlocked(world.nav, worldToCell(world.nav, point))
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
