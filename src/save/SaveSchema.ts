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
  if (world.raidEntered !== true) world.raidEntered = false
  if (world.raidBestRarity === undefined) world.raidBestRarity = null
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
