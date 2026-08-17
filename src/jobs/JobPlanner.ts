import { findStructure, materialsMet } from '@/base/construction'
import { findSurvivor } from '@/simulation/EntityRegistry'
import type { JobRecord, WorldState } from '@/simulation/types'
import { assignJob, createJob } from './JobBoard'

export function planJobs(world: WorldState): void {
  planConstructionJobs(world)
  dropStaleConstructionJobs(world)

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
    if (hasActiveJob(world, survivor.currentJobId, survivor.id)) continue
    if (!survivor.dayAssignment) continue
    const job = world.jobs.find(
      (entry) =>
        entry.definitionId === survivor.dayAssignment &&
        (entry.assigneeId === null || entry.assigneeId === survivor.id) &&
        jobIsActive(world, entry),
    )
    if (job) assignJob(world, job.id, survivor.id)
  }
}

function planConstructionJobs(world: WorldState): void {
  for (const structure of world.structures) {
    if (structure.stage === 'complete') continue
    if (materialsMet(world, structure)) {
      structure.stage = 'building'
      removeJobs(world, 'haul', structure.id)
      ensureJob(world, 'build', structure.id)
      continue
    }
    if (structure.stage === 'blueprint') structure.stage = 'hauling'
    removeJobs(world, 'build', structure.id)
    ensureJob(world, 'haul', structure.id)
  }
}

function dropStaleConstructionJobs(world: WorldState): void {
  const stale = world.jobs.filter((job) => !jobIsActive(world, job))
  if (stale.length === 0) return
  const staleIds = new Set(stale.map((job) => job.id))
  world.jobs = world.jobs.filter((job) => !staleIds.has(job.id))
  for (const survivor of world.survivors) {
    if (!survivor.currentJobId || !staleIds.has(survivor.currentJobId)) continue
    survivor.currentJobId = null
    if (survivor.workerState === 'TravelToTarget' || survivor.workerState === 'Work' || survivor.workerState === 'CollectOutput' || survivor.workerState === 'DepositItems' || survivor.workerState === 'AcquireEquipment') {
      survivor.workerState = 'RestOrNextJob'
      survivor.path = []
      survivor.destination = null
    }
  }
}

function jobIsActive(world: WorldState, job: JobRecord): boolean {
  if (job.definitionId !== 'haul' && job.definitionId !== 'build') return true
  const structure = findStructure(world, job.targetId)
  if (!structure || structure.stage === 'complete') return false
  if (job.definitionId === 'build') return materialsMet(world, structure)
  return !materialsMet(world, structure)
}

function hasActiveJob(world: WorldState, jobId: string | null, survivorId: string): boolean {
  if (!jobId) return false
  const job = world.jobs.find((entry) => entry.id === jobId)
  return !!job && job.assigneeId === survivorId && jobIsActive(world, job)
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

function removeJobs(world: WorldState, definitionId: 'haul' | 'build', targetId: string): void {
  world.jobs = world.jobs.filter((job) => !(job.definitionId === definitionId && job.targetId === targetId))
}
