import { BASE } from '@/simulation/baseLayout'
import { ASSET_INDEX, type AssetEntry } from './assetIndex'

export interface DressingPose {
  id: string
  assetId: string
  x: number
  z: number
  yaw: number
  scale?: number
}

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

const used = new Set<string>()
let serial = 0

export function worldDressing(): DressingPose[] {
  used.clear()
  serial = 0
  const poses: DressingPose[] = []
  const add = (assetId: string, x: number, z: number, yaw = 0, scale?: number): void => {
    used.add(assetId)
    const pose: DressingPose = { id: `dress-${serial}`, assetId, x, z, yaw }
    if (scale !== undefined) pose.scale = scale
    poses.push(pose)
    serial += 1
  }

  placeLandmarks(add)
  scatterForest(add)
  scatterRiver(add)
  scatterRuins(add)
  scatterVillage(add)
  scatterCampInteriors(add)
  scatterGunsAndFood(add)
  scatterLeftovers(add)
  return poses
}

export function reservedPeopleIds(): string[] {
  return ASSET_INDEX.filter((entry) => entry.category === 'people' && !Object.values(SURVIVOR_ASSETS).includes(entry.id)).map(
    (entry) => entry.id,
  )
}

export function unusedDressingIds(): string[] {
  const placed = new Set(worldDressing().map((pose) => pose.assetId))
  for (const id of Object.values(SURVIVOR_ASSETS)) placed.add(id)
  placed.add(STRUCTURE_ASSETS.wall)
  placed.add(STRUCTURE_ASSETS.gate)
  placed.add(STRUCTURE_ASSETS.kitchen)
  placed.add(STRUCTURE_ASSETS.warehouse)
  placed.add(STRUCTURE_ASSETS.locker)
  return ASSET_INDEX.filter((entry) => !placed.has(entry.id) && !reservedPeopleIds().includes(entry.id)).map((entry) => entry.id)
}

function placeLandmarks(add: Add): void {
  add('survival/bonfire', 0, 5)
  add('survival/tent', 8, 9, 0.4)
  add('survival/wood-log', -3, 6, 0.8)
  add('fort/watch-tower', BASE.west - 2, BASE.south - 2)
  add('fort/watch-tower-2', BASE.east + 2, BASE.south - 2, Math.PI / 2)
  add('fort/watch-tower-3', BASE.west - 2, BASE.north + 2, -Math.PI / 2)
  add('fort/small-watch-tower', BASE.east + 2, BASE.north + 2, Math.PI)
  add('fort/windmill', -24, -18, 0.3)
  add('fort/small-farm', 6, -20, 0.1)
  add('fort/farm', 14, -20, -0.15)
  add('fort/farm-dirt', -2, -21)
  add('fort/crops', 10, -16, 0.2)
  add('fort/market-stalls', 18, -12, -0.4)
  add('fort/village-market', 20, -6, 0.25)
  add('fort/town-center', 18, 10, 0.1)
  add('fort/hut', -22, 6, 0.2)
  add('fort/hut-2', -22, 14, -0.1)
  add('fort/house', -16, 16, 0.3)
  add('fort/storage-hut', -18, -10, 0.5)
  add('fort/archery-training-grounds', 22, 18, -0.2)
  add('fort/wooden-encampment', 4, 16, 0.15)
  add('natureClump/pine-trees', 48, -28, 0.2)
  add('natureClump/trees', 62, -12, 1.1)
  add('fort/dock', -55, 32, 0.4)
  add('fort/mountain', 92, -78, 0.3, 52)
  add('fort/mountains', -96, 88, 0.8, 44)
  add('fort/mountain-group', 110, 70, 0.2, 40)
}

function scatterForest(add: Add): void {
  const trees = named('pine', 'tree', 'twisted', 'dead tree', 'birch', 'maple')
  const under = named('bush', 'grass', 'fern', 'flower', 'clover', 'plant', 'mushroom', 'pebble', 'rock')
  let i = 0
  for (const entry of [...trees, ...under]) {
    if (entry.category !== 'nature' && entry.category !== 'natureClump' && entry.category !== 'fort') continue
    if (entry.name.toLowerCase().includes('mountain')) continue
    const { x, z } = ring(55, -20, 10 + (i % 9) * 3.4, i, 26)
    if (Math.hypot(x - 55, z + 20) < 6) {
      i += 1
      continue
    }
    if (insideYard(x, z)) {
      i += 1
      continue
    }
    add(entry.id, x, z, turn(i))
    i += 1
  }
  for (let n = 0; n < 36; n += 1) {
    const { x, z } = ring(55, -20, 14 + (n % 7) * 3.2, n + 3, 18)
    if (insideYard(x, z) || Math.hypot(x - 55, z + 20) < 6) continue
    const id = n % 3 === 0 ? 'nature/pine' : n % 3 === 1 ? 'nature/tree' : 'nature/tall-grass'
    add(id, x, z, turn(n * 5))
  }
}

function scatterRiver(add: Add): void {
  const water = named('dock', 'docks', 'port', 'raft', 'paddle')
  water.forEach((entry, index) => {
    const { x, z } = ring(-55, 32, 6 + index * 2.2, index, Math.max(6, water.length))
    add(entry.id, x, z, turn(index + 2))
  })
  named('rock', 'pebble', 'fern', 'grass', 'plant', 'bush').forEach((entry, index) => {
    if (used.has(entry.id)) return
    const { x, z } = ring(-58, 36, 8 + (index % 5) * 2.4, index, 14)
    add(entry.id, x, z, turn(index))
  })
}

function scatterRuins(add: Add): void {
  const wrecks = named('shack', 'mine', 'gold', 'dead', 'trash', 'can', 'bear', 'cut')
  wrecks.forEach((entry, index) => {
    const { x, z } = ring(42, 54, 5 + (index % 8) * 2.1, index, 16)
    add(entry.id, x, z, turn(index * 2))
  })
}

function scatterVillage(add: Add): void {
  const buildings = ASSET_INDEX.filter(
    (entry) =>
      entry.category === 'fort' &&
      !used.has(entry.id) &&
      !/wall|gate|mountain|dock|port|crop|farm dirt|pine|tree|rock|log/i.test(entry.name),
  )
  buildings.forEach((entry, index) => {
    const col = index % 6
    const row = Math.floor(index / 6)
    add(entry.id, -20 + col * 8, -46 - row * 9, turn(index + 1))
  })
}

function scatterCampInteriors(add: Add): void {
  const dorm = named('bed', 'night stand', 'chair', 'couch', 'rug', 'shelf', 'drawer', 'lamp', 'light', 'door', 'window', 'curtain', 'fireplace', 'stool', 'column', 'cactus', 'houseplant', 'towel', 'toilet', 'bathtub', 'sink', 'washing')
  dorm.forEach((entry, index) => {
    const col = index % 5
    const row = Math.floor(index / 5)
    add(entry.id, -26 + col * 1.7, 4 + row * 1.6, turn(index))
  })
}

function scatterGunsAndFood(add: Add): void {
  ASSET_INDEX.filter((entry) => entry.category === 'guns').forEach((entry, index) => {
    add(entry.id, 8 + (index % 5) * 0.7, -9 + Math.floor(index / 5) * 0.7, Math.PI / 2)
  })
  ASSET_INDEX.filter((entry) => entry.category === 'food').forEach((entry, index) => {
    const col = index % 8
    const row = Math.floor(index / 8)
    add(entry.id, 16 + col * 0.55, -10 + row * 0.55, turn(index))
  })
  ASSET_INDEX.filter((entry) => entry.category === 'survival' && !used.has(entry.id)).forEach((entry, index) => {
    const { x, z } = ring(1, 4, 3 + (index % 4), index, 12)
    add(entry.id, x, z, turn(index + 4))
  })
}

function scatterLeftovers(add: Add): void {
  ASSET_INDEX.forEach((entry, index) => {
    if (used.has(entry.id)) return
    if (entry.category === 'people') return
    const { x, z } = ring(40, 58, 12 + (index % 6) * 2, index, 20)
    add(entry.id, x, z, turn(index))
  })
}

type Add = (assetId: string, x: number, z: number, yaw?: number, scale?: number) => void

function named(...needles: string[]): AssetEntry[] {
  return ASSET_INDEX.filter((entry) => needles.some((needle) => entry.name.toLowerCase().includes(needle)))
}

function insideYard(x: number, z: number): boolean {
  return x > BASE.west - 2 && x < BASE.east + 2 && z > BASE.south - 2 && z < BASE.north + 2
}

function ring(cx: number, cz: number, radius: number, index: number, count: number): { x: number; z: number } {
  const angle = (index / Math.max(1, count)) * Math.PI * 2
  return { x: cx + Math.cos(angle) * radius, z: cz + Math.sin(angle) * radius }
}

function turn(seed: number): number {
  return ((seed * 47) % 360) * (Math.PI / 180)
}
