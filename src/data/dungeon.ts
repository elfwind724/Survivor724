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
