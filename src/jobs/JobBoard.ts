import type { JobRecord, WorldState } from '@/simulation/types'

export function createJob(input: JobRecord): JobRecord {
  return { ...input }
}

export function jobsFor(world: WorldState, survivorId: string): JobRecord[] {
  return world.jobs.filter((job) => job.assigneeId === survivorId)
}

export function assignJob(world: WorldState, jobId: string, survivorId: string): void {
  const job = world.jobs.find((entry) => entry.id === jobId)
  const survivor = world.survivors.find((entry) => entry.id === survivorId)
  if (!job || !survivor) return
  job.assigneeId = survivorId
  survivor.currentJobId = jobId
  if (survivor.workerState === 'Idle' || survivor.workerState === 'RestOrNextJob') {
    survivor.workerState = 'AcquireEquipment'
  }
}
