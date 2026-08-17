import { createCompleteStructure, placeBlueprint } from '@/base/construction'
import { createWorkZone } from '@/base/workZones'
import { createDeer } from '@/combat/Combat'
import { createDefenseSectors } from '@/combat/Defense'
import { rebuildNightPosts } from '@/combat/Night'
import { createInventory } from '@/inventory/Inventory'
import { createJob } from '@/jobs/JobBoard'
import { createNavGrid, rebuildNav, worldToCell } from '@/navigation/NavGrid'
import { createSurvivor } from '@/survivors/Survivor'
import { createTimeState } from './TimeSystem'
import { BASE } from './baseLayout'
import { vec3, type WorldState } from './types'

export { BASE }

export function createInitialWorld(): WorldState {
  const hunterBag = createInventory('inv-hunter', 8)
  const fisherBag = createInventory('inv-fisher', 6)
  const scavBag = createInventory('inv-scav', 6)
  const haulerBag = createInventory('inv-hauler', 8)
  const builderBag = createInventory('inv-builder', 4)
  const warehouseInv = createInventory('inv-warehouse', 1600, [
    { itemId: 'wood', count: 80 },
    { itemId: 'scrap', count: 24 },
    { itemId: 'ammo', count: 80 },
  ])
  const lockerInv = createInventory('inv-locker', 20, [
    { itemId: 'rifle', count: 1 },
    { itemId: 'hunting_knife', count: 1 },
    { itemId: 'rod', count: 1 },
    { itemId: 'crowbar', count: 1 },
    { itemId: 'hammer', count: 1 },
  ])

  const forest = vec3(55, 0, -20)
  const river = vec3(-55, 0, 32)
  const ruin = vec3(40, 0, 55)
  const locker = vec3(10, 0, -8)
  const warehouse = vec3(-10, 0, -8)

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
    player: {
      selectedId: 'hunter',
      controlledId: null,
      view: 'topdown',
    },
    structures: [],
    workZones: [
      createWorkZone('zone-hunt', 'hunt', 40, -40, 70, 0),
      createWorkZone('zone-fish', 'fish', -70, 15, -40, 50),
      createWorkZone('zone-scavenge', 'scavenge', 25, 40, 55, 70),
    ],
    enemies: [],
    wildlife: [
      createDeer('deer-1', vec3(52, 0, -18)),
      createDeer('deer-2', vec3(58, 0, -24)),
      createDeer('deer-3', vec3(48, 0, -14)),
    ],
    nightPosts: [],
    lastPhase: 'dawn',
    nightSpawnedDay: 0,
    defenseSectors: createDefenseSectors(),
  }

  seedBaseWalls(world)
  const blueprintCell = worldToCell(world.nav, vec3(16, 0, 4))
  placeBlueprint(world, 'wall', blueprintCell.x, blueprintCell.z)
  rebuildNightPosts(world)
  rebuildNav(world)
  return world
}

function seedBaseWalls(world: WorldState): void {
  const west = worldToCell(world.nav, vec3(BASE.west, 0, BASE.south))
  const east = worldToCell(world.nav, vec3(BASE.east, 0, BASE.south))
  const north = worldToCell(world.nav, vec3(BASE.west, 0, BASE.north))
  const southEnd = worldToCell(world.nav, vec3(BASE.west, 0, BASE.north))
  const gate = worldToCell(world.nav, vec3(-1, 0, BASE.north))

  for (let z = west.z; z <= southEnd.z; z += 1) {
    createCompleteStructure(world, 'wall', west.x, z)
    createCompleteStructure(world, 'wall', east.x, z)
  }
  for (let x = north.x; x < gate.x; x += 1) createCompleteStructure(world, 'wall', x, north.z)
  for (let x = gate.x + 3; x <= east.x; x += 1) createCompleteStructure(world, 'wall', x, north.z)
  createCompleteStructure(world, 'gate', gate.x, gate.z, true)
}
