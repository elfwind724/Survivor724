import { findStructure, materialsMet, needsRepair } from '@/base/construction'
import { countItem } from '@/inventory/Inventory'
import { isHero } from '@/controls/PlayerControl'
import { findSurvivor } from '@/simulation/EntityRegistry'
import type { JobRecord, WorldState } from '@/simulation/types'
import { assignJob, createJob } from './JobBoard'

export function planJobs(world: WorldState): void {
  planConstructionJobs(world)
  planKitchenJobs(world)
  planRepairJobs(world)
  planUpgradeJobs(world)
  dropStaleConstructionJobs(world)

  for (const job of world.jobs) {
    if (!job.assigneeId) continue
    const survivor = findSurvivor(world, job.assigneeId)
    if (!survivor || survivor.downed) {
      job.assigneeId = null
      continue
    }
    if (survivor.id === world.player.controlledId) continue
    if (survivor.currentJobId !== job.id) survivor.currentJobId = job.id
  }

  for (const survivor of world.survivors) {
    if (survivor.id === world.player.controlledId || survivor.dayAssignment === 'follow') continue
    if (hasActiveJob(world, survivor.currentJobId, survivor.id)) continue
    if (!survivor.dayAssignment) continue
    if (survivor.dayAssignment === 'build' || survivor.dayAssignment === 'upgrade') continue
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
    if (survivor.dayAssignment === 'build' || survivor.dayAssignment === 'upgrade') {
      if (takeJob(world, survivor, 'demolish')) continue
      if (takeJob(world, survivor, 'upgrade')) continue
      if (survivor.dayAssignment === 'build' && takeJob(world, survivor, 'repair')) continue
      if (survivor.dayAssignment === 'build' && takeJob(world, survivor, 'build')) continue
    }
    if (survivor.dayAssignment === 'repair' && takeJob(world, survivor, 'repair')) continue
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

export function rushUpgrade(world: WorldState, structureId: string): string | null {
  ensureJob(world, 'upgrade', structureId)
  const job = world.jobs.find((entry) => entry.definitionId === 'upgrade' && entry.targetId === structureId)
  if (!job) return null
  const builder = world.survivors.find((survivor) => {
    if (survivor.downed || survivor.id === world.player.controlledId) return false
    if (survivor.dayAssignment === 'follow') return false
    return survivor.dayAssignment === 'build' || survivor.dayAssignment === 'upgrade' || survivor.professionId === 'builder'
  })
  if (!builder) return null
  for (const other of world.jobs) {
    if (other.assigneeId === builder.id && other.id !== job.id) other.assigneeId = null
  }
  builder.destination = null
  builder.path = []
  builder.workerState = 'RestOrNextJob'
  assignJob(world, job.id, builder.id)
  return builder.name
}

function takeJob(world: WorldState, survivor: { id: string }, definitionId: string): boolean {
  const job = world.jobs.find(
    (entry) =>
      entry.definitionId === definitionId &&
      (entry.assigneeId === null || entry.assigneeId === survivor.id) &&
      jobIsActive(world, entry),
  )
  if (!job) return false
  assignJob(world, job.id, survivor.id)
  return true
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
  if (warehouse && warehouse.items.some((item) => (item.itemId === 'raw_meat' || item.itemId === 'raw_fish' || item.itemId === 'berry' || item.itemId === 'raw_water') && item.count > 0)) {
    return true
  }
  return world.survivors.some((survivor) => {
    const bag = world.inventories[survivor.inventoryId]
    return !!bag && bag.items.some((item) => (item.itemId === 'raw_meat' || item.itemId === 'raw_fish' || item.itemId === 'berry' || item.itemId === 'raw_water' || item.itemId === 'meal') && item.count > 0)
  })
}

function planUpgradeJobs(world: WorldState): void {
  const keep = new Set(
    world.structures.filter((structure) => structure.upgrading && structure.stage === 'complete').map((entry) => entry.id),
  )
  world.jobs = world.jobs.filter((job) => job.definitionId !== 'upgrade' || keep.has(job.targetId))
  for (const id of keep) ensureJob(world, 'upgrade', id)
}

function planRepairJobs(world: WorldState): void {
  const wood = world.inventories['inv-warehouse']
  const canPatch = !!wood && countItem(wood, 'wood') > 0
  const damaged = canPatch
    ? world.structures.filter((structure) => needsRepair(structure))
    : []
  const keep = new Set(damaged.map((entry) => entry.id))
  world.jobs = world.jobs.filter((job) => job.definitionId !== 'repair' || keep.has(job.targetId))
  for (const structure of damaged) ensureJob(world, 'repair', structure.id)
}

function jobIsActive(world: WorldState, job: JobRecord): boolean {
  if (job.definitionId === 'cook') return cookHasWork(world)
  if (job.definitionId === 'upgrade') {
    const structure = findStructure(world, job.targetId)
    return !!structure && structure.upgrading && structure.stage === 'complete'
  }
  if (job.definitionId === 'repair') {
    const structure = findStructure(world, job.targetId)
    return !!structure && needsRepair(structure)
  }
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

function ensureJob(world: WorldState, definitionId: 'haul' | 'build' | 'demolish' | 'repair' | 'upgrade', targetId: string): void {
  const existing = world.jobs.find((job) => job.definitionId === definitionId && job.targetId === targetId)
  if (existing) return
  world.jobs.push(createJob({
    id: `${definitionId}-${targetId}`,
    definitionId,
    targetId,
    assigneeId: null,
  }))
}

function removeJobs(world: WorldState, definitionId: 'haul' | 'build' | 'demolish' | 'repair', targetId: string): void {
  world.jobs = world.jobs.filter((job) => !(job.definitionId === definitionId && job.targetId === targetId))
}
