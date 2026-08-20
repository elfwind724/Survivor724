import { seedFishingSpots } from '@/world/Fishing'
import { seedRuinCrates } from '@/world/Ruins'
import { seedBerryBushes } from '@/world/Forage'
import type { WorldState } from '@/simulation/types'

export const SAVE_VERSION = 3
export const SAVE_KEY = 'dawn-bastion-save'

export interface SaveFile {
  version: number
  world: WorldState
}

export function serializeWorld(world: WorldState): SaveFile {
  return {
    version: SAVE_VERSION,
    world: structuredClone(world),
  }
}

export function deserializeWorld(raw: unknown): WorldState {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid save')
  const file = raw as SaveFile
  if (typeof file.version !== 'number' || !file.world || typeof file.world !== 'object') {
    throw new Error('Invalid save')
  }
  const world = structuredClone(file.world)
  if (typeof world.worldSeed !== 'string' || world.worldSeed.length === 0) world.worldSeed = 'dawn'
  if (world.dungeonRun === undefined) world.dungeonRun = null
  if (world.dungeonRun && !Array.isArray(world.dungeonRun.spawnedRooms)) world.dungeonRun.spawnedRooms = []
  if (world.raidEntered !== true) world.raidEntered = false
  if (world.raidBestRarity === undefined) world.raidBestRarity = null
  if (typeof world.dayGunshots !== 'number' || world.dayGunshots < 0) world.dayGunshots = 0
  if (!world.dayNoise || typeof world.dayNoise !== 'object') {
    world.dayNoise = { north: 0, east: 0, west: 0, south: 0 }
  } else {
    world.dayNoise.north = Math.max(0, world.dayNoise.north || 0)
    world.dayNoise.east = Math.max(0, world.dayNoise.east || 0)
    world.dayNoise.west = Math.max(0, world.dayNoise.west || 0)
    world.dayNoise.south = Math.max(0, world.dayNoise.south || 0)
  }
  if (!Array.isArray(world.fishingSpots) || world.fishingSpots.length === 0) world.fishingSpots = seedFishingSpots()
  if (!Array.isArray(world.ruinCrates) || world.ruinCrates.length === 0) world.ruinCrates = seedRuinCrates()
  if (!Array.isArray(world.berryBushes) || world.berryBushes.length === 0) world.berryBushes = seedBerryBushes()
  if (Array.isArray(world.groundLoot)) {
    for (const drop of world.groundLoot) {
      if (typeof drop.count !== 'number' || drop.count < 1) drop.count = 1
    }
  }
  return world
}

export function saveToBrowser(world: WorldState): boolean {
  if (typeof localStorage === 'undefined') return false
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(serializeWorld(world)))
    return true
  } catch {
    return false
  }
}

export function loadFromBrowser(): WorldState | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    return deserializeWorld(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}
