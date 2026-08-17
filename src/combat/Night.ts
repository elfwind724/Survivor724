import { repairStructure } from '@/base/construction'
import { NIGHT_HORDE } from '@/data/enemies'
import { equippedWeapon } from '@/data/weapons'
import { countItem, inventoryOf, removeItem } from '@/inventory/Inventory'
import { cellCenter } from '@/navigation/NavGrid'
import { findContainer } from '@/simulation/EntityRegistry'
import { BASE } from '@/simulation/baseLayout'
import { distanceXZ, type NightPost, type StructureState, type SurvivorState, type WorldState } from '@/simulation/types'
import { equipItem } from '@/survivors/Equipment'
import { beginTravel, followTravel } from '@/navigation/Travel'
import { createEnemy, tryShoot } from './Combat'

export function rebuildNightPosts(world: WorldState): void {
  const posts: NightPost[] = []
  let index = 0
  for (let x = BASE.west + 6; x <= BASE.east - 6; x += 8) {
    posts.push({ id: `post-s-${index}`, sector: 'south', position: { x, y: 0, z: BASE.south + 2 }, facingYaw: Math.PI, occupantId: null })
    index += 1
  }
  for (let x = BASE.west + 4; x <= BASE.east - 4; x += 6) {
    posts.push({ id: `post-n-${index}`, sector: 'north', position: { x, y: 0, z: BASE.north - 1.5 }, facingYaw: 0, occupantId: null })
    index += 1
  }
  for (let z = BASE.south + 6; z <= BASE.north - 6; z += 8) {
    posts.push({ id: `post-e-${index}`, sector: 'east', position: { x: BASE.east - 1.5, y: 0, z }, facingYaw: Math.PI / 2, occupantId: null })
    index += 1
    posts.push({ id: `post-w-${index}`, sector: 'west', position: { x: BASE.west + 1.5, y: 0, z }, facingYaw: -Math.PI / 2, occupantId: null })
    index += 1
  }
  world.nightPosts = posts
}

export function stepNightCycle(world: WorldState): void {
  const phase = world.time.phase
  if (phase === 'night' && world.nightSpawnedDay !== world.time.dayIndex) {
    spawnHorde(world)
    assignNightPosts(world)
    issueNightAmmo(world)
    issueNightGuns(world)
    world.nightSpawnedDay = world.time.dayIndex
  }
  if (phase === 'dawn' && world.lastPhase !== 'dawn') {
    world.enemies = []
    for (const post of world.nightPosts) post.occupantId = null
    for (const survivor of world.survivors) survivor.nightPostId = null
  }
  world.lastPhase = phase
}

export function stepNightDefender(world: WorldState, survivor: SurvivorState, dt: number): void {
  if (survivor.downed) return
  if (restockNightAmmo(world, survivor, dt)) return
  const closeThreat = nearestEnemy(world, survivor.position, 10)
  if (!closeThreat && rescueDowned(world, survivor, dt)) return
  if (!closeThreat && repairDamagedWall(world, survivor, dt)) return
  const post = world.nightPosts.find((entry) => entry.id === survivor.nightPostId) ?? assignOnePost(world, survivor)
  if (!post) return
  if (distanceXZ(survivor.position, post.position) > 1.4) {
    if (!survivor.destination) beginTravel(world, survivor, post.position)
    followTravel(world, survivor, dt)
    return
  }

  const enemy = nearestEnemy(world, survivor.position, 30)
  if (enemy) {
    const dx = enemy.position.x - survivor.position.x
    const dz = enemy.position.z - survivor.position.z
    survivor.facingYaw = Math.atan2(dx, dz)
    tryShoot(world, survivor)
    return
  }
  survivor.facingYaw = post.facingYaw
}

function spawnHorde(world: WorldState): void {
  let serial = 0
  for (let i = 0; i < NIGHT_HORDE.wanderers; i += 1) {
    world.enemies.push(createEnemy('wanderer', edgePoint(i), `wanderer-${world.time.dayIndex}-${serial}`))
    serial += 1
  }
  for (let i = 0; i < NIGHT_HORDE.runners; i += 1) {
    world.enemies.push(createEnemy('runner', edgePoint(i + 8), `runner-${world.time.dayIndex}-${serial}`))
    serial += 1
  }
}

function edgePoint(seed: number) {
  const lane = seed % 3
  if (lane === 0) return { x: -20 + (seed % 5) * 8, y: 0, z: 58 }
  if (lane === 1) return { x: 58, y: 0, z: -10 + (seed % 4) * 8 }
  return { x: -58, y: 0, z: -8 + (seed % 4) * 8 }
}

function assignNightPosts(world: WorldState): void {
  for (const post of world.nightPosts) post.occupantId = null
  for (const survivor of world.survivors) {
    if (survivor.downed) continue
    assignOnePost(world, survivor)
  }
}

function assignOnePost(world: WorldState, survivor: SurvivorState): NightPost | undefined {
  const focus = world.defenseSectors.find((entry) => entry.order === 'reinforce')?.id
  const open = world.nightPosts
    .filter((post) => post.occupantId === null || post.occupantId === survivor.id)
    .sort((a, b) => {
      if (focus) {
        if (a.sector === focus && b.sector !== focus) return -1
        if (b.sector === focus && a.sector !== focus) return 1
      }
      return distanceXZ(a.position, survivor.position) - distanceXZ(b.position, survivor.position)
    })
  const post = open[0]
  if (!post) return undefined
  post.occupantId = survivor.id
  survivor.nightPostId = post.id
  return post
}

export function assignedRescuer(world: WorldState, downed: SurvivorState): SurvivorState | undefined {
  return world.survivors
    .filter((entry) => !entry.downed && entry.id !== downed.id && entry.id !== world.player.controlledId)
    .sort((a, b) => distanceXZ(a.position, downed.position) - distanceXZ(b.position, downed.position))[0]
}

function rescueDowned(world: WorldState, survivor: SurvivorState, dt: number): boolean {
  const downed = world.survivors.find((entry) => entry.downed)
  if (!downed) return false
  const rescuer = assignedRescuer(world, downed)
  if (!rescuer || rescuer.id !== survivor.id) return false
  if (distanceXZ(survivor.position, downed.position) > 1.6) {
    if (!survivor.destination) beginTravel(world, survivor, downed.position)
    followTravel(world, survivor, dt)
    return true
  }
  survivor.destination = null
  survivor.path = []
  return true
}

function repairDamagedWall(world: WorldState, survivor: SurvivorState, dt: number): boolean {
  if (survivor.professionId !== 'builder' && !survivor.carriedTools.includes('hammer')) return false
  const wall = damagedWall(world)
  if (!wall?.cells[0]) return false
  const warehouse = findContainer(world, 'warehouse')
  if (!warehouse || countItem(inventoryOf(world.inventories, warehouse.inventoryId), 'wood') <= 0) return false
  const target = cellCenter(world.nav, wall.cells[0])
  if (distanceXZ(survivor.position, target) > 2.2) {
    survivor.workElapsed = 0
    if (!survivor.destination) beginTravel(world, survivor, target)
    followTravel(world, survivor, dt)
    return true
  }
  if (!repairStructure(world, wall, 16 * dt)) return false
  survivor.workElapsed += dt
  if (survivor.workElapsed >= 0.55) {
    survivor.workElapsed = 0
    removeItem(inventoryOf(world.inventories, warehouse.inventoryId), 'wood', 1)
  }
  return true
}

function damagedWall(world: WorldState): StructureState | undefined {
  return world.structures
    .filter((structure) => structure.kind === 'wall' && structure.stage === 'complete' && structure.hp < structure.maxHp)
    .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]
}

function restockNightAmmo(world: WorldState, survivor: SurvivorState, dt: number): boolean {
  if (survivor.ammo > 0) return false
  const warehouse = findContainer(world, 'warehouse')
  if (!warehouse) return false
  const stock = inventoryOf(world.inventories, warehouse.inventoryId)
  if (countItem(stock, 'ammo') <= 0) return false
  if (distanceXZ(survivor.position, warehouse.position) > 2) {
    if (!survivor.destination) beginTravel(world, survivor, warehouse.position)
    followTravel(world, survivor, dt)
    return true
  }
  const take = Math.min(12, countItem(stock, 'ammo'))
  if (take > 0 && removeItem(stock, 'ammo', take)) survivor.ammo += take
  const post = world.nightPosts.find((entry) => entry.id === survivor.nightPostId)
  if (post) beginTravel(world, survivor, post.position)
  return true
}

function issueNightGuns(world: WorldState): void {
  const order = ['pistol', 'revolver', 'smg', 'shotgun', 'rifle', 'sniper']
  for (const survivor of world.survivors) {
    if (survivor.downed || equippedWeapon(survivor)) continue
    for (const gun of order) {
      if (equipItem(world, survivor, gun)) break
    }
  }
}

function issueNightAmmo(world: WorldState): void {
  const warehouse = findContainer(world, 'warehouse')
  if (!warehouse) return
  const stock = inventoryOf(world.inventories, warehouse.inventoryId)
  for (const survivor of world.survivors) {
    if (survivor.downed || survivor.ammo >= 12) continue
    const need = 16 - survivor.ammo
    const take = Math.min(need, countItem(stock, 'ammo'))
    if (take <= 0) break
    removeItem(stock, 'ammo', take)
    survivor.ammo += take
  }
}

function nearestEnemy(world: WorldState, from: { x: number; z: number }, range: number) {
  let best = world.enemies[0]
  let bestDist = range
  let found = false
  for (const enemy of world.enemies) {
    const distance = Math.hypot(enemy.position.x - from.x, enemy.position.z - from.z)
    if (distance < bestDist) {
      best = enemy
      bestDist = distance
      found = true
    }
  }
  return found ? best : undefined
}
