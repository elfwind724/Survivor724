import { repairStructure } from '@/base/construction'
import { hordeCounts } from '@/data/enemies'
import { equippedWeapon, magazineSize, writeMag } from '@/data/weapons'
import { addItem, countItem, inventoryOf, removeItem } from '@/inventory/Inventory'
import { cellCenter } from '@/navigation/NavGrid'
import { findContainer } from '@/simulation/EntityRegistry'
import { BASE } from '@/simulation/baseLayout'
import { TOWER_STAND_HEIGHT } from '@/data/outdoorScenery'
import { distanceXZ, type NightLoot, type NightPost, type NightReport, type StructureState, type SurvivorState, type WorldState } from '@/simulation/types'
import { equipItem } from '@/survivors/Equipment'
import { beginTravel, followTravel } from '@/navigation/Travel'
import { isHero } from '@/controls/PlayerControl'
import { stepFollowHero } from '@/jobs/Follow'
import { autoCombat, createEnemy, nearestLivingEnemy } from './Combat'

export const TOWER_RANGE_BONUS = 16

export function rebuildNightPosts(world: WorldState): void {
  const towers = world.structures
    .filter((structure) => structure.definitionId === 'watchtower' && structure.stage === 'complete')
    .map((structure) => ({
      mid: structureMid(world, structure),
    }))
  const nw = pickTower(towers, (point) => -point.x + point.z) ?? { x: BASE.west + 3, y: 0, z: BASE.north - 3 }
  const ne = pickTower(towers, (point) => point.x + point.z) ?? { x: BASE.east - 3, y: 0, z: BASE.north - 3 }
  const se = pickTower(towers, (point) => point.x - point.z) ?? { x: BASE.east - 3, y: 0, z: BASE.south + 3 }
  const sw = pickTower(towers, (point) => -point.x - point.z) ?? { x: BASE.west + 3, y: 0, z: BASE.south + 3 }
  world.nightPosts = [
    { id: 'post-nw', sector: 'north', position: { x: nw.x, y: TOWER_STAND_HEIGHT, z: nw.z }, facingYaw: 0, occupantId: null, rangeBonus: TOWER_RANGE_BONUS },
    { id: 'post-ne', sector: 'east', position: { x: ne.x, y: TOWER_STAND_HEIGHT, z: ne.z }, facingYaw: Math.PI / 2, occupantId: null, rangeBonus: TOWER_RANGE_BONUS },
    { id: 'post-se', sector: 'south', position: { x: se.x, y: TOWER_STAND_HEIGHT, z: se.z }, facingYaw: Math.PI, occupantId: null, rangeBonus: TOWER_RANGE_BONUS },
    { id: 'post-sw', sector: 'west', position: { x: sw.x, y: TOWER_STAND_HEIGHT, z: sw.z }, facingYaw: -Math.PI / 2, occupantId: null, rangeBonus: TOWER_RANGE_BONUS },
  ]
}

function structureMid(world: WorldState, structure: StructureState) {
  const xs = structure.cells.map((cell) => cell.x)
  const zs = structure.cells.map((cell) => cell.z)
  return cellCenter(world.nav, {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    z: (Math.min(...zs) + Math.max(...zs)) / 2,
  })
}

function pickTower(
  towers: Array<{ mid: { x: number; y: number; z: number } }>,
  score: (point: { x: number; z: number }) => number,
) {
  let best = towers[0]?.mid
  let bestScore = best ? score(best) : Number.NEGATIVE_INFINITY
  for (const tower of towers) {
    const value = score(tower.mid)
    if (value > bestScore) {
      best = tower.mid
      bestScore = value
    }
  }
  return best
}

export function watchRangeBonus(world: WorldState, survivor: SurvivorState): number {
  const post = world.nightPosts.find((entry) => entry.id === survivor.nightPostId)
  if (!post || post.rangeBonus <= 0) return 0
  if (distanceXZ(survivor.position, post.position) > 2.2) return 0
  return post.rangeBonus
}

export function stepNightCycle(world: WorldState): void {
  const phase = world.time.phase
  if (phase === 'night' && world.nightSpawnedDay !== world.time.dayIndex) {
    spawnHorde(world)
    prepareNightDefense(world)
    world.nightSpawnedDay = world.time.dayIndex
  }
  if (phase === 'night') checkNightDefeat(world)
  if (phase === 'aftermath' && world.lastPhase === 'night') settleNight(world)
  if (phase === 'dawn' && world.lastPhase !== 'dawn') {
    world.enemies = []
    for (const post of world.nightPosts) post.occupantId = null
    for (const survivor of world.survivors) {
      survivor.nightPostId = survivor.watchPostId
      if (survivor.watchPostId) {
        const post = world.nightPosts.find((entry) => entry.id === survivor.watchPostId)
        if (post) post.occupantId = survivor.id
      }
      survivor.position.y = 0
    }
  }
  world.lastPhase = phase
}

export function nightLootFor(kills: number): NightLoot[] {
  const fallen = Math.max(0, kills)
  return [
    { itemId: 'wood', label: '木', count: 6 + fallen },
    { itemId: 'scrap', label: '铁', count: 3 + Math.floor(fallen / 2) },
    { itemId: 'ammo', label: '弹', count: 8 + fallen },
    { itemId: 'meal', label: '食', count: 2 + Math.floor(fallen / 6) },
  ]
}

export function defeatReason(world: WorldState): string | null {
  if (world.survivors.length > 0 && world.survivors.every((survivor) => survivor.downed)) return '全员倒下，据点没人能守了'
  if (!hasCore(world, 'warehouse')) return '仓库被毁，物资散尽'
  if (!hasCore(world, 'hall')) return '市政大厅被毁，指挥中枢没了'
  return null
}

export function checkNightDefeat(world: WorldState): boolean {
  if (world.gameOver) return true
  const reason = defeatReason(world)
  if (!reason) return false
  world.gameOver = true
  world.nightReport = makeReport(world, 'lost', reason)
  return true
}

export function settleNight(world: WorldState): NightReport {
  if (world.gameOver && world.nightReport) return world.nightReport
  if (checkNightDefeat(world) && world.nightReport) return world.nightReport
  const loot = nightLootFor(world.nightKills)
  const warehouse = findContainer(world, 'warehouse')
  if (warehouse) {
    const stock = inventoryOf(world.inventories, warehouse.inventoryId)
    for (const item of loot) addItem(stock, item.itemId, item.count)
  }
  for (const survivor of world.survivors) {
    if (survivor.downed) continue
    survivor.morale = Math.min(100, survivor.morale + 6)
  }
  const report = makeReport(world, 'won', '守住了这一夜，搜到的残骸进了仓库')
  report.loot = loot
  world.nightReport = report
  return report
}

function hasCore(world: WorldState, definitionId: string): boolean {
  return world.structures.some(
    (structure) =>
      structure.definitionId === definitionId &&
      (structure.stage === 'complete' || structure.stage === 'demolishing'),
  )
}

function makeReport(world: WorldState, outcome: 'won' | 'lost', reason: string): NightReport {
  const wallsNow = world.structures.filter((structure) => structure.kind === 'wall' && structure.stage === 'complete').length
  return {
    day: world.time.dayIndex,
    outcome,
    kills: world.nightKills,
    spawned: world.nightSpawned,
    downed: world.survivors.filter((survivor) => survivor.downed).length,
    wallsLost: Math.max(0, world.nightWalls - wallsNow),
    loot: [],
    reason,
  }
}

export function stepNightDefender(world: WorldState, survivor: SurvivorState, dt: number): void {
  if (survivor.downed || isHero(world, survivor)) return
  if (survivor.dayAssignment === 'follow') {
    stepFollowHero(world, survivor, dt)
    autoCombat(world, survivor)
    return
  }
  if (restockNightAmmo(world, survivor, dt)) return
  const closeThreat = nearestLivingEnemy(world, survivor.position, 10)
  if (!closeThreat && rescueDowned(world, survivor, dt)) return
  if (!closeThreat && repairDamagedWall(world, survivor, dt)) return
  const post = world.nightPosts.find((entry) => entry.id === survivor.nightPostId) ?? assignOnePost(world, survivor)
  if (!post) return
  if (distanceXZ(survivor.position, post.position) > 1.4) {
    survivor.position.y = 0
    if (!survivor.destination) beginTravel(world, survivor, post.position)
    followTravel(world, survivor, dt)
    autoCombat(world, survivor)
    return
  }

  survivor.position.y = post.position.y
  survivor.destination = null
  survivor.path = []

  if (autoCombat(world, survivor)) return
  survivor.facingYaw = post.facingYaw
}

export type HordeApproach = 'all' | 'north' | 'east' | 'south' | 'west'

export function spawnHordeWave(
  world: WorldState,
  counts: { wanderers: number; runners: number },
  approach: HordeApproach = 'all',
  replace = true,
): void {
  if (replace) {
    world.enemies = []
    world.nightKills = 0
    world.nightSpawned = 0
    world.nightWalls = world.structures.filter((structure) => structure.kind === 'wall' && structure.stage === 'complete').length
    world.nightReport = null
    world.gameOver = false
  }
  const wanderers = Math.max(0, Math.floor(counts.wanderers))
  const runners = Math.max(0, Math.floor(counts.runners))
  let serial = world.enemies.length
  for (let i = 0; i < wanderers; i += 1) {
    world.enemies.push(createEnemy('wanderer', edgePoint(i, approach), `wanderer-${world.time.dayIndex}-${serial}`))
    serial += 1
  }
  for (let i = 0; i < runners; i += 1) {
    world.enemies.push(createEnemy('runner', edgePoint(i + wanderers, approach), `runner-${world.time.dayIndex}-${serial}`))
    serial += 1
  }
  world.nightSpawned += wanderers + runners
}

function spawnHorde(world: WorldState): void {
  spawnHordeWave(world, hordeCounts(world.time.dayIndex), 'all', true)
}

export function edgePoint(seed: number, approach: HordeApproach = 'all') {
  const lane = approach === 'all' ? seed % 4 : approach === 'north' ? 0 : approach === 'east' ? 1 : approach === 'west' ? 2 : 3
  const slot = Math.floor(seed / (approach === 'all' ? 4 : 1))
  if (lane === 0) return { x: -28 + (slot % 8) * 8, y: 0, z: 64 + (slot % 3) * 4 }
  if (lane === 1) return { x: 64 + (slot % 3) * 4, y: 0, z: -28 + (slot % 8) * 8 }
  if (lane === 2) return { x: -64 - (slot % 3) * 4, y: 0, z: -28 + (slot % 8) * 8 }
  return { x: -28 + (slot % 8) * 8, y: 0, z: -64 - (slot % 3) * 4 }
}

export function prepareNightDefense(world: WorldState): void {
  assignNightPosts(world)
  issueNightAmmo(world)
  issueNightGuns(world)
}

function assignNightPosts(world: WorldState): void {
  for (const post of world.nightPosts) post.occupantId = null
  for (const survivor of world.survivors) {
    if (survivor.downed || isHero(world, survivor) || survivor.dayAssignment === 'follow' || !survivor.watchPostId) continue
    const reserved = world.nightPosts.find((post) => post.id === survivor.watchPostId)
    if (!reserved) continue
    reserved.occupantId = survivor.id
    survivor.nightPostId = reserved.id
  }
  for (const survivor of world.survivors) {
    if (survivor.downed || isHero(world, survivor) || survivor.dayAssignment === 'follow' || survivor.watchPostId) continue
    assignOnePost(world, survivor)
  }
}

export function postForTower(world: WorldState, structure: StructureState): NightPost | undefined {
  const mid = structureMid(world, structure)
  return world.nightPosts
    .slice()
    .sort((a, b) => distanceXZ(a.position, mid) - distanceXZ(b.position, mid))[0]
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
    .filter((structure) => (structure.kind === 'wall' || structure.kind === 'gate') && structure.stage === 'complete' && structure.hp < structure.maxHp)
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
  const gun = equippedWeapon(survivor)
  const cap = gun ? magazineSize(gun.id) : 12
  const take = Math.min(cap - survivor.ammo, countItem(stock, 'ammo'))
  if (take > 0 && removeItem(stock, 'ammo', take)) {
    if (gun) writeMag(survivor, gun.id, survivor.ammo + take)
    else survivor.ammo += take
  }
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
    const gun = equippedWeapon(survivor)
    const cap = gun ? magazineSize(gun.id) : 16
    if (survivor.downed || survivor.ammo >= cap) continue
    const take = Math.min(cap - survivor.ammo, countItem(stock, 'ammo'))
    if (take <= 0) break
    removeItem(stock, 'ammo', take)
    if (gun) writeMag(survivor, gun.id, survivor.ammo + take)
    else survivor.ammo += take
  }
}


