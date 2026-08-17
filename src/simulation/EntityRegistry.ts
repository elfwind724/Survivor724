import type { WorldState } from './types'

export function findSurvivor(world: WorldState, id: string) {
  return world.survivors.find((survivor) => survivor.id === id)
}

export function findNode(world: WorldState, id: string) {
  return world.nodes.find((node) => node.id === id)
}
