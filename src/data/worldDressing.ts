import type { AssetCategory } from './assetIndex'

export const SURVIVOR_ASSETS: Record<string, string> = {
  hunter: 'people/adventurer',
  fisher: 'people/beach-character',
  scavenger: 'people/hoodie-character',
  hauler: 'people/worker',
  builder: 'people/man',
}

export const STRUCTURE_ASSETS = {
  wall: 'fort/wooden-wall',
  gate: 'fort/wooden-fortress-gate',
  kitchen: 'fort/house',
  warehouse: 'fort/storage-house',
  locker: 'fort/storage-shed',
} as const

export const CREATIVE_TABS: Array<{ id: 'all' | AssetCategory; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'fort', label: '城墙设施' },
  { id: 'nature', label: '自然' },
  { id: 'natureClump', label: '树丛' },
  { id: 'interior', label: '室内' },
  { id: 'survival', label: '生存' },
  { id: 'food', label: '食物' },
  { id: 'guns', label: '枪械' },
  { id: 'people', label: '人物' },
]
