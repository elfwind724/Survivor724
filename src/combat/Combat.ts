import { ENEMY_DEFINITIONS } from '@/data/enemies'
import { weaponForTools } from '@/data/weapons'
import { addItem, inventoryOf } from '@/inventory/Inventory'
import { isBlocked, worldToCell } from '@/navigation/NavGrid'
import { lookXZ } from '@/controls/CameraWish'
import { findContainer } from '@/simulation/EntityRegistry'
import { cloneVec3, distanceXZ, type EnemyState, type SurvivorState, type Vec3, type WildlifeState, type WorldState } from '@/simulation/types'

export function tickCooldowns(world: WorldState, dt: number): void {
  for (const survivor of world.survivors) {
    if (survivor.fireCooldown > 0) survivor.fireCooldown = Math.max(0, survivor.fireCooldown - dt)
  }
  for (const enemy of world.enemies) {
    if (enemy.attackCooldown > 0) enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt)
  }
}

export function tryShoot(world: WorldState, survivor: SurvivorState): boolean {
  if (survivor.downed || survivor.fireCooldown > 0 || survivor.ammo <= 0) return false
  const weapon = weaponForTools(survivor.carriedTools)
  survivor.fireCooldown = weapon.cooldown
  survivor.ammo -= 1
  const hit = rayHit(world, survivor.position, survivor.facingYaw, weapon.range)
  if (hit?.kind === 'enemy') {
    hit.enemy.health -= weapon.damage
    if (hit.enemy.health <= 0) world.enemies = world.enemies.filter((entry) => entry.id !== hit.enemy.id)
  }
  if (hit?.kind === 'wildlife') {
    hit.wildlife.health -= weapon.damage
    if (hit.wildlife.health <= 0) hit.wildlife.alive = false
  }
  return true
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
        prey.health -= definition.damage
        enemy.attackCooldown = definition.attackCooldown
        if (prey.health <= 0) {
          prey.health = 0
          prey.downed = true
        }
      }
      continue
    }
    if (distance < 0.2) continue
    const step = enemy.moveSpeed * dt
    slideMove(world, enemy.position, (dx / distance) * step, (dz / distance) * step)
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

function rayHit(world: WorldState, from: Vec3, yaw: number, range: number) {
  const look = lookXZ(yaw)
  let bestDist = range
  let best: { kind: 'enemy'; enemy: EnemyState } | { kind: 'wildlife'; wildlife: WildlifeState } | null = null
  for (const enemy of world.enemies) {
    const lateral = crossDistance(from, look, enemy.position)
    const along = alongDistance(from, look, enemy.position)
    if (along < 0.4 || along > range || lateral > 0.85 || along >= bestDist) continue
    bestDist = along
    best = { kind: 'enemy', enemy }
  }
  for (const wildlife of world.wildlife) {
    if (!wildlife.alive) continue
    const lateral = crossDistance(from, look, wildlife.position)
    const along = alongDistance(from, look, wildlife.position)
    if (along < 0.4 || along > range || lateral > 0.9 || along >= bestDist) continue
    bestDist = along
    best = { kind: 'wildlife', wildlife }
  }
  return best
}

function alongDistance(from: Vec3, look: { x: number; z: number }, point: Vec3): number {
  return (point.x - from.x) * look.x + (point.z - from.z) * look.z
}

function crossDistance(from: Vec3, look: { x: number; z: number }, point: Vec3): number {
  return Math.abs((point.x - from.x) * -look.z + (point.z - from.z) * look.x)
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

function slideMove(world: WorldState, position: Vec3, dx: number, dz: number): void {
  const nextX = { x: position.x + dx, y: 0, z: position.z }
  if (!isBlocked(world.nav, worldToCell(world.nav, nextX))) position.x = nextX.x
  const nextZ = { x: position.x, y: 0, z: position.z + dz }
  if (!isBlocked(world.nav, worldToCell(world.nav, nextZ))) position.z = nextZ.z
}
