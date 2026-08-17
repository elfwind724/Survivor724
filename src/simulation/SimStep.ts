import { inventoryOf, addItem } from '@/inventory/Inventory'
import { moveToward } from '@/survivors/Survivor'
import { advanceTime } from './TimeSystem'
import type { WorldState } from './types'

const WORK_SECONDS = 4

interface WorkProgress {
  elapsed: number
}

const workProgress = new Map<string, WorkProgress>()

export function stepWorld(world: WorldState, dt: number): void {
  advanceTime(world, dt)
  for (const survivor of world.survivors) {
    stepWorker(world, survivor.id, dt)
  }
}

function stepWorker(world: WorldState, survivorId: string, dt: number): void {
  const survivor = world.survivors.find((entry) => entry.id === survivorId)
  if (!survivor) return

  switch (survivor.workerState) {
    case 'TravelToTarget': {
      if (moveToward(survivor, dt)) survivor.workerState = 'Work'
      break
    }
    case 'Work': {
      const progress = workProgress.get(survivor.id) ?? { elapsed: 0 }
      progress.elapsed += dt
      workProgress.set(survivor.id, progress)
      if (progress.elapsed >= WORK_SECONDS) {
        workProgress.delete(survivor.id)
        survivor.workerState = 'CollectOutput'
      }
      break
    }
    case 'CollectOutput': {
      const job = world.jobs.find((entry) => entry.id === survivor.currentJobId)
      const node = world.nodes.find((entry) => entry.id === job?.targetId)
      const bag = inventoryOf(world.inventories, survivor.inventoryId)
      if (node && node.reserve > 0 && addItem(bag, outputFor(node.kind), 1)) {
        node.reserve -= 1
      }
      const warehouse = world.containers.find((entry) => entry.kind === 'warehouse')
      survivor.destination = warehouse ? { ...warehouse.position } : { x: 0, y: 0, z: 0 }
      survivor.workerState = 'ReturnToBase'
      break
    }
    case 'ReturnToBase': {
      if (moveToward(survivor, dt)) survivor.workerState = 'DepositItems'
      break
    }
    case 'DepositItems': {
      const bag = inventoryOf(world.inventories, survivor.inventoryId)
      const warehouse = world.containers.find((entry) => entry.kind === 'warehouse')
      if (warehouse) {
        const stock = inventoryOf(world.inventories, warehouse.inventoryId)
        for (const item of bag.items) addItem(stock, item.itemId, item.count)
        bag.items = []
      }
      survivor.destination = null
      survivor.workerState = 'Idle'
      break
    }
    default:
      break
  }
}

function outputFor(kind: 'hunt' | 'fish' | 'scavenge' | 'wood'): string {
  if (kind === 'hunt') return 'raw_meat'
  if (kind === 'fish') return 'raw_fish'
  if (kind === 'wood') return 'wood'
  return 'scrap'
}
