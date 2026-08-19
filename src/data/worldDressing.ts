import type { AssetCategory } from './assetIndex'

export const SURVIVOR_ASSETS: Record<string, string> = {
  hunter: 'people/adventurer',
  fisher: 'people/beach-character',
  scavenger: 'people/hoodie-character',
  hauler: 'people/worker',
  builder: 'people/man',
}

export const STRUCTURE_ASSETS: Record<string, string> = {
  wall: 'fort/wooden-wall',
  gate: 'fort/wooden-fortress-gate',
  kitchen: 'fort/house',
  warehouse: 'fort/storage-house',
  locker: 'fort/storage-shed',
  hall: 'fort/town-center',
  workshop: 'fort/shack',
  quarters: 'fort/hut',
  watchtower: 'fort/small-watch-tower',
  bonfire: 'survival/bonfire',
  brazier: 'survival/wooden-torch',
}

export const ENEMY_ASSETS: Record<string, string> = {
  wanderer: 'people/punk',
  runner: 'animals/wolf',
}

export function gateOpenAsset(closedAssetId: string): string {
  if (closedAssetId.includes('castle-gate') || closedAssetId.includes('second')) return 'fort/wall-towers-door-seco'
  return 'fort/wall-towers'
}

export const CREATIVE_TABS: Array<{ id: 'all' | AssetCategory; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'fort', label: '城墙设施' },
  { id: 'nature', label: '自然' },
  { id: 'natureClump', label: '树丛' },
  { id: 'natureKit', label: '野地' },
  { id: 'animals', label: '动物' },
  { id: 'interior', label: '室内' },
  { id: 'survival', label: '生存' },
  { id: 'food', label: '食物' },
  { id: 'guns', label: '枪械' },
]
