import { findStructure, materialsMet } from '@/base/construction'
import { findSurvivor } from '@/simulation/EntityRegistry'
import type { WorldState } from '@/simulation/types'
import { assignJob, createJob } from './JobBoard'

export function planJobs(world: WorldState): void {
  planConstructionJobs(world)

  for (const job of world.jobs) {
    if (!job.assigneeId) continue
    const survivor = findSurvivor(world, job.assigneeId)
    if (!survivor) {
      job.assigneeId = null
      continue
    }
    if (survivor.currentJobId !== job.id) survivor.currentJobId = job.id
  }

  for (const survivor of world.survivors) {
    if (survivor.currentJobId) {
      const job = world.jobs.find((entry) => entry.id === survivor.currentJobId)
      if (job && job.assigneeId === survivor.id) continue
    }
    if (!survivor.dayAssignment) continue
    const job = world.jobs.find(
      (entry) => entry.definitionId === survivor.dayAssignment && (entry.assigneeId === null || entry.assigneeId === survivor.id),
    )
    if (job) assignJob(world, job.id, survivor.id)
  }
}

function planConstructionJobs(world: WorldState): void {
  for (const structure of world.structures) {
    if (structure.stage === 'complete') continue
    if (materialsMet(world, structure)) {
      structure.stage = 'building'
      ensureJob(world, 'build', structure.id)
      continue
    }
    if (structure.stage === 'blueprint') structure.stage = 'hauling'
    ensureJob(world, 'haul', structure.id)
  }
}

function ensureJob(world: WorldState, definitionId: 'haul' | 'build', targetId: string): void {
  const existing = world.jobs.find((job) => job.definitionId === definitionId && job.targetId === targetId)
  if (existing) return
  world.jobs.push(createJob({
    id: `${definitionId}-${targetId}`,
    definitionId,
    targetId,
    assigneeId: null,
  }))
}
