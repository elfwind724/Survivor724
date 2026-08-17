import { findSurvivor } from '@/simulation/EntityRegistry'
import type { WorldState } from '@/simulation/types'
import { assignJob } from './JobBoard'

export function planJobs(world: WorldState): void {
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
