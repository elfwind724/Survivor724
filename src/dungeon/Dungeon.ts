import { createEnemy } from '@/combat/Combat'
import {
  COMBAT_AFFIX_IDS,
  DUNGEON_ENTRANCE,
  DUNGEON_ROOM_SPACING,
  ELITE_LUCK,
  EXIT_LUCK,
  generateDungeonLayout,
  rollRoomPicks,
  type DungeonPickId,
} from '@/data/dungeon'
import { itemBase } from '@/data/items'
import { findGear, giveGear, isGearId, rollGear, spawnGroundLoot } from '@/data/loot'
import { addItem, inventoryOf, usedSlots } from '@/inventory/Inventory'
import { ensureHotbar } from '@/inventory/Pack'
import { findContainer, findSurvivor } from '@/simulation/EntityRegistry'
import { cloneVec3, distanceXZ, type AffixRoll, type DungeonRun, type ItemRarity, type SurvivorState, type Vec3, type WorldState } from '@/simulation/types'

const ROOM_RADIUS = DUNGEON_ROOM_SPACING * 0.42
const ENTRANCE_RANGE = 2.2
const DUNGEON_ENEMY_PREFIX = 'dng-'

const COMBAT_AFFIX_META: Record<(typeof COMBAT_AFFIX_IDS)[number], { label: string; min: number; max: number }> = {
  min_dmg: { label: '最小攻击', min: 2, max: 8 },
  max_dmg: { label: '最大攻击', min: 4, max: 14 },
  aspd: { label: '攻速', min: 4, max: 18 },
  crit: { label: '暴击几率', min: 4, max: 18 },
  crit_dmg: { label: '暴击伤害', min: 20, max: 80 },
}

export function dungeonEntrancePos(): Vec3 {
  return { x: DUNGEON_ENTRANCE.x, y: 0, z: DUNGEON_ENTRANCE.z }
}

export function dungeonRoomCenter(run: DungeonRun, index: number): Vec3 {
  const entrance = dungeonEntrancePos()
  return {
    x: entrance.x + (index + 1) * DUNGEON_ROOM_SPACING,
    y: 0,
    z: entrance.z,
  }
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
  }
  world.raidEntered = true
  placeInRoom(world, survivor, 0)
  spawnRoom(world, world.dungeonRun)
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
  clearDungeonEnemies(world)
  run.index += 1
  run.picks = null
  run.roomCleared = false
  placeInRoom(world, survivor, run.index)
  spawnRoom(world, run)
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
  if (!run || run.evacuated || run.roomCleared) return
  if (roomHasEnemies(world, run)) return
  markRoomCleared(world, run)
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
  const node = run.nodes[run.index]
  if (!node || node.kind === 'exit' || node.kind === 'event' || node.kind === 'reward') {
    markRoomCleared(world, run)
    return
  }
  const center = dungeonRoomCenter(run, run.index)
  const count = node.kind === 'elite' ? 3 : 2
  for (let i = 0; i < count; i += 1) {
    const side = i % 2 === 0 ? 1 : -1
    const ring = Math.floor(i / 2) + 1
    world.enemies.push(createEnemy(
      'wanderer',
      { x: center.x + side * (1.6 + ring * 0.4), y: 0, z: center.z + 1.4 + ring * 0.3 },
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
  const center = dungeonRoomCenter(run, run.index)
  return world.enemies.some((enemy) => {
    if (enemy.health <= 0) return false
    if (!enemy.id.startsWith(DUNGEON_ENEMY_PREFIX)) return false
    return distanceXZ(enemy.position, center) < ROOM_RADIUS
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
  const unused = COMBAT_AFFIX_IDS.filter((id) => !used.has(id))
  const pick = unused[Math.floor(hash01(`${run.seed}:shrine:${run.index}`) * unused.length)] ?? COMBAT_AFFIX_IDS[0]
  if (!pick) return true
  const meta = COMBAT_AFFIX_META[pick]
  const span = meta.max - meta.min
  const value = Math.round((meta.min + hash01(`${run.seed}:shrine:v:${run.index}`) * span) * 10) / 10
  const affix: AffixRoll = { id: pick, label: meta.label, value }
  const existing = piece.affixes.find((entry) => entry.id === pick)
  if (existing) existing.value = Math.round((existing.value + value) * 10) / 10
  else piece.affixes.push(affix)
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
