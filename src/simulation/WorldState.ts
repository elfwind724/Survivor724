import { createCompleteStructure, placeBlueprint } from '@/base/construction'
import { createWorkZone } from '@/base/workZones'
import { createInventory } from '@/inventory/Inventory'
import { createJob } from '@/jobs/JobBoard'
import { createNavGrid, rebuildNav, worldToCell } from '@/navigation/NavGrid'
import { createSurvivor } from '@/survivors/Survivor'
import { createTimeState } from './TimeSystem'
import { vec3, type WorldState } from './types'

export function createInitialWorld(): WorldState {
  const hunterBag = createInventory('inv-hunter', 8)
  const fisherBag = createInventory('inv-fisher', 6)
  const scavBag = createInventory('inv-scav', 6)
  const haulerBag = createInventory('inv-hauler', 8)
  const builderBag = createInventory('inv-builder', 4)
  const warehouseInv = createInventory('inv-warehouse', 400, [
    { itemId: 'wood', count: 12 },
    { itemId: 'scrap', count: 6 },
  ])
  const lockerInv = createInventory('inv-locker', 20, [
    { itemId: 'rifle', count: 1 },
    { itemId: 'hunting_knife', count: 1 },
    { itemId: 'rod', count: 1 },
    { itemId: 'crowbar', count: 1 },
    { itemId: 'hammer', count: 1 },
  ])

  const forest = vec3(36, 0, -8)
  const river = vec3(-28, 0, 18)
  const ruin = vec3(22, 0, 30)
  const locker = vec3(4, 0, -2)
  const warehouse = vec3(0, 0, -6)

  const world: WorldState = {
    time: createTimeState(),
    inventories: {
      [hunterBag.id]: hunterBag,
      [fisherBag.id]: fisherBag,
      [scavBag.id]: scavBag,
      [haulerBag.id]: haulerBag,
      [builderBag.id]: builderBag,
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
      createSurvivor({
        id: 'hauler',
        name: '搬山',
        professionId: 'hauler',
        position: vec3(-3, 0, -3),
        moveSpeed: 3,
        health: 100,
        fatigue: 0,
        morale: 66,
        inventoryId: haulerBag.id,
        dayAssignment: 'haul',
        currentJobId: null,
        workerState: 'Idle',
      }),
      createSurvivor({
        id: 'builder',
        name: '木石',
        professionId: 'builder',
        position: vec3(3, 0, -3),
        moveSpeed: 2.8,
        health: 100,
        fatigue: 0,
        morale: 66,
        inventoryId: builderBag.id,
        dayAssignment: 'build',
        currentJobId: null,
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
    nav: createNavGrid(),
    navDirty: true,
    structures: [],
    workZones: [
      createWorkZone('zone-hunt', 'hunt', 20, -20, 50, 10),
      createWorkZone('zone-fish', 'fish', -45, 5, -10, 35),
      createWorkZone('zone-scavenge', 'scavenge', 10, 15, 40, 45),
    ],
  }

  seedBaseWalls(world)
  const blueprintCell = worldToCell(world.nav, vec3(12, 0, 0))
  placeBlueprint(world, 'wall', blueprintCell.x, blueprintCell.z)
  rebuildNav(world)
  return world
}

function seedBaseWalls(world: WorldState): void {
  const west = worldToCell(world.nav, vec3(-8, 0, -8))
  const east = worldToCell(world.nav, vec3(8, 0, -8))
  const north = worldToCell(world.nav, vec3(-8, 0, 8))
  const gate = worldToCell(world.nav, vec3(0, 0, 8))

  for (let z = west.z; z <= west.z + 16; z += 1) {
    createCompleteStructure(world, 'wall', west.x, z)
    createCompleteStructure(world, 'wall', east.x, z)
  }
  for (let x = north.x; x < gate.x; x += 1) createCompleteStructure(world, 'wall', x, north.z)
  for (let x = gate.x + 2; x <= north.x + 16; x += 1) createCompleteStructure(world, 'wall', x, north.z)
  createCompleteStructure(world, 'gate', gate.x, gate.z, true)
}
