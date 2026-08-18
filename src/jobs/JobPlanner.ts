import { findStructure, materialsMet } from '@/base/construction'
import { isHero } from '@/controls/PlayerControl'
import { findSurvivor } from '@/simulation/EntityRegistry'
import type { JobRecord, WorldState } from '@/simulation/types'
import { assignJob, createJob } from './JobBoard'

export function planJobs(world: WorldState): void {
  planConstructionJobs(world)
  planKitchenJobs(world)
  dropStaleConstructionJobs(world)

  for (const job of world.jobs) {
    if (!job.assigneeId) continue
    const survivor = findSurvivor(world, job.assigneeId)
    if (!survivor || isHero(world, survivor)) {
      job.assigneeId = null
      continue
    }
    if (survivor.currentJobId !== job.id) survivor.currentJobId = job.id
  }

  for (const survivor of world.survivors) {
    if (isHero(world, survivor) || survivor.dayAssignment === 'follow') continue
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

  for (const survivor of world.survivors) {
    if (isHero(world, survivor) || survivor.dayAssignment === 'follow') continue
    if (hasActiveJob(world, survivor.currentJobId, survivor.id)) continue
    if (survivor.dayAssignment === 'build') {
      const wreck = world.jobs.find(
        (entry) => entry.definitionId === 'demolish' && (entry.assigneeId === null || entry.assigneeId === survivor.id) && jobIsActive(world, entry),
      )
      if (wreck) {
        assignJob(world, wreck.id, survivor.id)
        continue
      }
    }
    if (survivor.dayAssignment !== 'cook' && survivor.dayAssignment !== 'build') continue
    if (survivor.dayAssignment === 'build' && world.survivors.some((entry) => entry.dayAssignment === 'cook' && !entry.downed)) {
      continue
    }
    const cook = world.jobs.find(
      (entry) => entry.definitionId === 'cook' && (entry.assigneeId === null || entry.assigneeId === survivor.id) && jobIsActive(world, entry),
    )
    if (cook) assignJob(world, cook.id, survivor.id)
  }
}

function planConstructionJobs(world: WorldState): void {
  for (const structure of world.structures) {
    if (structure.stage === 'demolishing') {
      removeJobs(world, 'haul', structure.id)
      removeJobs(world, 'build', structure.id)
      ensureJob(world, 'demolish', structure.id)
      continue
    }
    if (structure.stage === 'complete') continue
    if (materialsMet(world, structure)) {
      structure.stage = 'building'
      removeJobs(world, 'haul', structure.id)
      removeJobs(world, 'demolish', structure.id)
      ensureJob(world, 'build', structure.id)
      continue
    }
    if (structure.stage === 'blueprint') structure.stage = 'hauling'
    removeJobs(world, 'build', structure.id)
    removeJobs(world, 'demolish', structure.id)
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

function planKitchenJobs(world: WorldState): void {
  const kitchen = world.structures.find((structure) => structure.definitionId === 'kitchen' && structure.stage === 'complete')
  if (!kitchen || !cookHasWork(world)) {
    world.jobs = world.jobs.filter((job) => job.definitionId !== 'cook')
    return
  }
  const existing = world.jobs.find((job) => job.definitionId === 'cook')
  if (existing) {
    existing.targetId = kitchen.id
    return
  }
  world.jobs.push(createJob({
    id: `cook-${kitchen.id}`,
    definitionId: 'cook',
    targetId: kitchen.id,
    assigneeId: null,
  }))
}

function cookHasWork(world: WorldState): boolean {
  const warehouse = world.inventories['inv-warehouse']
  if (warehouse && warehouse.items.some((item) => (item.itemId === 'raw_meat' || item.itemId === 'raw_fish') && item.count > 0)) {
    return true
  }
  return world.survivors.some((survivor) => {
    const bag = world.inventories[survivor.inventoryId]
    return !!bag && bag.items.some((item) => (item.itemId === 'raw_meat' || item.itemId === 'raw_fish' || item.itemId === 'meal') && item.count > 0)
  })
}

function jobIsActive(world: WorldState, job: JobRecord): boolean {
  if (job.definitionId === 'cook') return cookHasWork(world)
  if (job.definitionId === 'demolish') {
    const wreck = findStructure(world, job.targetId)
    return !!wreck && wreck.stage === 'demolishing'
  }
  if (job.definitionId !== 'haul' && job.definitionId !== 'build') return true
  const structure = findStructure(world, job.targetId)
  if (!structure || structure.stage === 'complete' || structure.stage === 'demolishing') return false
  if (job.definitionId === 'build') return materialsMet(world, structure)
  return !materialsMet(world, structure)
}

function hasActiveJob(world: WorldState, jobId: string | null, survivorId: string): boolean {
  if (!jobId) return false
  const job = world.jobs.find((entry) => entry.id === jobId)
  return !!job && job.assigneeId === survivorId && jobIsActive(world, job)
}

function ensureJob(world: WorldState, definitionId: 'haul' | 'build' | 'demolish', targetId: string): void {
  const existing = world.jobs.find((job) => job.definitionId === definitionId && job.targetId === targetId)
  if (existing) return
  world.jobs.push(createJob({
    id: `${definitionId}-${targetId}`,
    definitionId,
    targetId,
    assigneeId: null,
  }))
}

function removeJobs(world: WorldState, definitionId: 'haul' | 'build' | 'demolish', targetId: string): void {
  world.jobs = world.jobs.filter((job) => !(job.definitionId === definitionId && job.targetId === targetId))
}
