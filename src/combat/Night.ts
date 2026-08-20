import { findStructure, needsRepair, repairStructure } from '@/base/construction'
import { durabilityPercent, structureLabel } from '@/data/facilities'
import { assignPost } from '@/jobs/Roster'
import { isHero } from '@/controls/PlayerControl'
import { refillRuinCrates } from '@/world/Ruins'
import { refillBerryBushes } from '@/world/Forage'
import { emptyDayNoise, gunshotHordeExtra, hordeCounts, loudestGunshotSector, sectorOfPoint } from '@/data/enemies'
import { sectorLabel } from '@/combat/Defense'
import { equippedWeapon, magazineSize, writeMag } from '@/data/weapons'
import { addItem, countItem, inventoryOf, removeItem } from '@/inventory/Inventory'
import { noteGear } from '@/data/hallPool'
import { isGearId, RARITY_LABEL, rollGear, spawnGroundLoot } from '@/data/loot'
import { cellCenter } from '@/navigation/NavGrid'
import { findContainer } from '@/simulation/EntityRegistry'
import { BASE } from '@/simulation/baseLayout'
import { TOWER_STAND_HEIGHT } from '@/data/outdoorScenery'
import { distanceXZ, type DefenseSectorId, type NightLoot, type NightPost, type NightReport, type StructureState, type SurvivorState, type WorldState } from '@/simulation/types'
import { equipItem } from '@/survivors/Equipment'
import { beginTravel, followTravel } from '@/navigation/Travel'
import { insideBase } from '@/survivors/Living'
import { stepFollowHero } from '@/jobs/Follow'
import { assignedRescuer } from '@/jobs/Rescue'
import { autoCombat, createEnemy, nearestLivingEnemy } from './Combat'

export { assignedRescuer }

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
    world.raidEntered = false
    world.raidBestRarity = null
    world.dayGunshots = 0
    world.dayNoise = emptyDayNoise()
    world.nightRepairIds = []
    refillRuinCrates(world)
    refillBerryBushes(world)
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

export function nightLootFor(kills: number, world?: WorldState): NightLoot[] {
  const fallen = Math.max(0, kills)
  const loot: NightLoot[] = [
    { itemId: 'wood', label: '木', count: 6 + fallen },
    { itemId: 'scrap', label: '铁', count: 3 + Math.floor(fallen / 2) },
    { itemId: 'ammo', label: '弹', count: 8 + fallen },
    { itemId: 'meal', label: '食', count: 2 + Math.floor(fallen / 6) },
  ]
  if (world && fallen >= 6) {
    const piece = rollGear(world, `night:${world.time.dayIndex}:${fallen}`, fallen > 18 ? 0.12 : 0.04, 'weapon')
    noteGear(world, piece)
    loot.push({ itemId: piece.id, label: `${RARITY_LABEL[piece.rarity]} ${piece.name}`, count: 1 })
  }
  return loot
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
  const loot = nightLootFor(world.nightKills, world)
  const warehouse = findContainer(world, 'warehouse')
  if (warehouse) {
    const stock = inventoryOf(world.inventories, warehouse.inventoryId)
    for (const item of loot) {
      if (isGearId(item.itemId)) {
        const piece = world.gear[item.itemId]
        if (piece) spawnGroundLoot(world, piece, warehouse.position.x, warehouse.position.z)
        continue
      }
      addItem(stock, item.itemId, item.count)
    }
  }
  for (const survivor of world.survivors) {
    if (survivor.downed) continue
    survivor.morale = Math.min(100, survivor.morale + 6)
  }
  const report = makeReport(world, 'won', '守住了这一夜，木铁弹食进仓库，枪掉在仓库门口')
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

export function readyForNightPost(world: WorldState, survivor: SurvivorState): boolean {
  if (world.time.phase !== 'night' || survivor.downed) return false
  if (survivor.dayAssignment === 'follow') return true
  if (world.nightRepairIds.length > 0 && canNightRepair(survivor) && survivor.dayAssignment !== 'follow') return true
  if (!insideBase(survivor.position)) return false
  return survivor.workerState !== 'ReturnToBase' && survivor.workerState !== 'DepositItems'
}

export function stepNightDefender(world: WorldState, survivor: SurvivorState, dt: number): void {
  if (survivor.downed || isHero(world, survivor)) return
  if (survivor.dayAssignment === 'follow') {
    stepFollowHero(world, survivor, dt)
    autoCombat(world, survivor)
    return
  }
  if (restockNightAmmo(world, survivor, dt)) return
  pruneNightRepairs(world)
  const ordered = nightRepairAssignments(world).get(survivor.id)
  if (ordered) {
    autoCombat(world, survivor)
    repairWall(world, survivor, ordered, dt)
    return
  }
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
  spawnHordeWave(
    world,
    hordeCounts(world.time.dayIndex, { entered: world.raidEntered, best: world.raidBestRarity }),
    'all',
    true,
  )
  const extra = gunshotHordeExtra(world.dayGunshots)
  const approach = loudestGunshotSector(world.dayNoise)
  if (approach && extra.wanderers + extra.runners > 0) spawnHordeWave(world, extra, approach, false)
  const late = lateReturnHordeExtra(world)
  if (late.approach && late.wanderers + late.runners > 0) spawnHordeWave(world, late, late.approach, false)
}

export function lateReturners(world: WorldState): SurvivorState[] {
  return world.survivors.filter(
    (entry) => !entry.downed && entry.id !== world.player.controlledId && !insideBase(entry.position),
  )
}

export function lateReturnHordeExtra(
  world: WorldState,
): { wanderers: number; runners: number; approach: HordeApproach | null } {
  const late = lateReturners(world)
  if (late.length === 0) return { wanderers: 0, runners: 0, approach: null }
  const votes: Record<Exclude<HordeApproach, 'all'>, number> = { north: 0, east: 0, south: 0, west: 0 }
  for (const person of late) {
    votes[sectorOfPoint(person.position.x, person.position.z)] += 1
  }
  let approach: Exclude<HordeApproach, 'all'> = 'west'
  let best = -1
  for (const id of ['north', 'east', 'south', 'west'] as const) {
    if (votes[id] > best) {
      best = votes[id]
      approach = id
    }
  }
  return {
    wanderers: Math.min(10, late.length * 2),
    runners: Math.min(6, late.length),
    approach,
  }
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
  issueNightHammers(world)
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

export function canNightRepair(survivor: SurvivorState): boolean {
  return survivor.professionId === 'builder' || survivor.carriedTools.includes('hammer')
}

export function nightRepairing(world: WorldState, survivor: SurvivorState): boolean {
  if (world.time.phase !== 'night' && world.time.phase !== 'dusk') return false
  return nightRepairAssignments(world).has(survivor.id)
}

export function orderRepair(world: WorldState, structureId: string, preferredId?: string): string {
  const structure = findStructure(world, structureId)
  if (!structure || (structure.kind !== 'wall' && structure.kind !== 'gate')) return '点要修的墙或大门'
  if (!needsRepair(structure)) return `${structureLabel(structure)}还不需要修`
  if (!world.nightRepairIds.includes(structure.id)) world.nightRepairIds.push(structure.id)
  const name = `${structureLabel(structure)}（${durabilityPercent(structure)}%）`
  if (world.time.phase !== 'night' && world.time.phase !== 'dusk') {
    const builder = world.survivors.find((entry) => entry.professionId === 'builder' && !entry.downed && !isHero(world, entry))
    if (builder) assignPost(world, builder.id, 'repair')
    return builder ? `已派 ${builder.name} 白天去修 ${name}` : `已记下要修 ${name}`
  }
  const crew = pickRepairCrew(world, preferredId)
  if (!crew) return `已标记抢修 ${name}，但没人拿锤子。走近按 E 可自己修`
  detachFromPost(world, crew)
  return `已派 ${crew.name} 去抢修 ${name}`
}

export function orderRepairSector(world: WorldState, sector: DefenseSectorId): string {
  const walls = fortifications(world).filter((entry) => wallSector(world, entry) === sector && needsRepair(entry))
  if (walls.length === 0) return `${sectorLabel(sector)}这一侧还不需要修`
  for (const wall of walls) {
    if (!world.nightRepairIds.includes(wall.id)) world.nightRepairIds.push(wall.id)
  }
  const crew = pickRepairCrew(world)
  if (crew) detachFromPost(world, crew)
  const worst = walls[0] ? durabilityPercent(walls[0]) : 0
  return crew
    ? `已派 ${crew.name} 去抢修${sectorLabel(sector)}（最差 ${worst}%）`
    : `${sectorLabel(sector)}已标记抢修。走近按 E 可自己修`
}

export function sectorHasRepairOrder(world: WorldState, sector: DefenseSectorId): boolean {
  return world.nightRepairIds.some((id) => {
    const structure = findStructure(world, id)
    return !!structure && wallSector(world, structure) === sector
  })
}

export function sectorWallHp(world: WorldState, sector: DefenseSectorId): number {
  const walls = fortifications(world).filter((entry) => wallSector(world, entry) === sector)
  if (walls.length === 0) return 100
  const sum = walls.reduce((total, entry) => total + durabilityPercent(entry), 0)
  return Math.round(sum / walls.length)
}

function pickRepairCrew(world: WorldState, preferredId?: string): SurvivorState | undefined {
  const free = world.survivors.filter((entry) => !entry.downed && !isHero(world, entry) && entry.dayAssignment !== 'follow')
  const preferred = preferredId ? free.find((entry) => entry.id === preferredId) : undefined
  if (preferred && (canNightRepair(preferred) || preferred.professionId === 'builder')) return preferred
  return (
    free.find((entry) => entry.professionId === 'builder' && canNightRepair(entry))
    ?? free.find((entry) => canNightRepair(entry))
    ?? free.find((entry) => entry.professionId === 'builder')
  )
}

function detachFromPost(world: WorldState, survivor: SurvivorState): void {
  const post = world.nightPosts.find((entry) => entry.occupantId === survivor.id)
  if (post) post.occupantId = null
  survivor.nightPostId = null
  survivor.position.y = 0
  survivor.path = []
  survivor.destination = null
}

function pruneNightRepairs(world: WorldState): void {
  world.nightRepairIds = world.nightRepairIds.filter((id) => {
    const structure = findStructure(world, id)
    return !!structure && needsRepair(structure)
  })
}

export function nightRepairAssignments(world: WorldState): Map<string, StructureState> {
  pruneNightRepairs(world)
  const walls = world.nightRepairIds
    .map((id) => findStructure(world, id))
    .filter((entry): entry is StructureState => !!entry && needsRepair(entry))
    .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)
  const crew = world.survivors
    .filter((entry) => !entry.downed && !isHero(world, entry) && entry.dayAssignment !== 'follow' && canNightRepair(entry))
    .sort((a, b) => a.id.localeCompare(b.id))
  const used = new Set<string>()
  const map = new Map<string, StructureState>()
  for (const wall of walls) {
    const worker = [...crew]
      .filter((entry) => !used.has(entry.id))
      .sort((a, b) => distanceXZ(a.position, wallMid(world, wall)) - distanceXZ(b.position, wallMid(world, wall)))[0]
    if (!worker) break
    used.add(worker.id)
    map.set(worker.id, wall)
  }
  return map
}

function repairDamagedWall(world: WorldState, survivor: SurvivorState, dt: number): boolean {
  if (!canNightRepair(survivor)) return false
  const wall = damagedWall(world)
  if (!wall) return false
  return repairWall(world, survivor, wall, dt)
}

function repairWall(world: WorldState, survivor: SurvivorState, wall: StructureState, dt: number): boolean {
  if (!wall.cells[0] || !needsRepair(wall)) return false
  const warehouse = findContainer(world, 'warehouse')
  if (!warehouse || countItem(inventoryOf(world.inventories, warehouse.inventoryId), 'wood') <= 0) return false
  const target = wallMid(world, wall)
  survivor.position.y = 0
  if (distanceXZ(survivor.position, target) > 2.2) {
    survivor.workElapsed = 0
    if (!survivor.pathTarget || distanceXZ(survivor.pathTarget, target) > 2) beginTravel(world, survivor, target)
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

function wallMid(world: WorldState, structure: StructureState) {
  const first = structure.cells[0]
  if (!first) return { x: 0, y: 0, z: 0 }
  return cellCenter(world.nav, first)
}

function fortifications(world: WorldState): StructureState[] {
  return world.structures.filter((entry) => (entry.kind === 'wall' || entry.kind === 'gate') && entry.stage === 'complete')
}

function wallSector(world: WorldState, structure: StructureState): DefenseSectorId {
  const mid = wallMid(world, structure)
  return sectorOfPoint(mid.x, mid.z)
}

function issueNightHammers(world: WorldState): void {
  const locker = findContainer(world, 'tool_locker')
  const stock = locker ? inventoryOf(world.inventories, locker.inventoryId) : undefined
  for (const survivor of world.survivors) {
    if (survivor.downed || survivor.carriedTools.includes('hammer')) continue
    if (survivor.professionId !== 'builder') continue
    if (stock && countItem(stock, 'hammer') > 0) {
      removeItem(stock, 'hammer', 1)
      survivor.carriedTools.push('hammer')
    } else {
      survivor.carriedTools.push('hammer')
    }
  }
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


