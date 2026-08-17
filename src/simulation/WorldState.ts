import { createInventory } from '@/inventory/Inventory'
import { createJob } from '@/jobs/JobBoard'
import { createSurvivor } from '@/survivors/Survivor'
import { createTimeState } from './TimeSystem'
import { vec3, type WorldState } from './types'

export function createInitialWorld(): WorldState {
  const hunterBag = createInventory('inv-hunter', 8)
  const fisherBag = createInventory('inv-fisher', 6)
  const scavBag = createInventory('inv-scav', 6)
  const warehouseInv = createInventory('inv-warehouse', 400)
  const lockerInv = createInventory('inv-locker', 20, [
    { itemId: 'rifle', count: 1 },
    { itemId: 'hunting_knife', count: 1 },
    { itemId: 'rod', count: 1 },
    { itemId: 'crowbar', count: 1 },
  ])

  const forest = vec3(36, 0, -8)
  const river = vec3(-28, 0, 18)
  const ruin = vec3(22, 0, 30)
  const locker = vec3(4, 0, -2)
  const warehouse = vec3(0, 0, -6)

  return {
    time: createTimeState(),
    inventories: {
      [hunterBag.id]: hunterBag,
      [fisherBag.id]: fisherBag,
      [scavBag.id]: scavBag,
      [warehouseInv.id]: warehouseInv,
      [lockerInv.id]: lockerInv,
    },
    survivors: [
      createSurvivor({
        id: 'hunter',
        name: '林深',
        professionId: 'hunter',
        position: vec3(-2, 0, 0),
        moveSpeed: 3.2,
        health: 100,
        fatigue: 0,
        morale: 70,
        inventoryId: hunterBag.id,
        dayAssignment: 'hunt',
        currentJobId: 'job-hunt',
        workerState: 'Idle',
      }),
      createSurvivor({
        id: 'fisher',
        name: '河西',
        professionId: 'fisher',
        position: vec3(2, 0, 0),
        moveSpeed: 2.8,
        health: 100,
        fatigue: 8,
        morale: 68,
        inventoryId: fisherBag.id,
        dayAssignment: 'fish',
        currentJobId: 'job-fish',
        workerState: 'Idle',
      }),
      createSurvivor({
        id: 'scavenger',
        name: '砖灰',
        professionId: 'scavenger',
        position: vec3(0, 0, -2),
        moveSpeed: 3,
        health: 100,
        fatigue: 4,
        morale: 64,
        inventoryId: scavBag.id,
        dayAssignment: 'scavenge',
        currentJobId: 'job-scavenge',
        workerState: 'Idle',
      }),
    ],
    nodes: [
      { id: 'node-forest', kind: 'hunt', position: forest, reserve: 80, requiredToolId: 'rifle' },
      { id: 'node-river', kind: 'fish', position: river, reserve: 80, requiredToolId: 'rod' },
      { id: 'node-ruin', kind: 'scavenge', position: ruin, reserve: 80, requiredToolId: 'crowbar' },
    ],
    containers: [
      { id: 'warehouse', kind: 'warehouse', position: warehouse, inventoryId: warehouseInv.id },
      { id: 'tool-locker', kind: 'tool_locker', position: locker, inventoryId: lockerInv.id },
    ],
    jobs: [
      createJob({ id: 'job-hunt', definitionId: 'hunt', targetId: 'node-forest', assigneeId: 'hunter' }),
      createJob({ id: 'job-fish', definitionId: 'fish', targetId: 'node-river', assigneeId: 'fisher' }),
      createJob({ id: 'job-scavenge', definitionId: 'scavenge', targetId: 'node-ruin', assigneeId: 'scavenger' }),
    ],
  }
}
