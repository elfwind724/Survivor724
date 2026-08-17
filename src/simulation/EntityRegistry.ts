import type { ContainerState, JobRecord, ResourceNodeState, SurvivorState, WorldState } from './types'

export function findSurvivor(world: WorldState, id: string): SurvivorState | undefined {
  return world.survivors.find((survivor) => survivor.id === id)
}

export function findNode(world: WorldState, id: string): ResourceNodeState | undefined {
  return world.nodes.find((node) => node.id === id)
}

export function findJob(world: WorldState, id: string): JobRecord | undefined {
  return world.jobs.find((job) => job.id === id)
}

export function findContainer(world: WorldState, kind: ContainerState['kind']): ContainerState | undefined {
  return world.containers.find((container) => container.kind === kind)
}
