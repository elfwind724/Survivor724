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
  return items
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
