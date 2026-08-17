import type { WorldState } from '@/simulation/types'

export const SAVE_VERSION = 1

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
