import { completeStructure, findStructure, materialsMet, sitePosition, stillNeeded } from '@/base/construction'
import { derivedStats } from '@/data/equipment'
import { clearJobTools, syncToolsToEquipment } from '@/survivors/Equipment'
import { harvestWildlife, tryShoot } from '@/combat/Combat'
import { nodeAllowedForSurvivor } from '@/base/workZones'
import { WORK_SECONDS, jobDefinition } from '@/data/jobs'
import { addItem, canAdd, inventoryOf, removeItem, usedSlots } from '@/inventory/Inventory'
import { beginTravel, followTravel } from '@/navigation/Travel'
import { findContainer, findJob, findNode } from '@/simulation/EntityRegistry'
import { distanceXZ, type DayPhase, type SurvivorState, type WorldState } from '@/simulation/types'

export function isWorkPhase(phase: DayPhase): boolean {
  return phase === 'dawn' || phase === 'day'
}

export function isReturnPhase(phase: DayPhase): boolean {
  return phase === 'dusk' || phase === 'night' || phase === 'aftermath'
}

export function hasRequiredTools(survivor: SurvivorState, definitionId: string): boolean {
  const definition = jobDefinition(definitionId)
  if (!definition) return false
  return definition.requiredTools.every((tool) => survivor.carriedTools.includes(tool))
}

export function bagIsFull(world: WorldState, survivor: SurvivorState): boolean {
  const bag = inventoryOf(world.inventories, survivor.inventoryId)
  return usedSlots(bag) >= Math.max(1, Math.floor(bag.capacity * survivor.returnFill))
}

export function shouldReturn(world: WorldState, survivor: SurvivorState): boolean {
  return isReturnPhase(world.time.phase) || bagIsFull(world, survivor)
}

export function stepDayWorker(world: WorldState, survivor: SurvivorState, dt: number): void {
  if (world.player.controlledId === survivor.id) return
  const job = currentJob(world, survivor)
  const definition = job ? jobDefinition(job.definitionId) : undefined
  if (isReturnPhase(world.time.phase) && isInterruptible(survivor.workerState, definition?.category ?? 'field')) {
    beginReturn(world, survivor)
  }

  switch (survivor.workerState) {
    case 'Idle':
    case 'RestOrNextJob':
      if ((survivor.destination || survivor.path.length > 0) && !followTravel(world, survivor, dt)) break
      startNextAction(world, survivor)
      break
    case 'AcquireEquipment':
      stepAcquire(world, survivor, dt)
      break
    case 'TravelToTarget':
      stepTravel(world, survivor, dt)
      break
    case 'Work':
      if (definition?.id === 'build') stepBuild(world, survivor, dt)
      else stepWork(world, survivor, dt)
      break
    case 'CollectOutput':
      if (definition?.id === 'haul') stepHaulCollect(world, survivor)
      else stepCollect(world, survivor)
      break
    case 'ReturnToBase':
      if (followTravel(world, survivor, dt)) survivor.workerState = 'DepositItems'
      break
    case 'DepositItems':
      if (definition?.id === 'haul' && isWorkPhase(world.time.phase)) stepHaulDeposit(world, survivor)
      else stepDeposit(world, survivor)
      break
    case 'ReturnEquipment':
      stepReturnEquipment(world, survivor, dt)
      break
    default:
      break
  }
}

function isInterruptible(state: SurvivorState['workerState'], category: 'field' | 'base' | 'defense'): boolean {
  if (state !== 'TravelToTarget' && state !== 'Work' && state !== 'CollectOutput') return false
  return category === 'field' || category === 'base'
}

function startNextAction(world: WorldState, survivor: SurvivorState): void {
  if (!isWorkPhase(world.time.phase)) {
    if (survivor.carriedTools.length > 0) {
      goToLocker(world, survivor, 'ReturnEquipment')
      return
    }
    goHome(world, survivor)
    return
  }

  const job = currentJob(world, survivor)
  if (!job) return

  const definition = jobDefinition(job.definitionId)
  if (!definition) return

  if (definition.requiredTools.length > 0 && !hasRequiredTools(survivor, definition.id)) {
    goToLocker(world, survivor, 'AcquireEquipment')
    return
  }

  if (definition.id === 'haul') {
    const structure = findStructure(world, job.targetId)
    if (!structure || structure.stage === 'complete' || materialsMet(world, structure)) {
      goHome(world, survivor)
      return
    }
    const bag = inventoryOf(world.inventories, survivor.inventoryId)
    const target = usedSlots(bag) > 0 ? sitePosition(world, structure) : warehousePosition(world, survivor)
    if (beginTravel(world, survivor, target)) survivor.workerState = 'TravelToTarget'
    return
  }

  if (definition.id === 'build') {
    const structure = findStructure(world, job.targetId)
    if (!structure || structure.stage === 'complete' || !materialsMet(world, structure)) {
      goHome(world, survivor)
      return
    }
    if (beginTravel(world, survivor, sitePosition(world, structure))) survivor.workerState = 'TravelToTarget'
    return
  }

  const node = findNode(world, job.targetId)
  if (!node || node.reserve <= 0 || !nodeAllowedForSurvivor(world, survivor, node)) {
    goHome(world, survivor)
    return
  }

  if (beginTravel(world, survivor, node.position)) survivor.workerState = 'TravelToTarget'
}

function stepAcquire(world: WorldState, survivor: SurvivorState, dt: number): void {
  if (!followTravel(world, survivor, dt)) return

  const job = currentJob(world, survivor)
  const locker = findContainer(world, 'tool_locker')
  if (!job || !locker) {
    survivor.blockedReason = 'missing_tool'
    return
  }

  const definition = jobDefinition(job.definitionId)
  const lockerInv = inventoryOf(world.inventories, locker.inventoryId)
  if (!definition) {
    survivor.blockedReason = 'missing_tool'
    return
  }

  for (const tool of definition.requiredTools) {
    if (survivor.carriedTools.includes(tool)) continue
    if (!removeItem(lockerInv, tool, 1)) {
      survivor.blockedReason = 'missing_tool'
      survivor.destination = null
      return
    }
    survivor.carriedTools.push(tool)
  }
  syncToolsToEquipment(survivor)

  survivor.blockedReason = null
  startNextAction(world, survivor)
}

function stepTravel(world: WorldState, survivor: SurvivorState, dt: number): void {
  if (!followTravel(world, survivor, dt)) return
  const job = currentJob(world, survivor)
  const definition = job ? jobDefinition(job.definitionId) : undefined
  if (definition?.id === 'haul') {
    const bag = inventoryOf(world.inventories, survivor.inventoryId)
    survivor.workerState = usedSlots(bag) > 0 ? 'DepositItems' : 'CollectOutput'
    return
  }
  survivor.workElapsed = 0
  survivor.workerState = 'Work'
}

function stepWork(world: WorldState, survivor: SurvivorState, dt: number): void {
  const job = currentJob(world, survivor)
  if (job && jobDefinition(job.definitionId)?.id === 'hunt') {
    const deer = world.wildlife.find((entry) => entry.alive && distanceXZ(entry.position, survivor.position) < 22)
    if (deer) {
      if (distanceXZ(deer.position, survivor.position) > 10) {
        beginTravel(world, survivor, deer.position)
        survivor.workerState = 'TravelToTarget'
        return
      }
      const dx = deer.position.x - survivor.position.x
      const dz = deer.position.z - survivor.position.z
      survivor.facingYaw = Math.atan2(dx, dz)
      if (!tryShoot(world, survivor) && survivor.ammo <= 0) {
        survivor.workElapsed += dt
        if (survivor.workElapsed >= WORK_SECONDS) {
          survivor.workElapsed = 0
          survivor.workerState = 'CollectOutput'
        }
      }
      if (!deer.alive) survivor.workerState = 'CollectOutput'
      return
    }
  }
  survivor.workElapsed += dt * derivedStats(survivor.attributes, survivor.equipment).workRate
  if (survivor.workElapsed >= WORK_SECONDS) {
    survivor.workElapsed = 0
    survivor.workerState = 'CollectOutput'
  }
}

function stepCollect(world: WorldState, survivor: SurvivorState): void {
  const job = currentJob(world, survivor)
  const node = job ? findNode(world, job.targetId) : undefined
  const definition = job ? jobDefinition(job.definitionId) : undefined
  const bag = inventoryOf(world.inventories, survivor.inventoryId)

  if (!job || !node || !definition) {
    beginReturn(world, survivor)
    return
  }

  if (!hasRequiredTools(survivor, definition.id)) {
    survivor.blockedReason = 'missing_tool'
    beginReturn(world, survivor)
    return
  }

  if (definition.id === 'hunt' && harvestWildlife(world, survivor)) {
    if (shouldReturn(world, survivor)) beginReturn(world, survivor)
    else survivor.workerState = 'Work'
    return
  }

  if (node.reserve <= 0 || !canAdd(bag, 1) || shouldReturn(world, survivor)) {
    beginReturn(world, survivor)
    return
  }

  if (addItem(bag, definition.outputItemId, 1)) {
    node.reserve -= 1
  }

  if (shouldReturn(world, survivor) || node.reserve <= 0) {
    beginReturn(world, survivor)
    return
  }

  survivor.workerState = 'Work'
}

function stepHaulCollect(world: WorldState, survivor: SurvivorState): void {
  const job = currentJob(world, survivor)
  const structure = job ? findStructure(world, job.targetId) : undefined
  const warehouse = findContainer(world, 'warehouse')
  if (!job || !structure || !warehouse) {
    goHome(world, survivor)
    return
  }

  const bag = inventoryOf(world.inventories, survivor.inventoryId)
  const stock = inventoryOf(world.inventories, warehouse.inventoryId)
  for (const need of stillNeeded(world, structure)) {
    const space = bag.capacity - usedSlots(bag)
    if (space <= 0) break
    const take = Math.min(need.count, space)
    if (removeItem(stock, need.itemId, take)) addItem(bag, need.itemId, take)
  }

  if (usedSlots(bag) === 0) {
    goHome(world, survivor)
    return
  }

  if (beginTravel(world, survivor, sitePosition(world, structure))) survivor.workerState = 'TravelToTarget'
}

function stepHaulDeposit(world: WorldState, survivor: SurvivorState): void {
  const job = currentJob(world, survivor)
  const structure = job ? findStructure(world, job.targetId) : undefined
  if (!structure) {
    beginReturn(world, survivor)
    return
  }

  const bag = inventoryOf(world.inventories, survivor.inventoryId)
  const site = inventoryOf(world.inventories, structure.inventoryId)
  const remaining = []
  for (const item of bag.items) {
    if (addItem(site, item.itemId, item.count)) continue
    remaining.push({ ...item })
  }
  bag.items = remaining
  if (remaining.length > 0) {
    survivor.blockedReason = 'warehouse_full'
    return
  }

  if (isReturnPhase(world.time.phase)) {
    beginReturn(world, survivor)
    return
  }
  startNextAction(world, survivor)
}

function stepBuild(world: WorldState, survivor: SurvivorState, dt: number): void {
  const job = currentJob(world, survivor)
  const structure = job ? findStructure(world, job.targetId) : undefined
  if (!structure || !materialsMet(world, structure)) {
    goHome(world, survivor)
    return
  }

  structure.stage = 'building'
  structure.buildElapsed += dt * derivedStats(survivor.attributes, survivor.equipment).workRate
  if (structure.buildElapsed >= structure.buildDuration) {
    completeStructure(world, structure)
    goHome(world, survivor)
  }
}

function beginReturn(world: WorldState, survivor: SurvivorState): void {
  const warehouse = findContainer(world, 'warehouse')
  const target = warehouse ? warehouse.position : survivor.homePosition
  survivor.workerState = 'ReturnToBase'
  survivor.workElapsed = 0
  beginTravel(world, survivor, target)
}

function stepDeposit(world: WorldState, survivor: SurvivorState): void {
  const bag = inventoryOf(world.inventories, survivor.inventoryId)
  const warehouse = findContainer(world, 'warehouse')
  if (!warehouse) {
    survivor.blockedReason = 'warehouse_full'
    return
  }

  const stock = inventoryOf(world.inventories, warehouse.inventoryId)
  const remaining: typeof bag.items = []
  for (const item of bag.items) {
    if (addItem(stock, item.itemId, item.count)) continue
    remaining.push({ ...item })
  }
  bag.items = remaining

  if (remaining.length > 0) {
    survivor.blockedReason = 'warehouse_full'
    survivor.destination = null
    return
  }

  if (survivor.blockedReason !== 'missing_tool') survivor.blockedReason = null
  if (isReturnPhase(world.time.phase)) {
    goToLocker(world, survivor, 'ReturnEquipment')
    return
  }
  startNextAction(world, survivor)
}

function stepReturnEquipment(world: WorldState, survivor: SurvivorState, dt: number): void {
  if (!followTravel(world, survivor, dt)) return
  const locker = findContainer(world, 'tool_locker')
  if (locker) {
    const lockerInv = inventoryOf(world.inventories, locker.inventoryId)
    for (const tool of survivor.carriedTools) addItem(lockerInv, tool, 1)
  }
  const returned = [...survivor.carriedTools]
  survivor.carriedTools = []
  clearJobTools(survivor, returned)
  goHome(world, survivor)
}

function goToLocker(
  world: WorldState,
  survivor: SurvivorState,
  state: 'AcquireEquipment' | 'ReturnEquipment',
): void {
  const locker = findContainer(world, 'tool_locker')
  const target = locker ? locker.position : survivor.homePosition
  survivor.workerState = state
  beginTravel(world, survivor, target)
}

function goHome(world: WorldState, survivor: SurvivorState): void {
  survivor.workerState = 'RestOrNextJob'
  beginTravel(world, survivor, survivor.homePosition)
}

function warehousePosition(world: WorldState, survivor: SurvivorState) {
  return findContainer(world, 'warehouse')?.position ?? survivor.homePosition
}

function currentJob(world: WorldState, survivor: SurvivorState) {
  return survivor.currentJobId ? findJob(world, survivor.currentJobId) : undefined
}
