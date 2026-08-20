import type { DecorationState } from '@/simulation/types'
import { BASE } from '@/simulation/baseLayout'
import { assetById } from '@/data/assetIndex'
import { RIVER_SPINE } from '@/data/landscape'

export const TOWER_STAND_HEIGHT = 2.05

export function seedOutdoorScenery(): DecorationState[] {
  const items: DecorationState[] = []
  const add = (assetId: string, x: number, z: number, yaw = 0, scale = 1): void => {
    if (!assetById(assetId)) return
    if (x > BASE.west - 1.4 && x < BASE.east + 1.4 && z > BASE.south - 1.4 && z < BASE.north + 1.4) return
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

  dressYardEdge(add)
  fillWorldBiomes(add)
  return items
}

function dressYardEdge(add: (assetId: string, x: number, z: number, yaw?: number, scale?: number) => void): void {
  // South palisade is the default camera vista — bushes and grass right outside the wall.
  add('natureClump/bushes', 12, -32, 0.55, 1.22)
  add('natureClump/flower-bushes', -14, -34, 1.7, 1.18)
  add('natureClump/grass', 18, -30, 0.2, 1.2)
  add('natureClump/grass', -9, -31, 2.1, 1.12)
  add('natureClump/flowers', 8, -36, 0.9, 1.1)
  add('nature/bush', 5.5, -29, 0.4, 1.05)
  add('nature/bush-with-flowers', -6, -29.4, 1.3, 1)
  add('nature/tall-grass', 2.4, -28.6, 0.15, 1.15)
  add('nature/tall-grass', -3.2, -28.8, 1.9, 1.1)
  add('natureKit/tall-grass', 9.5, -29.2, 0.7, 1.05)
  add('natureKit/fern', 15, -33, 1.1, 1)
  add('nature/rock-medium', 16.5, -36, 0.8, 0.95)
  add('natureKit/pebble-round', 7, -30.5, 0.3, 1)
  add('nature/pine', 22, -44, 0.5, 1)
  add('nature/tree', -21, -48, 1.4, 1)

  add('natureClump/bushes', 34, 8, 0.4, 1.15)
  add('natureClump/grass', 33, -12, 1.6, 1.12)
  add('nature/bush', 32, 14, 2.2, 1)
  add('natureKit/tall-grass', 31.5, -8, 0.6, 1.1)
  add('nature/fern', 35, 18, 1.8, 1)

  add('natureClump/flower-bushes', -34, -8, 0.9, 1.15)
  add('natureClump/grass', -33, 12, 2.4, 1.1)
  add('nature/bush', -32, -14, 0.3, 1)
  add('natureKit/fern', -35, 6, 1.2, 1)

  add('natureClump/grass', 10, 34, 0.5, 1.15)
  add('natureClump/bushes', -12, 35, 1.8, 1.12)
  add('nature/bush-with-flowers', 16, 33, 0.7, 1)
  add('natureKit/tall-grass', -6, 32.4, 2.0, 1.08)
}

const taken: Array<{ x: number; z: number; r: number }> = []

function fillWorldBiomes(add: (assetId: string, x: number, z: number, yaw?: number, scale?: number) => void): void {
  taken.length = 0
  const pines = ['nature/pine', 'nature/pine-2', 'nature/pine-3', 'nature/pine-4', 'nature/pine-5']
  const hardwood = ['nature/tree', 'nature/tree-2', 'nature/tree-3', 'nature/tree-4', 'nature/tree-5']
  const under = ['nature/bush', 'natureKit/bush', 'natureKit/fern', 'nature/plant-big', 'natureKit/plant']
  const grass = ['nature/tall-grass', 'natureKit/tall-grass', 'natureKit/grass', 'nature/clover', 'nature/flower-group']
  const dead = ['nature/dead-tree', 'nature/dead-tree-2', 'nature/twisted-tree', 'nature/twisted-tree-2']
  const rocks = ['nature/rock-medium', 'nature/rock-medium-2', 'natureKit/rock-medium', 'nature/pebble-round']

  const peaks = ['fort/mountain', 'fort/mountain-2', 'fort/mountains', 'fort/mountain-group']
  for (let i = 0; i < 11; i += 1) {
    const turn = (i / 11) * Math.PI * 2 + 0.18
    const reach = 152 + hash01(`rim:${i}:r`) * 18
    const x = Math.sin(turn) * reach
    const z = Math.cos(turn) * reach
    add(peaks[i % peaks.length]!, x, z, turn + 0.4, 11 + hash01(`rim:${i}:s`) * 3.5)
  }

  plantGrove(add, { cx: 72, cz: -28, radius: 24, hole: 6, trees: 16, brush: 9, canopy: pines, under, salt: 'grove-hunt-a' })
  plantGrove(add, { cx: 108, cz: -16, radius: 20, hole: 5, trees: 13, brush: 7, canopy: [...pines, ...hardwood], under, salt: 'grove-hunt-b' })
  plantGrove(add, { cx: 92, cz: -58, radius: 18, hole: 7, trees: 11, brush: 6, canopy: hardwood, under, salt: 'grove-hunt-c' })
  plantGrove(add, { cx: 128, cz: -42, radius: 16, hole: 4, trees: 9, brush: 5, canopy: pines, under, salt: 'grove-hunt-d' })

  plantGrove(add, { cx: -18, cz: -88, radius: 18, hole: 8, trees: 9, brush: 8, canopy: hardwood, under: grass, salt: 'grove-south-a' })
  plantGrove(add, { cx: 44, cz: -108, radius: 16, hole: 6, trees: 8, brush: 6, canopy: pines, under, salt: 'grove-south-b' })
  plantGrove(add, { cx: -52, cz: -72, radius: 14, hole: 5, trees: 7, brush: 5, canopy: hardwood, under: grass, salt: 'grove-south-c' })

  plantGrove(add, { cx: 8, cz: 108, radius: 14, hole: 9, trees: 5, brush: 12, canopy: hardwood, under: grass, salt: 'grove-meadow-a' })
  plantGrove(add, { cx: 52, cz: 118, radius: 12, hole: 7, trees: 4, brush: 10, canopy: pines, under: grass, salt: 'grove-meadow-b' })

  plantGrove(add, { cx: 78, cz: 92, radius: 16, hole: 5, trees: 8, brush: 6, canopy: dead, under: rocks, salt: 'grove-ruin-edge' })

  plantAlong(add, RIVER_SPINE, rocks, 3.2, 8, 'river-line')

  const brush = ['nature/bush', 'natureKit/bush', 'natureKit/fern', 'nature/bush-with-flowers', 'natureKit/plant']
  scatterAroundBase(add, grass, 2.2, 11, 120, 2.15, [0.88, 1.22], 'yard-grass')
  scatterAroundBase(add, brush, 5.5, 16, 40, 3.4, [0.9, 1.2], 'yard-brush')
  scatterAroundBase(add, rocks, 4.5, 18, 22, 4.1, [0.72, 1.08], 'yard-rock')
  scatterAroundBase(add, [...pines, ...hardwood], 15, 26, 12, 8.5, [0.86, 1.12], 'yard-tree')
  scatterAroundBase(add, grass, 12, 26, 64, 2.7, [0.9, 1.18], 'field-grass')
}

function plantGrove(
  add: (assetId: string, x: number, z: number, yaw?: number, scale?: number) => void,
  grove: {
    cx: number
    cz: number
    radius: number
    hole: number
    trees: number
    brush: number
    canopy: string[]
    under: string[]
    salt: string
  },
): void {
  ring(add, grove.canopy, grove.trees, grove.cx, grove.cz, grove.hole, grove.radius, 5.2, [0.92, 1.18], grove.salt)
  ring(add, grove.under, grove.brush, grove.cx, grove.cz, Math.max(2, grove.hole - 1), grove.radius + 3, 2.4, [0.85, 1.15], `${grove.salt}-under`)
}

function ring(
  add: (assetId: string, x: number, z: number, yaw?: number, scale?: number) => void,
  assets: string[],
  count: number,
  cx: number,
  cz: number,
  inner: number,
  outer: number,
  spacing: number,
  scale: [number, number],
  salt: string,
): void {
  let placed = 0
  for (let i = 0; i < count * 4 && placed < count; i += 1) {
    const ang = hash01(`${salt}:${i}:a`) * Math.PI * 2
    const t = inner / outer + hash01(`${salt}:${i}:t`) * (1 - inner / outer)
    const dist = outer * Math.sqrt(t)
    const x = cx + Math.cos(ang) * dist
    const z = cz + Math.sin(ang) * dist
    if (blockedForDressing(x, z) || tooClose(x, z, spacing)) continue
    const asset = assets[Math.floor(hash01(`${salt}:${i}:id`) * assets.length)]
    if (!asset) continue
    const yaw = hash01(`${salt}:${i}:y`) * Math.PI * 2
    const size = scale[0] + hash01(`${salt}:${i}:s`) * (scale[1] - scale[0])
    add(asset, x, z, yaw, size)
    taken.push({ x, z, r: spacing })
    placed += 1
  }
}

function plantAlong(
  add: (assetId: string, x: number, z: number, yaw?: number, scale?: number) => void,
  line: Array<[number, number]>,
  assets: string[],
  spacing: number,
  side: number,
  salt: string,
): void {
  let n = 0
  for (let i = 0; i < line.length - 1; i += 1) {
    const a = line[i]
    const b = line[i + 1]
    if (!a || !b) continue
    const dx = b[0] - a[0]
    const dz = b[1] - a[1]
    const len = Math.hypot(dx, dz) || 1
    const px = -dz / len
    const pz = dx / len
    const steps = Math.max(1, Math.round(len / 4.5))
    for (let s = 0; s <= steps; s += 1) {
      const t = s / steps
      const ox = (hash01(`${salt}:${n}:o`) - 0.5) * side
      const x = a[0] + dx * t + px * ox
      const z = a[1] + dz * t + pz * ox
      n += 1
      if (blockedForDressing(x, z) || tooClose(x, z, spacing)) continue
      const asset = assets[Math.floor(hash01(`${salt}:${n}:id`) * assets.length)]
      if (!asset) continue
      add(asset, x, z, hash01(`${salt}:${n}:y`) * Math.PI * 2, 0.85 + hash01(`${salt}:${n}:s`) * 0.4)
      taken.push({ x, z, r: spacing })
    }
  }
}

function scatterAroundBase(
  add: (assetId: string, x: number, z: number, yaw?: number, scale?: number) => void,
  assets: string[],
  inner: number,
  outer: number,
  count: number,
  spacing: number,
  scale: [number, number],
  salt: string,
): void {
  const faces: Array<{ ax: number; az: number; bx: number; bz: number; nx: number; nz: number }> = [
    { ax: BASE.west, az: BASE.south, bx: BASE.east, bz: BASE.south, nx: 0, nz: -1 },
    { ax: BASE.west, az: BASE.north, bx: BASE.east, bz: BASE.north, nx: 0, nz: 1 },
    { ax: BASE.west, az: BASE.south, bx: BASE.west, bz: BASE.north, nx: -1, nz: 0 },
    { ax: BASE.east, az: BASE.south, bx: BASE.east, bz: BASE.north, nx: 1, nz: 0 },
  ]
  let placed = 0
  for (let i = 0; i < count * 6 && placed < count; i += 1) {
    const face = faces[i % 4]
    if (!face) continue
    const t = hash01(`${salt}:${i}:t`)
    const dist = inner + hash01(`${salt}:${i}:d`) * (outer - inner)
    const x = face.ax + (face.bx - face.ax) * t + face.nx * dist
    const z = face.az + (face.bz - face.az) * t + face.nz * dist
    if (blockedForDressing(x, z) || tooClose(x, z, spacing)) continue
    const asset = assets[Math.floor(hash01(`${salt}:${i}:id`) * assets.length)]
    if (!asset) continue
    const size = scale[0] + hash01(`${salt}:${i}:s`) * (scale[1] - scale[0])
    add(asset, x, z, hash01(`${salt}:${i}:y`) * Math.PI * 2, size)
    taken.push({ x, z, r: spacing })
    placed += 1
  }
}

function tooClose(x: number, z: number, radius: number): boolean {
  return taken.some((spot) => Math.hypot(spot.x - x, spot.z - z) < Math.max(radius, spot.r) * 0.85)
}

function blockedForDressing(x: number, z: number): boolean {
  if (x > BASE.west - 1.4 && x < BASE.east + 1.4 && z > BASE.south - 1.4 && z < BASE.north + 1.4) return true
  if (Math.abs(z) < 5.5 && x > BASE.east && x < BASE.east + 14) return true
  if (Math.abs(z) < 5.5 && x < BASE.west && x > BASE.west - 14) return true
  if (Math.abs(x) < 5.5 && z > BASE.north && z < BASE.north + 14) return true
  if (Math.abs(x) < 5.5 && z < BASE.south && z > BASE.south - 14) return true
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
