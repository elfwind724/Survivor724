import { createEnemy } from '@/combat/Combat'
import {
  COMBAT_AFFIX_IDS,
  DUNGEON_CAVE,
  DUNGEON_ENTRANCE,
  ELITE_LUCK,
  EXIT_LUCK,
  dungeonPropOffsets,
  generateDungeonLayout,
  rollRoomPicks,
  type DungeonPickId,
} from '@/data/dungeon'
import { itemBase } from '@/data/items'
import { hallPoolFor, noteGear } from '@/data/hallPool'
import { findGear, giveGear, isGearId, rollGear, spawnGroundLoot } from '@/data/loot'
import { addItem, inventoryOf, usedSlots } from '@/inventory/Inventory'
import { ensureHotbar } from '@/inventory/Pack'
import { cellIndex, inBounds, worldToCell } from '@/navigation/NavGrid'
import { findContainer, findSurvivor } from '@/simulation/EntityRegistry'
import { cloneVec3, distanceXZ, type AffixRoll, type DungeonRun, type ItemRarity, type SurvivorState, type Vec3, type WorldState } from '@/simulation/types'

const ENTRANCE_RANGE = 2.8
export const DUNGEON_ENEMY_PREFIX = 'dng-'
const ROOM = DUNGEON_CAVE.room
const HALL = DUNGEON_CAVE.hall
const COLS = DUNGEON_CAVE.cols
const STEP = ROOM + HALL

const COMBAT_AFFIX_META: Record<(typeof COMBAT_AFFIX_IDS)[number], { label: string; min: number; max: number }> = {
  min_dmg: { label: '最小攻击', min: 2, max: 8 },
  max_dmg: { label: '最大攻击', min: 4, max: 14 },
  aspd: { label: '攻速', min: 4, max: 18 },
  crit: { label: '暴击几率', min: 4, max: 18 },
  crit_dmg: { label: '暴击伤害', min: 20, max: 80 },
}

export function applyDungeonNav(world: WorldState): void {
  const run = world.dungeonRun
  if (!isInDungeon(world) || !run) return
  const nav = world.nav
  for (const point of dungeonBlockedWorldCells(run)) {
    const cell = worldToCell(nav, { x: point.x + 0.5, y: 0, z: point.z + 0.5 })
    if (!inBounds(nav, cell)) continue
    nav.blocked[cellIndex(nav, cell)] = 1
  }
}

export function dungeonEntrancePos(): Vec3 {
  return { x: DUNGEON_ENTRANCE.x, y: 0, z: DUNGEON_ENTRANCE.z }
}

export function dungeonRoomSlot(index: number): { col: number; row: number } {
  const row = Math.floor(index / COLS)
  const colInRow = index % COLS
  const col = row % 2 === 1 ? COLS - 1 - colInRow : colInRow
  return { col, row }
}

export function dungeonRoomRect(index: number): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const { col, row } = dungeonRoomSlot(index)
  const minX = DUNGEON_CAVE.originX + col * STEP
  const minZ = DUNGEON_CAVE.originZ + row * STEP
  return { minX, maxX: minX + ROOM, minZ, maxZ: minZ + ROOM }
}

export function dungeonRoomCenter(_run: DungeonRun, index: number): Vec3 {
  const rect = dungeonRoomRect(index)
  return {
    x: (rect.minX + rect.maxX) / 2,
    y: 0,
    z: (rect.minZ + rect.maxZ) / 2,
  }
}

export function dungeonRoomDressing(run: DungeonRun, index: number): Array<{ assetId: string; x: number; z: number; yaw: number; scale: number }> {
  const center = dungeonRoomCenter(run, index)
  const kind = run.nodes[index]?.kind ?? 'combat'
  return dungeonPropOffsets(kind, `${run.seed}:${index}`).map((prop) => ({
    assetId: prop.assetId,
    x: center.x + prop.ox,
    z: center.z + prop.oz,
    yaw: prop.yaw,
    scale: prop.scale,
  }))
}

export function dungeonHallRect(from: number, to: number): { minX: number; maxX: number; minZ: number; maxZ: number } | null {
  const a = dungeonRoomRect(from)
  const b = dungeonRoomRect(to)
  const midZ = (Math.min(a.minZ, b.minZ) + Math.max(a.maxZ, b.maxZ)) / 2
  const midX = (Math.min(a.minX, b.minX) + Math.max(a.maxX, b.maxX)) / 2
  const gap = 1.6
  if (Math.abs(a.minZ - b.minZ) < 0.1) {
    const west = Math.min(a.maxX, b.maxX)
    const east = Math.max(a.minX, b.minX)
    return { minX: west, maxX: east, minZ: midZ - gap, maxZ: midZ + gap }
  }
  if (Math.abs(a.minX - b.minX) < 0.1) {
    const south = Math.min(a.maxZ, b.maxZ)
    const north = Math.max(a.minZ, b.minZ)
    return { minX: midX - gap, maxX: midX + gap, minZ: south, maxZ: north }
  }
  return null
}

export function hallIsOpen(run: DungeonRun, from: number): boolean {
  if (from < 0 || from >= run.nodes.length - 1) return false
  return from < run.index || run.roomCleared
}

export function dungeonWallBoxes(run: DungeonRun): Array<{ x: number; y: number; z: number; sx: number; sy: number; sz: number }> {
  const boxes: Array<{ x: number; y: number; z: number; sx: number; sy: number; sz: number }> = []
  const thick = 0.55
  const tall = 3.4
  const door = 3.2
  const y = tall / 2
  const push = (minX: number, maxX: number, minZ: number, maxZ: number): void => {
    const sx = Math.max(0.2, maxX - minX)
    const sz = Math.max(0.2, maxZ - minZ)
    if (sx < 0.25 && sz < 0.25) return
    boxes.push({ x: (minX + maxX) / 2, y, z: (minZ + maxZ) / 2, sx, sy: tall, sz })
  }
  const wallWithDoor = (
    along: 'x' | 'z',
    start: number,
    end: number,
    at: number,
    doorAt: number | null,
  ): void => {
    const half = thick / 2
    if (doorAt === null) {
      if (along === 'x') push(start, end, at - half, at + half)
      else push(at - half, at + half, start, end)
      return
    }
    const gap0 = doorAt - door / 2
    const gap1 = doorAt + door / 2
    if (along === 'x') {
      push(start, gap0, at - half, at + half)
      push(gap1, end, at - half, at + half)
    } else {
      push(at - half, at + half, start, gap0)
      push(at - half, at + half, gap1, end)
    }
  }
  for (let i = 0; i < run.nodes.length; i += 1) {
    const rect = dungeonRoomRect(i)
    const doors = { n: null as number | null, s: null as number | null, e: null as number | null, w: null as number | null }
    const link = (other: number): void => {
      const side = doorSide(i, other)
      if (!side) return
      const hall = dungeonHallRect(Math.min(i, other), Math.max(i, other))
      if (!hall) return
      if (side === 'e' || side === 'w') doors[side] = (hall.minZ + hall.maxZ) / 2
      else doors[side] = (hall.minX + hall.maxX) / 2
    }
    if (hallIsOpen(run, i - 1)) link(i - 1)
    if (hallIsOpen(run, i)) link(i + 1)
    wallWithDoor('x', rect.minX, rect.maxX, rect.maxZ, doors.n)
    wallWithDoor('x', rect.minX, rect.maxX, rect.minZ, doors.s)
    wallWithDoor('z', rect.minZ, rect.maxZ, rect.maxX, doors.e)
    wallWithDoor('z', rect.minZ, rect.maxZ, rect.minX, doors.w)
  }
  const last = run.nodes.length - 1
  for (let i = 0; i < last; i += 1) {
    if (!hallIsOpen(run, i)) continue
    const hall = dungeonHallRect(i, i + 1)
    if (!hall) continue
    const wide = hall.maxX - hall.minX
    const deep = hall.maxZ - hall.minZ
    if (wide >= deep) {
      push(hall.minX, hall.maxX, hall.minZ - thick / 2, hall.minZ + thick / 2)
      push(hall.minX, hall.maxX, hall.maxZ - thick / 2, hall.maxZ + thick / 2)
    } else {
      push(hall.minX - thick / 2, hall.minX + thick / 2, hall.minZ, hall.maxZ)
      push(hall.maxX - thick / 2, hall.maxX + thick / 2, hall.minZ, hall.maxZ)
    }
  }
  return boxes
}

function doorSide(from: number, to: number): 'n' | 's' | 'e' | 'w' | null {
  const a = dungeonRoomRect(from)
  const b = dungeonRoomRect(to)
  if (Math.abs(a.minZ - b.minZ) < 0.1) return a.minX < b.minX ? 'e' : 'w'
  if (Math.abs(a.minX - b.minX) < 0.1) return a.minZ < b.minZ ? 'n' : 's'
  return null
}

export function dungeonTorchPoints(run: DungeonRun): Array<{ x: number; y: number; z: number }> {
  const points: Array<{ x: number; y: number; z: number }> = []
  for (let i = 0; i < run.nodes.length; i += 1) {
    for (const prop of dungeonRoomDressing(run, i)) {
      if (!prop.assetId.includes('torch')) continue
      points.push({ x: prop.x, y: 1.55, z: prop.z })
    }
  }
  return points
}

export function dungeonBlockedWorldCells(run: DungeonRun): Array<{ x: number; z: number }> {
  const seen = new Set<string>()
  const rows = Math.ceil(run.nodes.length / COLS)
  const minX = Math.floor(DUNGEON_CAVE.originX - 1)
  const minZ = Math.floor(DUNGEON_CAVE.originZ - 1)
  const maxX = Math.ceil(DUNGEON_CAVE.originX + COLS * STEP - HALL + 1)
  const maxZ = Math.ceil(DUNGEON_CAVE.originZ + rows * STEP - HALL + 1)
  for (let x = minX; x <= maxX; x += 1) {
    for (let z = minZ; z <= maxZ; z += 1) seen.add(`${x},${z}`)
  }
  const carve = (rect: { minX: number; maxX: number; minZ: number; maxZ: number }): void => {
    for (let x = Math.floor(rect.minX); x < rect.maxX; x += 1) {
      for (let z = Math.floor(rect.minZ); z < rect.maxZ; z += 1) seen.delete(`${x},${z}`)
    }
  }
  for (let i = 0; i < run.nodes.length; i += 1) carve(dungeonRoomRect(i))
  const last = run.nodes.length - 1
  for (let i = 0; i < last; i += 1) {
    if (i >= run.index && !run.roomCleared) continue
    const hall = dungeonHallRect(i, i + 1)
    if (hall) carve(hall)
  }
  return [...seen].map((key) => {
    const [x, z] = key.split(',').map(Number)
    return { x: x ?? 0, z: z ?? 0 }
  })
}

export function isInDungeon(world: WorldState): boolean {
  return world.dungeonRun !== null && !world.dungeonRun.evacuated
}

export function nearDungeonEntrance(world: WorldState, survivor: SurvivorState): boolean {
  if (isInDungeon(world)) return false
  return distanceXZ(survivor.position, dungeonEntrancePos()) < ENTRANCE_RANGE
}

export function enterDungeon(world: WorldState, survivor: SurvivorState): boolean {
  if (isInDungeon(world)) return false
  const seed = `${world.worldSeed}:${world.time.dayIndex}`
  const nodes = generateDungeonLayout(world.time.dayIndex, world.worldSeed)
  if (nodes.length <= 0) return false
  clearDungeonEnemies(world)
  world.dungeonRun = {
    dayIndex: world.time.dayIndex,
    seed,
    nodes,
    index: 0,
    roomCleared: false,
    picks: null,
    evacuated: false,
    spawnedRooms: [],
  }
  world.raidEntered = true
  placeInRoom(world, survivor, 0)
  spawnRoom(world, world.dungeonRun)
  world.navDirty = true
  return true
}

export function chooseDungeonPick(world: WorldState, survivor: SurvivorState, pickId: DungeonPickId): boolean {
  const run = world.dungeonRun
  if (!run || run.evacuated) return false
  if (!run.roomCleared) {
    if (roomHasEnemies(world, run)) return false
    markRoomCleared(world, run)
  }
  if (!run.picks) run.picks = rollRoomPicks(`${run.seed}:picks:${run.index}`)
  if (!run.picks.includes(pickId)) return false
  const applied = applyPick(world, survivor, run, pickId)
  run.picks = null
  return applied
}

export function advanceDungeon(world: WorldState, survivor: SurvivorState): boolean {
  const run = world.dungeonRun
  if (!run || run.evacuated) return false
  if (!run.roomCleared && roomHasEnemies(world, run)) return false
  if (!run.roomCleared) markRoomCleared(world, run)
  const last = run.nodes.length - 1
  if (run.index >= last) return false
  world.navDirty = true
  return true
}

export function evacuateDungeon(world: WorldState, survivor?: SurvivorState): boolean {
  const run = world.dungeonRun
  if (!run) return false
  const actor = survivor ?? dungeonActor(world)
  if (!actor) return false
  actor.position = dungeonEntrancePos()
  actor.destination = null
  actor.path = []
  actor.pathTarget = null
  clearDungeonEnemies(world)
  run.evacuated = true
  run.picks = null
  run.roomCleared = true
  recordRaidLoot(world, actor)
  world.navDirty = true
  return true
}

const RARITY_RANK: Record<ItemRarity, number> = {
  common: 1,
  magic: 2,
  rare: 3,
  legendary: 4,
}

export function recordRaidLoot(world: WorldState, survivor: SurvivorState): void {
  world.raidEntered = true
  const best = bestCarriedRarity(world, survivor)
  const current = world.raidBestRarity
  if (!best) return
  if (!current || RARITY_RANK[best] > RARITY_RANK[current]) world.raidBestRarity = best
}

function bestCarriedRarity(world: WorldState, survivor: SurvivorState): ItemRarity | null {
  let best: ItemRarity | null = null
  const consider = (id: string | null | undefined): void => {
    if (!id || !isGearId(id)) return
    const piece = world.gear[id]
    if (!piece) return
    if (!best || RARITY_RANK[piece.rarity] > RARITY_RANK[best]) best = piece.rarity
  }
  consider(survivor.equipment.weapon)
  consider(survivor.equipment.tool)
  const bag = inventoryOf(world.inventories, survivor.inventoryId)
  for (const item of bag.items) consider(item.itemId)
  for (const slot of ensureHotbar(survivor)) {
    if (slot) consider(slot.itemId)
  }
  return best
}

export function stepDungeonRun(world: WorldState): void {
  const run = world.dungeonRun
  if (!run || run.evacuated) return
  const actor = dungeonActor(world)
  if (actor) {
    const inside = roomIndexAt(actor.position, run.nodes.length)
    if (inside === run.index + 1 && run.roomCleared) {
      run.index = inside
      run.picks = null
      run.roomCleared = false
      spawnRoom(world, run)
      world.navDirty = true
    }
  }
  if (run.roomCleared) return
  if (roomHasEnemies(world, run)) return
  markRoomCleared(world, run)
  world.navDirty = true
}

export function roomIndexAt(point: Vec3, roomCount: number): number {
  for (let i = 0; i < roomCount; i += 1) {
    const rect = dungeonRoomRect(i)
    if (point.x >= rect.minX && point.x <= rect.maxX && point.z >= rect.minZ && point.z <= rect.maxZ) return i
  }
  return -1
}

function dungeonActor(world: WorldState): SurvivorState | undefined {
  const id = world.player.controlledId ?? world.player.selectedId ?? world.player.heroId
  return findSurvivor(world, id) ?? world.survivors[0]
}

function placeInRoom(world: WorldState, survivor: SurvivorState, index: number): void {
  const run = world.dungeonRun
  if (!run) return
  const center = dungeonRoomCenter(run, index)
  survivor.position = cloneVec3(center)
  survivor.destination = null
  survivor.path = []
  survivor.pathTarget = null
}

function spawnRoom(world: WorldState, run: DungeonRun): void {
  if (run.spawnedRooms.includes(run.index)) return
  run.spawnedRooms.push(run.index)
  const node = run.nodes[run.index]
  if (!node || node.kind === 'exit' || node.kind === 'event' || node.kind === 'reward') {
    markRoomCleared(world, run)
    return
  }
  const center = dungeonRoomCenter(run, run.index)
  const count = node.kind === 'elite' ? 4 : 3
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2 + 0.35
    const kind = node.kind === 'elite' && i === count - 1 ? 'runner' : 'wanderer'
    world.enemies.push(createEnemy(
      kind,
      { x: center.x + Math.cos(angle) * 2.7, y: 0, z: center.z + Math.sin(angle) * 2.7 },
      `${DUNGEON_ENEMY_PREFIX}${run.seed}-${run.index}-${i}`,
    ))
  }
  run.roomCleared = false
  run.picks = null
}

function markRoomCleared(world: WorldState, run: DungeonRun): void {
  run.roomCleared = true
  if (!run.picks) run.picks = rollRoomPicks(`${run.seed}:picks:${run.index}`)
}

function roomHasEnemies(world: WorldState, run: DungeonRun): boolean {
  const rect = dungeonRoomRect(run.index)
  return world.enemies.some((enemy) => {
    if (enemy.health <= 0) return false
    if (!enemy.id.startsWith(DUNGEON_ENEMY_PREFIX)) return false
    return enemy.position.x >= rect.minX && enemy.position.x <= rect.maxX && enemy.position.z >= rect.minZ && enemy.position.z <= rect.maxZ
  })
}

function clearDungeonEnemies(world: WorldState): void {
  world.enemies = world.enemies.filter((enemy) => !enemy.id.startsWith(DUNGEON_ENEMY_PREFIX))
}

function applyPick(world: WorldState, survivor: SurvivorState, run: DungeonRun, pickId: DungeonPickId): boolean {
  if (pickId === 'ammo') return giveStack(world, survivor, 'ammo', 16)
  if (pickId === 'bandage') return giveStack(world, survivor, 'bandage', 3)
  if (pickId === 'gear_chest') return giveChest(world, survivor, run)
  if (pickId === 'shrine') return blessWeapon(world, survivor, run)
  return false
}

function giveStack(world: WorldState, survivor: SurvivorState, itemId: string, count: number): boolean {
  const bag = inventoryOf(world.inventories, survivor.inventoryId)
  const space = Math.max(0, bag.capacity - usedSlots(bag))
  const intoBag = Math.min(count, space)
  if (intoBag > 0) addItem(bag, itemId, intoBag)
  const rest = count - intoBag
  if (rest <= 0) return intoBag > 0
  const warehouse = findContainer(world, 'warehouse')
  if (warehouse && addItem(inventoryOf(world.inventories, warehouse.inventoryId), itemId, rest)) return true
  return intoBag > 0
}

function giveChest(world: WorldState, survivor: SurvivorState, run: DungeonRun): boolean {
  const node = run.nodes[run.index]
  const luck = node?.luck ?? (node?.kind === 'elite' ? ELITE_LUCK : node?.kind === 'exit' ? EXIT_LUCK : 0)
  const piece = rollGear(world, `${run.seed}:chest:${run.index}`, luck, 'weapon')
  if (giveGear(world, piece, survivor.inventoryId)) return true
  const center = dungeonRoomCenter(run, run.index)
  spawnGroundLoot(world, piece, center.x, center.z)
  return true
}

function blessWeapon(world: WorldState, survivor: SurvivorState, run: DungeonRun): boolean {
  let weaponId = survivor.equipment.weapon
  if (!weaponId) return true
  if (!isGearId(weaponId)) {
    const piece = rollGear(world, `${run.seed}:shrine-base:${run.index}`, 0.2, 'weapon')
    piece.baseId = itemBase(weaponId)
    piece.slot = 'weapon'
    piece.rarity = 'magic'
    piece.procs = []
    survivor.equipment.weapon = piece.id
    weaponId = piece.id
  }
  const piece = findGear(world, weaponId)
  if (!piece) return true
  const used = new Set(piece.affixes.map((affix) => affix.id))
  const unlocked = new Set(hallPoolFor(world).affixes)
  const unused = COMBAT_AFFIX_IDS.filter((id) => !used.has(id) && unlocked.has(id))
  const pick = unused[Math.floor(hash01(`${run.seed}:shrine:${run.index}`) * unused.length)]
  if (!pick) return true
  const meta = COMBAT_AFFIX_META[pick]
  const span = meta.max - meta.min
  const value = Math.round((meta.min + hash01(`${run.seed}:shrine:v:${run.index}`) * span) * 10) / 10
  const affix: AffixRoll = { id: pick, label: meta.label, value }
  const existing = piece.affixes.find((entry) => entry.id === pick)
  if (existing) existing.value = Math.round((existing.value + value) * 10) / 10
  else piece.affixes.push(affix)
  noteGear(world, piece)
  return true
}

function hash01(seed: string): number {
  let hash = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return ((hash >>> 0) % 10_000) / 10_000
}
