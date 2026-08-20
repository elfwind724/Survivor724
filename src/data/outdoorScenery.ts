import type { DecorationState } from '@/simulation/types'
import { BASE } from '@/simulation/baseLayout'
import { assetById } from '@/data/assetIndex'

export const TOWER_STAND_HEIGHT = 2.05

export function seedOutdoorScenery(): DecorationState[] {
  const items: DecorationState[] = []
  const add = (assetId: string, x: number, z: number, yaw = 0, scale = 1): void => {
    if (!assetById(assetId)) return
    if (x > BASE.west - 6 && x < BASE.east + 6 && z > BASE.south - 6 && z < BASE.north + 6) return
    items.push({
      id: `scenery-${items.length + 1}-${assetId.replaceAll('/', '-')}`,
      assetId,
      x,
      z,
      yaw,
      scale,
    })
  }

  add('fort/mountain', 118, -78, 0.4, 12)
  add('fort/mountain-2', -122, 36, 1.1, 11)
  add('fort/mountains', 48, 128, 0.2, 13)
  add('fort/mountain-group', -108, -108, 2.2, 12)

  add('natureClump/pine-trees', 58, -22, 0.3, 1.12)
  add('natureClump/trees', 48, -32, 1.4, 1.12)
  add('natureClump/maple-trees', 68, -8, 0.6, 1.12)
  add('natureClump/pine-trees', 72, -36, 2.1, 1.12)
  add('natureClump/bushes', 42, -18, 0.8, 1.35)
  add('natureClump/rocks', -62, 28, 0.2, 1.35)
  add('natureClump/flower-bushes', 38, 48, 1.7, 1.35)

  const pines: Array<[number, number, number]> = [
    [50, -16, 0.2], [62, -28, 1.1], [70, -18, 2.4], [44, -26, 0.7],
    [78, -30, 1.8], [54, -40, 0.1], [66, 4, 2.8], [84, -14, 1.3],
    [-48, 44, 0.5], [-38, 54, 2.2], [36, 62, 1.6], [-72, 8, 0.9],
    [8, 72, 2.5], [-18, 68, 0.3], [88, 20, 1.4], [-84, -20, 2.0],
  ]
  for (const [x, z, yaw] of pines) add('nature/pine', x, z, yaw, 1)

  const trees: Array<[number, number, number]> = [
    [40, -38, 0.4], [74, -6, 1.9], [32, 58, 0.8], [-44, 62, 2.6],
    [18, -70, 1.2], [-28, -68, 0.1], [64, 42, 2.3],
  ]
  for (const [x, z, yaw] of trees) add('nature/tree', x, z, yaw, 1)

  const rocks: Array<[number, number, number]> = [
    [-58, 26, 0.2], [-50, 34, 1.4], [-64, 36, 2.1], [-46, 22, 0.7],
    [-70, 30, 1.8], [-42, 40, 0.3],
  ]
  for (const [x, z, yaw] of rocks) add('nature/rock-medium', x, z, yaw, 1)

  add('nature/rock-path-round-wide', -60, 30, 0.5, 1)
  add('nature/rock-path-round-wide', -52, 34, 0.9, 1)
  add('nature/rock-path-round-thin', -46, 38, 1.3, 1)
  add('nature/bush', 28, -44, 0.4, 1)
  add('nature/bush-with-flowers', 22, 52, 1.1, 1)
  add('nature/fern', -40, 46, 2.0, 1)

  add('natureKit/bush-with-flowers', 38, -16, 0.4, 1)
  add('natureKit/bush', 40, -20, 1.2, 1)
  add('natureKit/bush', 34, -14, 2.1, 1)
  add('natureKit/flower-group', 36, -18, 0.6, 1)
  add('natureKit/clover', 42, -12, 1.4, 1)
  add('natureKit/tall-grass', 22, 70, 0.3, 1)
  add('natureKit/tall-grass', 30, 76, 1.8, 1)
  add('natureKit/grass', 18, 68, 0.9, 1)
  add('natureKit/flower-group', 28, 64, 0.2, 1)
  add('natureKit/fern', -50, 36, 1.1, 1)
  add('natureKit/pebble-round', -54, 32, 0.4, 1)
  add('natureKit/pine', 64, -20, 0.7, 0.85)
  add('natureKit/tree', 46, -30, 1.4, 0.85)
  add('survival/bonfire', 40, 55, 0.2, 1.15)
  add('survival/torch', 38.6, 56.4, 0.8, 1)
  add('survival/torch', 41.4, 53.8, 2.4, 1)
  add('fort/mine', 42, 58, 0.3, 1)

  // 森林狩猎区 ~55,-20（x 保持在基地东缘外）
  add('natureClump/pine-trees', 52, -10, 1.6, 1.12)
  add('natureClump/pine-trees', 80, -24, 0.4, 1.12)
  add('natureClump/trees', 60, -40, 2.2, 1.12)
  add('natureClump/bushes', 46, -8, 0.5, 1.35)
  add('natureClump/birch-trees', 76, -6, 1.1, 1.12)
  const huntPines: Array<[number, number, number]> = [
    [46, -24, 0.4], [56, -8, 1.7], [60, -34, 2.3], [68, -24, 0.8],
    [74, -14, 1.5], [82, -26, 2.6], [52, -36, 1.9], [44, -10, 2.8],
  ]
  for (const [x, z, yaw] of huntPines) add('nature/pine-2', x, z, yaw, 1)
  add('nature/pine-3', 88, -8, 0.3, 1)
  add('nature/pine-4', 58, -16, 0.6, 1)
  add('nature/pine-5', 70, -40, 2.1, 1)
  add('nature/tree-2', 48, -8, 0.9, 1)
  add('nature/tree-3', 72, -42, 1.4, 1)
  add('nature/tree-4', 80, -34, 2.5, 1)
  add('natureKit/pine-2', 56, -26, 0.5, 0.85)
  add('natureKit/pine-3', 70, -10, 1.8, 0.85)
  add('natureKit/tree-2', 42, -28, 0.2, 0.85)
  add('nature/bush', 50, -20, 1.1, 1)
  add('nature/bush', 64, -32, 2.4, 1)
  add('nature/bush', 76, -18, 0.7, 1)
  add('natureKit/bush', 58, -12, 1.3, 1)
  add('natureKit/bush', 48, -34, 0.4, 1)
  add('natureKit/plant-big', 54, -18, 2.0, 1)
  add('natureKit/bush-with-flowers', 62, -6, 0.8, 1)
  add('natureKit/fern', 46, -14, 1.6, 1)
  add('natureKit/tall-grass', 52, -6, 0.3, 1)
  add('natureKit/tall-grass', 68, -28, 1.9, 1)

  // 河岸 ~-55,32（x 保持在基地西缘外）
  add('natureClump/rocks', -48, 44, 1.2, 1.35)
  add('natureClump/rocks', -70, 22, 0.6, 1.35)
  add('natureClump/grass', -58, 40, 2.0, 1.35)
  const bankRocks: Array<[number, number, number]> = [
    [-56, 22, 0.5], [-48, 30, 1.8], [-66, 24, 2.4], [-52, 40, 0.9],
    [-72, 36, 1.3], [-60, 42, 2.7], [-44, 28, 0.2],
  ]
  for (const [x, z, yaw] of bankRocks) add('nature/rock-medium-2', x, z, yaw, 1)
  add('nature/rock-medium-3', -68, 32, 1.1, 1)
  add('natureKit/rock-medium', -54, 26, 0.6, 1)
  add('natureKit/rock-medium-2', -62, 38, 2.2, 1)
  add('nature/rock-path-round-small', -58, 34, 0.4, 1)
  add('nature/rock-path-round-thin', -50, 28, 1.6, 1)
  add('fort/rock', -62, 32, 0.8, 1.8)
  add('fort/rock-2', -54, 38, 2.1, 1.6)
  add('nature/grass', -56, 30, 0.3, 1)
  add('nature/grass', -62, 26, 1.4, 1)
  add('nature/tall-grass', -52, 24, 2.0, 1)
  add('nature/tall-grass', -66, 40, 0.7, 1)
  add('natureKit/grass', -58, 38, 1.2, 1)
  add('natureKit/grass-wispy', -50, 42, 2.5, 1)
  add('natureKit/fern', -64, 28, 0.5, 1)
  add('nature/pebble-round', -56, 34, 1.8, 1)
  add('natureKit/pebble-round-2', -60, 28, 0.9, 1)
  add('nature/clover', -46, 26, 1.3, 1)
  add('natureKit/plant', -70, 34, 0.4, 1)

  // 废墟/山洞入口 ~40,55
  add('fort/mine', 40, 55, 0.4, 2.2)
  add('fort/hut', 34, 50, 1.8, 1.8)
  add('fort/shack', 46, 50, 1.2, 1.8)
  add('fort/hut-2', 44, 60, 2.4, 1.6)
  add('natureClump/dead-trees', 40, 48, 0.7, 1.12)
  add('nature/dead-tree', 36, 52, 0.3, 1)
  add('nature/dead-tree', 48, 58, 1.6, 1)
  add('nature/dead-tree-2', 32, 60, 2.2, 1)
  add('nature/dead-tree-3', 44, 48, 0.9, 1)
  add('nature/dead-tree-4', 52, 54, 1.4, 1)
  add('natureKit/dead-tree', 42, 52, 2.6, 0.85)
  add('natureKit/twisted-tree', 50, 62, 0.5, 0.85)
  add('nature/rock-medium', 38, 56, 0.8, 1)
  add('nature/rock-medium-3', 46, 54, 2.0, 1)
  add('natureKit/rock-medium-3', 34, 54, 1.3, 1)
  add('fort/rock-3', 48, 52, 0.6, 1.8)
  add('fort/rocks', 36, 58, 2.3, 1.6)
  add('fort/gold-rocks', 42, 46, 1.1, 1.5)
  add('fort/logs', 44, 56, 1.7, 1.8)
  add('fort/trees-cut', 52, 48, 0.2, 1.7)

  const path = (x0: number, z0: number, x1: number, z1: number): void => {
    const dist = Math.hypot(x1 - x0, z1 - z0)
    const steps = Math.max(2, Math.round(dist / 5))
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps
      add(
        i % 2 === 0 ? 'nature/rock-path-round-wide' : 'nature/rock-path-square-wide',
        x0 + (x1 - x0) * t,
        z0 + (z1 - z0) * t,
        t * 2.1,
        1,
      )
    }
  }
  path(26, 2, 48, -14)
  path(48, -14, 62, -22)
  path(-26, 6, -48, 24)
  path(-48, 24, -56, 32)
  path(6, 26, 24, 42)
  path(24, 42, 38, 52)

  fillWorldBiomes(add)
  return items
}

export const BIOME_PATCHES: Array<{ id: string; x: number; z: number; w: number; d: number; color: number }> = [
  { id: 'forest', x: 88, z: -28, w: 150, d: 130, color: 0x2a4630 },
  { id: 'river', x: -86, z: 38, w: 130, d: 110, color: 0x355044 },
  { id: 'ruins', x: 58, z: 72, w: 90, d: 90, color: 0x4a4336 },
  { id: 'pasture', x: 18, z: 96, w: 110, d: 90, color: 0x4a5c34 },
  { id: 'south-woods', x: 8, z: -96, w: 140, d: 110, color: 0x314a34 },
]

function fillWorldBiomes(add: (assetId: string, x: number, z: number, yaw?: number, scale?: number) => void): void {
  const rim: Array<[string, number, number, number, number]> = [
    ['fort/mountain', 158, -40, 0.2, 14],
    ['fort/mountain-2', 150, 70, 1.4, 13],
    ['fort/mountains', -40, 158, 0.6, 14],
    ['fort/mountain-group', -150, -50, 2.0, 13],
    ['fort/mountain', -155, 90, 0.9, 12],
    ['fort/mountain-2', 90, -155, 2.4, 13],
    ['fort/mountains', 155, 140, 1.1, 12],
    ['fort/mountain-group', -140, 150, 0.3, 12],
  ]
  for (const [id, x, z, yaw, scale] of rim) add(id, x, z, yaw, scale)

  scatter(add, ['natureClump/pine-trees', 'natureClump/trees', 'natureClump/birch-trees', 'natureClump/maple-trees'], 18, { minX: 42, maxX: 150, minZ: -110, maxZ: 8 }, [1.05, 1.28], 'forest-clump')
  scatter(add, ['nature/pine', 'nature/pine-2', 'nature/pine-3', 'nature/tree', 'nature/tree-2', 'nature/tree-5'], 48, { minX: 40, maxX: 148, minZ: -108, maxZ: 12 }, [0.9, 1.15], 'forest-tree')
  scatter(add, ['nature/bush', 'natureKit/bush', 'natureKit/fern', 'natureKit/plant-big', 'nature/tall-grass'], 36, { minX: 38, maxX: 140, minZ: -100, maxZ: 10 }, [0.9, 1.2], 'forest-under')

  scatter(add, ['natureClump/rocks', 'natureClump/grass'], 10, { minX: -140, maxX: -36, minZ: 4, maxZ: 108 }, [1.15, 1.4], 'river-clump')
  scatter(add, ['nature/rock-medium', 'nature/rock-medium-2', 'natureKit/rock-medium', 'nature/pebble-round', 'nature/tall-grass', 'natureKit/grass-wispy'], 40, { minX: -138, maxX: -38, minZ: 6, maxZ: 110 }, [0.85, 1.2], 'river-bank')

  scatter(add, ['natureClump/dead-trees', 'natureClump/dead-trees-2'], 8, { minX: 22, maxX: 108, minZ: 38, maxZ: 130 }, [1.05, 1.25], 'ruin-clump')
  scatter(add, ['nature/dead-tree', 'nature/dead-tree-2', 'nature/twisted-tree', 'natureKit/twisted-tree', 'nature/rock-medium-3', 'fort/rock'], 28, { minX: 24, maxX: 110, minZ: 40, maxZ: 128 }, [0.85, 1.2], 'ruin-prop')

  scatter(add, ['natureClump/grass', 'natureClump/flower-bushes', 'natureClump/flowers'], 12, { minX: -30, maxX: 90, minZ: 48, maxZ: 150 }, [1.1, 1.4], 'pasture-clump')
  scatter(add, ['nature/tall-grass', 'natureKit/tall-grass', 'nature/clover', 'natureKit/grass', 'nature/flower-group'], 34, { minX: -28, maxX: 88, minZ: 50, maxZ: 148 }, [0.9, 1.25], 'pasture-grass')

  scatter(add, ['natureClump/trees', 'natureClump/pine-trees', 'natureClump/bushes'], 14, { minX: -90, maxX: 90, minZ: -150, maxZ: -42 }, [1.05, 1.3], 'south-clump')
  scatter(add, ['nature/tree-3', 'nature/pine-4', 'nature/bush', 'natureKit/fern', 'nature/plant-big'], 32, { minX: -88, maxX: 88, minZ: -148, maxZ: -44 }, [0.9, 1.2], 'south-tree')
}

function scatter(
  add: (assetId: string, x: number, z: number, yaw?: number, scale?: number) => void,
  assets: string[],
  count: number,
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  scale: [number, number],
  salt: string,
): void {
  for (let i = 0; i < count; i += 1) {
    const x = bounds.minX + hash01(`${salt}:${i}:x`) * (bounds.maxX - bounds.minX)
    const z = bounds.minZ + hash01(`${salt}:${i}:z`) * (bounds.maxZ - bounds.minZ)
    if (blockedForDressing(x, z)) continue
    const asset = assets[Math.floor(hash01(`${salt}:${i}:a`) * assets.length)]
    if (!asset) continue
    const yaw = hash01(`${salt}:${i}:y`) * Math.PI * 2
    const size = scale[0] + hash01(`${salt}:${i}:s`) * (scale[1] - scale[0])
    add(asset, x, z, yaw, size)
  }
}

function blockedForDressing(x: number, z: number): boolean {
  if (x > BASE.west - 10 && x < BASE.east + 10 && z > BASE.south - 10 && z < BASE.north + 10) return true
  if (Math.abs(z) < 8 && (x > BASE.east - 6 || x < BASE.west + 6)) return true
  if (Math.abs(x) < 8 && (z > BASE.north - 6 || z < BASE.south + 6)) return true
  return false
}

function hash01(seed: string): number {
  let hash = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return ((hash >>> 0) % 10_000) / 10_000
}

export function isLifeBuilding(definitionId: string): boolean {
  return (
    definitionId !== 'wall' &&
    definitionId !== 'gate' &&
    definitionId !== 'watchtower' &&
    definitionId !== 'bonfire' &&
    definitionId !== 'brazier'
  )
}
