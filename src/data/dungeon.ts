export type DungeonNodeKind = 'combat' | 'event' | 'reward' | 'elite' | 'exit'
export type DungeonPickId = 'ammo' | 'bandage' | 'gear_chest' | 'shrine'

export interface DungeonNodeDef {
  id: string
  kind: DungeonNodeKind
  luck: number
}

export const DUNGEON_ROOM_COUNT_MIN = 8
export const DUNGEON_ROOM_COUNT_MAX = 12
export const DUNGEON_ENTRANCE = { x: 40, z: 55 }
export const DUNGEON_CAVE = { originX: 34, originZ: 50, room: 9, hall: 3, cols: 4 }
export const DUNGEON_ROOM_SPACING = DUNGEON_CAVE.room + DUNGEON_CAVE.hall
export const ELITE_LUCK = 0.08
export const EXIT_LUCK = 0.15

export const COMBAT_AFFIX_IDS = ['min_dmg', 'max_dmg', 'aspd', 'crit', 'crit_dmg'] as const
export const SECONDARY_AFFIX_IDS = ['knockback', 'charm', 'str', 'agi', 'con', 'int'] as const

export const TUTORIAL_LINES = [
  'N 打开背包，点物品再点快捷栏互换',
  '1-9 使用快捷栏：换枪、吃饭、包扎',
  '废墟矿井旁按 E 进本刷宝，洞里随时可撤离，尽量天黑前出来',
  'C 打开人物面板对比哪把枪更强',
] as const

export const PICK_LABEL: Record<DungeonPickId, string> = {
  ammo: '弹药',
  bandage: '绷带',
  gear_chest: '装备箱',
  shrine: '神龛',
}

export const DUNGEON_DRESS_ASSETS = [
  'survival/torch',
  'survival/wooden-torch',
  'survival/wood-log',
  'survival/backpack',
  'survival/first-aid-kit',
  'survival/bonfire',
  'survival/tent',
  'survival/bear-trap',
  'survival/propane-tank',
  'survival/shovel',
  'fort/rock',
  'fort/logs',
] as const

export interface DungeonPropOffset {
  assetId: string
  ox: number
  oz: number
  yaw: number
  scale: number
}

const PICK_IDS: DungeonPickId[] = ['ammo', 'bandage', 'gear_chest', 'shrine']

const MID_KINDS: Array<{ kind: Exclude<DungeonNodeKind, 'exit'>; weight: number }> = [
  { kind: 'combat', weight: 50 },
  { kind: 'event', weight: 20 },
  { kind: 'reward', weight: 15 },
  { kind: 'elite', weight: 10 },
]

const MID_WEIGHT = MID_KINDS.reduce((sum, entry) => sum + entry.weight, 0)

export function generateDungeonLayout(dayIndex: number, worldSeed: string): DungeonNodeDef[] {
  const seed = `${dayIndex}+${worldSeed}`
  const span = DUNGEON_ROOM_COUNT_MAX - DUNGEON_ROOM_COUNT_MIN + 1
  const count = Math.min(
    DUNGEON_ROOM_COUNT_MAX,
    Math.max(DUNGEON_ROOM_COUNT_MIN, DUNGEON_ROOM_COUNT_MIN + Math.floor(hash01(seed) * span)),
  )
  const rooms: DungeonNodeDef[] = []
  for (let i = 0; i < count; i += 1) {
    const kind = i === 0 ? 'combat' : i === count - 1 ? 'exit' : pickMidKind(`${seed}:${i}`)
    rooms.push({
      id: `n${i}`,
      kind,
      luck: luckOf(kind),
    })
  }
  return rooms
}

export function rollRoomPicks(seed: string): DungeonPickId[] {
  const remaining = [...PICK_IDS]
  const picks: DungeonPickId[] = []
  for (let i = 0; i < 3; i += 1) {
    const index = Math.floor(hash01(`${seed}:${i}`) * remaining.length)
    const pick = remaining.splice(index, 1)[0]
    if (pick) picks.push(pick)
  }
  return picks
}

export function isCombatAffix(id: string): boolean {
  return (COMBAT_AFFIX_IDS as readonly string[]).includes(id)
}

export function dungeonPropOffsets(kind: DungeonNodeKind, seed: string): DungeonPropOffset[] {
  const corner = 3.2
  const torches: DungeonPropOffset[] = [
    { assetId: 'survival/torch', ox: -corner, oz: -corner, yaw: 0.4, scale: 1 },
    { assetId: 'survival/torch', ox: corner, oz: -corner, yaw: 1.2, scale: 1 },
    { assetId: 'survival/wooden-torch', ox: -corner, oz: corner, yaw: 2.2, scale: 1 },
    { assetId: 'survival/wooden-torch', ox: corner, oz: corner, yaw: 3.1, scale: 1 },
  ]
  const extra: Record<DungeonNodeKind, DungeonPropOffset[]> = {
    combat: [
      { assetId: 'survival/wood-log', ox: -2.8, oz: 0.6, yaw: 0.3, scale: 1 },
      { assetId: 'survival/propane-tank', ox: 2.9, oz: -0.8, yaw: 1.1, scale: 1 },
      { assetId: 'fort/rock', ox: 0.4, oz: -3.0, yaw: 0.7, scale: 0.7 },
    ],
    elite: [
      { assetId: 'survival/bear-trap', ox: -2.6, oz: 2.4, yaw: 0.2, scale: 1 },
      { assetId: 'fort/logs', ox: 2.8, oz: 0.2, yaw: 1.6, scale: 0.55 },
      { assetId: 'survival/propane-tank', ox: -0.5, oz: -3.0, yaw: 0.9, scale: 1 },
    ],
    reward: [
      { assetId: 'survival/backpack', ox: -2.7, oz: 2.2, yaw: 0.5, scale: 1 },
      { assetId: 'survival/first-aid-kit', ox: 2.8, oz: 1.6, yaw: 2.0, scale: 1 },
      { assetId: 'survival/wood-log', ox: 0.2, oz: -2.9, yaw: 0.8, scale: 1 },
    ],
    event: [
      { assetId: 'survival/bonfire', ox: 0, oz: 2.8, yaw: 0.1, scale: 0.9 },
      { assetId: 'survival/tent', ox: -2.8, oz: -1.6, yaw: 1.4, scale: 0.7 },
      { assetId: 'survival/backpack', ox: 2.9, oz: -1.2, yaw: 0.6, scale: 1 },
    ],
    exit: [
      { assetId: 'survival/shovel', ox: -2.8, oz: 2.4, yaw: 0.3, scale: 1 },
      { assetId: 'fort/logs', ox: 2.6, oz: -2.2, yaw: 1.1, scale: 0.5 },
      { assetId: 'survival/wood-log', ox: -0.4, oz: -3.0, yaw: 2.4, scale: 1 },
    ],
  }
  const spin = (hash01(`${seed}:yaw`) - 0.5) * 0.4
  return [...torches, ...(extra[kind] ?? extra.combat)].map((prop, index) => ({
    ...prop,
    yaw: prop.yaw + spin + hash01(`${seed}:${index}`) * 0.2,
  }))
}

function luckOf(kind: DungeonNodeKind): number {
  if (kind === 'elite') return ELITE_LUCK
  if (kind === 'exit') return EXIT_LUCK
  return 0
}

function pickMidKind(seed: string): Exclude<DungeonNodeKind, 'exit'> {
  let roll = hash01(seed) * MID_WEIGHT
  for (const entry of MID_KINDS) {
    roll -= entry.weight
    if (roll < 0) return entry.kind
  }
  return 'combat'
}

function hash01(seed: string): number {
  let hash = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return ((hash >>> 0) % 10_000) / 10_000
}
