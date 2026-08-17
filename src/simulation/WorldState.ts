import { createInventory } from '@/inventory/Inventory'
import { createJob } from '@/jobs/JobBoard'
import { createSurvivor } from '@/survivors/Survivor'
import { createTimeState } from './TimeSystem'
import { vec3, type WorldState } from './types'

export function createInitialWorld(): WorldState {
  const hunterBag = createInventory('inv-hunter', 20)
  const fisherBag = createInventory('inv-fisher', 16)
  const scavBag = createInventory('inv-scav', 18)
  const warehouseInv = createInventory('inv-warehouse', 200)

  const forest = vec3(36, 0, -8)
  const river = vec3(-28, 0, 18)
  const ruin = vec3(22, 0, 30)

  return {
    time: createTimeState(),
    inventories: {
      [hunterBag.id]: hunterBag,
      [fisherBag.id]: fisherBag,
      [scavBag.id]: scavBag,
      [warehouseInv.id]: warehouseInv,
    },
    survivors: [
      createSurvivor({
        id: 'hunter',
        name: '林深',
        professionId: 'hunter',
        position: vec3(-2, 0, 0),
        destination: forest,
        moveSpeed: 3.2,
        health: 100,
        fatigue: 0,
        morale: 70,
        inventoryId: hunterBag.id,
        dayAssignment: 'hunt',
        currentJobId: 'job-hunt',
        workerState: 'TravelToTarget',
      }),
      createSurvivor({
        id: 'fisher',
        name: '河西',
        professionId: 'fisher',
        position: vec3(2, 0, 0),
        destination: river,
        moveSpeed: 2.8,
        health: 100,
        fatigue: 8,
        morale: 68,
        inventoryId: fisherBag.id,
        dayAssignment: 'fish',
        currentJobId: 'job-fish',
        workerState: 'TravelToTarget',
      }),
      createSurvivor({
        id: 'scavenger',
        name: '砖灰',
        professionId: 'scavenger',
        position: vec3(0, 0, -2),
        destination: ruin,
        moveSpeed: 3,
        health: 100,
        fatigue: 4,
        morale: 64,
        inventoryId: scavBag.id,
        dayAssignment: 'scavenge',
        currentJobId: 'job-scavenge',
        workerState: 'TravelToTarget',
      }),
    ],
    nodes: [
      { id: 'node-forest', kind: 'hunt', position: forest, reserve: 40, requiredToolId: 'rifle' },
      { id: 'node-river', kind: 'fish', position: river, reserve: 28, requiredToolId: 'rod' },
      { id: 'node-ruin', kind: 'scavenge', position: ruin, reserve: 22, requiredToolId: 'crowbar' },
    ],
    containers: [
      { id: 'warehouse', kind: 'warehouse', position: vec3(0, 0, -6), inventoryId: warehouseInv.id },
    ],
    jobs: [
      createJob({ id: 'job-hunt', definitionId: 'hunt', targetId: 'node-forest', assigneeId: 'hunter' }),
      createJob({ id: 'job-fish', definitionId: 'fish', targetId: 'node-river', assigneeId: 'fisher' }),
      createJob({ id: 'job-scavenge', definitionId: 'scavenge', targetId: 'node-ruin', assigneeId: 'scavenger' }),
    ],
  }
}
