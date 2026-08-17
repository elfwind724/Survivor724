import { WORK_SECONDS, jobDefinition } from '@/data/jobs'
import { addItem, canAdd, inventoryOf, removeItem, usedSlots } from '@/inventory/Inventory'
import { findContainer, findJob, findNode } from '@/simulation/EntityRegistry'
import type { DayPhase, SurvivorState, WorldState } from '@/simulation/types'
import { moveToward } from '@/survivors/Survivor'

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
  if (isReturnPhase(world.time.phase) && isFieldState(survivor.workerState)) {
    beginReturn(world, survivor)
  }

  switch (survivor.workerState) {
    case 'Idle':
    case 'RestOrNextJob':
      if (survivor.destination && !moveToward(survivor, dt)) break
      survivor.destination = null
      startNextAction(world, survivor)
      break
    case 'AcquireEquipment':
      stepAcquire(world, survivor, dt)
      break
    case 'TravelToTarget':
      stepTravel(world, survivor, dt)
      break
    case 'Work':
      stepWork(survivor, dt)
      break
    case 'CollectOutput':
      stepCollect(world, survivor)
      break
    case 'ReturnToBase':
      if (moveToward(survivor, dt)) survivor.workerState = 'DepositItems'
      break
    case 'DepositItems':
      stepDeposit(world, survivor)
      break
    case 'ReturnEquipment':
      stepReturnEquipment(world, survivor, dt)
      break
    default:
      break
  }
}

function isFieldState(state: SurvivorState['workerState']): boolean {
  return state === 'TravelToTarget' || state === 'Work' || state === 'CollectOutput'
}

function startNextAction(world: WorldState, survivor: SurvivorState): void {
  if (!isWorkPhase(world.time.phase)) {
    if (survivor.carriedTools.length > 0) {
      goToLocker(world, survivor, 'ReturnEquipment')
      return
    }
    goHome(survivor)
    return
  }

  const job = currentJob(world, survivor)
  if (!job) return

  survivor.blockedReason = null
  if (!hasRequiredTools(survivor, job.definitionId)) {
    goToLocker(world, survivor, 'AcquireEquipment')
    return
  }

  const node = findNode(world, job.targetId)
  if (!node || node.reserve <= 0) {
    goHome(survivor)
    return
  }

  survivor.destination = { ...node.position }
  survivor.workerState = 'TravelToTarget'
}

function stepAcquire(world: WorldState, survivor: SurvivorState, dt: number): void {
  if (!moveToward(survivor, dt)) return

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

  survivor.blockedReason = null
  const node = findNode(world, job.targetId)
  survivor.destination = node ? { ...node.position } : null
  survivor.workerState = node ? 'TravelToTarget' : 'RestOrNextJob'
}

function stepTravel(world: WorldState, survivor: SurvivorState, dt: number): void {
  if (moveToward(survivor, dt)) {
    survivor.workElapsed = 0
    survivor.workerState = 'Work'
  }
}

function stepWork(survivor: SurvivorState, dt: number): void {
  survivor.workElapsed += dt
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

function beginReturn(world: WorldState, survivor: SurvivorState): void {
  const warehouse = findContainer(world, 'warehouse')
  survivor.destination = warehouse ? { ...warehouse.position } : { ...survivor.homePosition }
  survivor.workerState = 'ReturnToBase'
  survivor.workElapsed = 0
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

  survivor.blockedReason = null
  if (isReturnPhase(world.time.phase)) {
    goToLocker(world, survivor, 'ReturnEquipment')
    return
  }
  startNextAction(world, survivor)
}

function stepReturnEquipment(world: WorldState, survivor: SurvivorState, dt: number): void {
  if (!moveToward(survivor, dt)) return
  const locker = findContainer(world, 'tool_locker')
  if (locker) {
    const lockerInv = inventoryOf(world.inventories, locker.inventoryId)
    for (const tool of survivor.carriedTools) addItem(lockerInv, tool, 1)
  }
  survivor.carriedTools = []
  goHome(survivor)
}

function goToLocker(
  world: WorldState,
  survivor: SurvivorState,
  state: 'AcquireEquipment' | 'ReturnEquipment',
): void {
  const locker = findContainer(world, 'tool_locker')
  survivor.destination = locker ? { ...locker.position } : { ...survivor.homePosition }
  survivor.workerState = state
}

function goHome(survivor: SurvivorState): void {
  survivor.destination = { ...survivor.homePosition }
  survivor.workerState = 'RestOrNextJob'
}

function currentJob(world: WorldState, survivor: SurvivorState) {
  return survivor.currentJobId ? findJob(world, survivor.currentJobId) : undefined
}
