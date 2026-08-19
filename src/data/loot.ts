import { isCombatAffix } from '@/data/dungeon'
import { EQUIPMENT } from '@/data/equipment'
import { itemBase, itemLabel } from '@/data/items'
import { WEAPONS } from '@/data/weapons'
import { fireProfile } from '@/data/weapons'
import { addItem, inventoryOf } from '@/inventory/Inventory'
import { addToHotbar } from '@/inventory/Pack'
import { findContainer } from '@/simulation/EntityRegistry'
import { distanceXZ, type AffixRoll, type EquipSlot, type GearPiece, type GroundLoot, type ItemRarity, type SurvivorState, type WeaponProc, type WorldState } from '@/simulation/types'

export const RARITY_LABEL: Record<ItemRarity, string> = {
  common: '普通',
  magic: '魔法',
  rare: '稀有',
  legendary: '传奇',
}

export const RARITY_COLOR: Record<ItemRarity, string> = {
  common: '#d8d4cc',
  magic: '#5b8cff',
  rare: '#ffd24a',
  legendary: '#ff8a2a',
}

const STAT_AFFIXES: Array<{ id: AffixRoll['id']; label: string; min: number; max: number }> = [
  { id: 'min_dmg', label: '最小攻击', min: 2, max: 8 },
  { id: 'max_dmg', label: '最大攻击', min: 4, max: 14 },
  { id: 'aspd', label: '攻速', min: 4, max: 18 },
  { id: 'crit', label: '暴击几率', min: 4, max: 18 },
  { id: 'crit_dmg', label: '暴击伤害', min: 20, max: 80 },
  { id: 'knockback', label: '击退', min: 0.4, max: 1.6 },
  { id: 'charm', label: '魅惑', min: 4, max: 16 },
  { id: 'str', label: '力量', min: 1, max: 6 },
  { id: 'agi', label: '敏捷', min: 1, max: 6 },
  { id: 'con', label: '体质', min: 1, max: 6 },
  { id: 'int', label: '智力', min: 1, max: 6 },
]

const PROCS: Array<{ id: WeaponProc; label: string }> = [
  { id: 'double', label: '双射' },
  { id: 'triple', label: '三射' },
  { id: 'scatter', label: '散射' },
  { id: 'split', label: '分裂' },
  { id: 'pierce', label: '穿透' },
  { id: 'explode', label: '爆炸' },
  { id: 'lightning', label: '雷电' },
  { id: 'burn', label: '燃烧' },
  { id: 'freeze', label: '冰冻' },
  { id: 'poison', label: '毒素' },
  { id: 'paralyze', label: '麻痹' },
]

const LEGEND_PREFIX = ['裂地', '霜牙', '雷霆', '狱火', '毒牙', '魅影', '穿云', '爆裂', '噬魂', '星陨']
const LEGEND_SUFFIX = ['之裁', '之怒', '低语', '裁决', '葬歌', '余烬']

let gearSerial = 0

export function isGearId(id: string): boolean {
  return id.startsWith('g-')
}

export function gearBaseId(id: string): string {
  return itemBase(id)
}

export function findGear(world: WorldState, id: string | null | undefined): GearPiece | undefined {
  if (!id) return undefined
  return world.gear[id]
}

export function affixText(affix: AffixRoll): string {
  if (affix.id === 'aspd' || affix.id === 'crit' || affix.id === 'charm') return `${affix.label} +${affix.value}%`
  if (affix.id === 'crit_dmg') return `${affix.label} +${affix.value}%`
  if (affix.id === 'min_dmg' || affix.id === 'max_dmg') return `${affix.label} +${affix.value}`
  if (affix.id === 'knockback') return `${affix.label} +${affix.value.toFixed(1)}`
  return `${affix.label} +${affix.value}`
}

export function procLabel(id: WeaponProc): string {
  return PROCS.find((entry) => entry.id === id)?.label ?? id
}

export function rollGear(world: WorldState, seed: string, luck = 0, slot: EquipSlot | 'any' = 'weapon'): GearPiece {
  const rarity = rollRarity(seed, luck)
  const pool = slot === 'any'
    ? EQUIPMENT
    : EQUIPMENT.filter((entry) => entry.slot === slot)
  const bases = slot === 'weapon' || slot === 'any' ? [...WEAPONS.map((gun) => gun.id), ...pool.filter((entry) => entry.slot !== 'weapon').map((entry) => entry.id)] : pool.map((entry) => entry.id)
  const weaponPool = slot === 'weapon' || (slot === 'any' && hash01(`${seed}:w`) > 0.35) ? WEAPONS.map((gun) => gun.id) : []
  const pickPool = weaponPool.length > 0 && (slot === 'weapon' || slot === 'any') ? weaponPool : bases
  const baseId = pickPool[Math.floor(hash01(`${seed}:base`) * pickPool.length)] ?? 'pistol'
  const def = EQUIPMENT.find((entry) => entry.id === baseId)
  const slotId = def?.slot ?? 'weapon'
  const affixCount = rarity === 'common' ? 0 : rarity === 'magic' ? 1 + (hash01(`${seed}:n`) > 0.55 ? 1 : 0) : rarity === 'rare' ? 3 + Math.floor(hash01(`${seed}:n`) * 3) : 4 + Math.floor(hash01(`${seed}:n`) * 3)
  const affixes = rollAffixes(`${seed}:aff`, affixCount)
  const procs = rollProcs(`${seed}:proc`, rarity)
  const piece: GearPiece = {
    id: `g-${baseId}-${(gearSerial += 1)}`,
    baseId,
    slot: slotId,
    rarity,
    plus: 0,
    affixes,
    procs,
    name: gearName(baseId, rarity, procs, seed),
  }
  world.gear[piece.id] = piece
  return piece
}

export function giveGear(world: WorldState, piece: GearPiece, inventoryId: string): boolean {
  world.gear[piece.id] = piece
  return addItem(inventoryOf(world.inventories, inventoryId), piece.id, 1)
}

export function dropChanceFor(kind: 'wanderer' | 'runner' | 'wildlife', luck = 0): number {
  if (kind === 'runner') return 0.22 + luck
  if (kind === 'wanderer') return 0.12 + luck
  return 0.06 + luck
}

export function gearLabel(world: WorldState, id: string): string {
  const piece = world.gear[id]
  if (!piece) return itemLabel(id)
  return `${RARITY_LABEL[piece.rarity]} ${piece.name}`
}

export function spawnGroundLoot(world: WorldState, piece: GearPiece, x: number, z: number): void {
  world.gear[piece.id] = piece
  if (world.groundLoot.some((drop) => drop.gearId === piece.id)) return
  world.groundLoot.push({
    id: `loot-${piece.id}`,
    gearId: piece.id,
    x,
    z,
  })
}

export function ejectWarehouseGear(world: WorldState): number {
  const warehouse = findContainer(world, 'warehouse')
  if (!warehouse) return 0
  const stock = inventoryOf(world.inventories, warehouse.inventoryId)
  if (!stock.items.some((item) => isGearId(item.itemId))) return 0
  const keep: typeof stock.items = []
  let moved = 0
  for (const item of stock.items) {
    if (!isGearId(item.itemId)) {
      keep.push(item)
      continue
    }
    const piece = world.gear[item.itemId]
    if (piece) spawnGroundLoot(world, piece, warehouse.position.x, warehouse.position.z)
    moved += 1
  }
  stock.items = keep
  return moved
}

export function primaryAffixes(affixes: AffixRoll[]): AffixRoll[] {
  return affixes.filter((affix) => isCombatAffix(affix.id))
}

export function secondaryAffixes(affixes: AffixRoll[]): AffixRoll[] {
  return affixes.filter((affix) => !isCombatAffix(affix.id))
}

export function nearbyLootName(world: WorldState, x: number, z: number, maxDist = 8): string {
  const near = nearestGroundLoot(world, x, z, maxDist)
  if (!near) return ''
  return gearLabel(world, near.gearId)
}

export function nearestGroundLoot(world: WorldState, x: number, z: number, maxDist = 8): GroundLoot | undefined {
  let best: GroundLoot | undefined
  let bestDist = maxDist
  for (const drop of world.groundLoot) {
    const dist = distanceXZ({ x, y: 0, z }, { x: drop.x, y: 0, z: drop.z })
    if (dist > bestDist) continue
    best = drop
    bestDist = dist
  }
  return best
}

export function maybeDropGear(
  world: WorldState,
  survivor: SurvivorState | undefined,
  seed: string,
  kind: 'wanderer' | 'runner' | 'wildlife',
  at?: { x: number; z: number },
): GearPiece | null {
  if (hash01(seed) > dropChanceFor(kind)) return null
  const piece = rollGear(world, seed, kind === 'runner' ? 0.08 : 0, 'weapon')
  const dropAt = at ?? survivor?.position ?? { x: 0, z: 0 }
  if (survivor) {
    const bag = inventoryOf(world.inventories, survivor.inventoryId)
    if (addItem(bag, piece.id, 1)) return piece
  }
  spawnGroundLoot(world, piece, dropAt.x, dropAt.z)
  return piece
}

export function pickupGroundLoot(world: WorldState, survivor: SurvivorState): GearPiece[] {
  const bag = inventoryOf(world.inventories, survivor.inventoryId)
  const kept: GroundLoot[] = []
  const picked: GearPiece[] = []
  for (const drop of world.groundLoot) {
    if (distanceXZ(survivor.position, { x: drop.x, y: 0, z: drop.z }) > 1.7) {
      kept.push(drop)
      continue
    }
    if (!addItem(bag, drop.gearId, 1) && !addToHotbar(survivor, drop.gearId, 1)) {
      kept.push(drop)
      continue
    }
    const piece = world.gear[drop.gearId]
    if (piece) picked.push(piece)
  }
  world.groundLoot = kept
  return picked
}

export function previewFire(world: WorldState, survivor: SurvivorState, weaponId: string) {
  const ghost: SurvivorState = {
    ...survivor,
    equipment: { ...survivor.equipment, weapon: weaponId },
  }
  return fireProfile(ghost, 0, world)
}

export function weaponScore(profile: { minDamage: number; maxDamage: number; cooldown: number; pellets: number; critChance: number; critDamage: number }): number {
  const avg = (profile.minDamage + profile.maxDamage) / 2
  const crit = 1 + profile.critChance * (profile.critDamage - 1)
  return (avg * Math.max(1, profile.pellets) * crit) / Math.max(0.08, profile.cooldown)
}

export function compareFire(
  current: { minDamage: number; maxDamage: number; cooldown: number; pellets: number; critChance: number; critDamage: number },
  next: { minDamage: number; maxDamage: number; cooldown: number; pellets: number; critChance: number; critDamage: number },
): { currentScore: number; nextScore: number; deltaPct: number } {
  const currentScore = weaponScore(current)
  const nextScore = weaponScore(next)
  const deltaPct = currentScore <= 0.01
    ? (nextScore > 0 ? 100 : 0)
    : Math.round(((nextScore - currentScore) / currentScore) * 100)
  return { currentScore, nextScore, deltaPct }
}

function rollRarity(seed: string, luck: number): ItemRarity {
  const roll = hash01(seed) - luck
  if (roll < 0.03) return 'legendary'
  if (roll < 0.13) return 'rare'
  if (roll < 0.42) return 'magic'
  return 'common'
}

function rollAffixes(seed: string, count: number): AffixRoll[] {
  const used = new Set<string>()
  const rolls: AffixRoll[] = []
  let i = 0
  while (rolls.length < count && i < 20) {
    i += 1
    const pick = STAT_AFFIXES[Math.floor(hash01(`${seed}:${i}`) * STAT_AFFIXES.length)]
    if (!pick || used.has(pick.id)) continue
    used.add(pick.id)
    const span = pick.max - pick.min
    const value = Math.round((pick.min + hash01(`${seed}:v:${i}`) * span) * 10) / 10
    rolls.push({ id: pick.id, label: pick.label, value })
  }
  return rolls
}

function rollProcs(seed: string, rarity: ItemRarity): WeaponProc[] {
  if (rarity === 'common' || rarity === 'magic') return []
  const count = rarity === 'legendary' ? 1 + (hash01(`${seed}:p`) > 0.45 ? 1 : 0) : hash01(`${seed}:p`) > 0.55 ? 1 : 0
  const used = new Set<WeaponProc>()
  const out: WeaponProc[] = []
  let i = 0
  while (out.length < count && i < 16) {
    i += 1
    const pick = PROCS[Math.floor(hash01(`${seed}:${i}`) * PROCS.length)]
    if (!pick || used.has(pick.id)) continue
    used.add(pick.id)
    out.push(pick.id)
  }
  return out
}

function gearName(baseId: string, rarity: ItemRarity, procs: WeaponProc[], seed: string): string {
  const base = EQUIPMENT.find((entry) => entry.id === baseId)?.label ?? WEAPONS.find((gun) => gun.id === baseId)?.label ?? baseId
  if (rarity === 'common') return base
  if (rarity === 'magic') return `${STAT_AFFIXES[Math.floor(hash01(seed) * STAT_AFFIXES.length)]?.label ?? '附魔'}${base}`
  if (rarity === 'rare') return `${base} · 稀有`
  const prefix = LEGEND_PREFIX[Math.floor(hash01(`${seed}:pre`) * LEGEND_PREFIX.length)] ?? '裂地'
  const suffix = LEGEND_SUFFIX[Math.floor(hash01(`${seed}:suf`) * LEGEND_SUFFIX.length)] ?? '之怒'
  const proc = procs[0] ? procLabel(procs[0]) : ''
  return proc ? `${prefix}${base}${suffix}（${proc}）` : `${prefix}${base}${suffix}`
}

function hash01(seed: string): number {
  let hash = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return ((hash >>> 0) % 10_000) / 10_000
}
