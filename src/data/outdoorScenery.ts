import type { DecorationState } from '@/simulation/types'
import { BASE } from '@/simulation/baseLayout'
import { assetById } from '@/data/assetIndex'

export const TOWER_STAND_HEIGHT = 5.2

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

  add('fort/mountain', 92, -48, 0.4, 46)
  add('fort/mountain-2', -96, 18, 1.1, 46)
  add('fort/mountains', 24, 98, 0.2, 46)
  add('fort/mountain-group', -70, -80, 2.2, 46)

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
  return items
}

export function isLifeBuilding(definitionId: string): boolean {
  return (
    definitionId === 'kitchen' ||
    definitionId === 'quarters' ||
    definitionId === 'workshop' ||
    definitionId === 'hall' ||
    definitionId === 'warehouse'
  )
}
