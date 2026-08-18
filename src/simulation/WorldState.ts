import { createCompleteStructure, loadCreativeStructures, placeBlueprint, promoteBuildingDecorations } from '@/base/construction'
import { loadDecorations } from '@/base/decorations'
import { facilityBeds } from '@/base/FacilityLife'
import { seedOutdoorScenery } from '@/data/outdoorScenery'
import { createWorkZone } from '@/base/workZones'
import { seedWildlife } from '@/world/Wildlife'
import { createDefenseSectors } from '@/combat/Defense'
import { rebuildNightPosts } from '@/combat/Night'
import { createInventory } from '@/inventory/Inventory'
import { createJob } from '@/jobs/JobBoard'
import { cellCenter, createNavGrid, rebuildNav, worldToCell } from '@/navigation/NavGrid'
import { dressProfession } from '@/survivors/Equipment'
import { createSurvivor } from '@/survivors/Survivor'
import { createTimeState } from './TimeSystem'
import { BASE } from './baseLayout'
import { vec3, type StructureState, type Vec3, type WorldState } from './types'

export { BASE }

export function createInitialWorld(): WorldState {
  const hunterBag = createInventory('inv-hunter', 8)
  const fisherBag = createInventory('inv-fisher', 6)
  const scavBag = createInventory('inv-scav', 6)
  const haulerBag = createInventory('inv-hauler', 32)
  const builderBag = createInventory('inv-builder', 4)
  const warehouseInv = createInventory('inv-warehouse', 1600, [
    { itemId: 'wood', count: 80 },
    { itemId: 'scrap', count: 24 },
    { itemId: 'ammo', count: 80 },
    { itemId: 'jacket', count: 2 },
    { itemId: 'work_cap', count: 1 },
    { itemId: 'boots', count: 2 },
    { itemId: 'pistol', count: 1 },
    { itemId: 'meal', count: 6 },
    { itemId: 'water', count: 16 },
  ])
  const lockerInv = createInventory('inv-locker', 28, [
    { itemId: 'rifle', count: 1 },
    { itemId: 'hunting_knife', count: 1 },
    { itemId: 'rod', count: 1 },
    { itemId: 'crowbar', count: 1 },
    { itemId: 'hammer', count: 2 },
    { itemId: 'pistol', count: 4 },
    { itemId: 'revolver', count: 1 },
    { itemId: 'smg', count: 1 },
    { itemId: 'shotgun', count: 1 },
    { itemId: 'sniper', count: 1 },
  ])

  const forest = vec3(55, 0, -20)
  const river = vec3(-55, 0, 32)
  const ruin = vec3(40, 0, 55)
  const locker = vec3(16, 0, -21)
  const warehouse = vec3(-20, 0, -19)

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
        name: '冯老师',
        professionId: 'hunter',
        position: vec3(-2, 0, 0),
        moveSpeed: 3.2,
        health: 100,
        hunger: 86,
        thirst: 80,
        fatigue: 0,
        morale: 70,
        inventoryId: hunterBag.id,
        dayAssignment: null,
        currentJobId: null,
        workerState: 'Idle',
        spendOwnPoints: true,
      }),
      createSurvivor({
        id: 'fisher',
        name: '河西',
        professionId: 'fisher',
        position: vec3(2, 0, 0),
        moveSpeed: 2.8,
        health: 100,
        hunger: 78,
        thirst: 84,
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
        hunger: 70,
        thirst: 68,
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
        hunger: 88,
        thirst: 74,
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
        hunger: 82,
        thirst: 90,
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
      { id: 'node-water', kind: 'water', position: vec3(-52, 0, 30), reserve: 120, requiredToolId: null },
      { id: 'node-berry', kind: 'berry', position: vec3(38, 0, -16), reserve: 70, requiredToolId: null },
      { id: 'node-ruin', kind: 'scavenge', position: ruin, reserve: 80, requiredToolId: 'crowbar' },
    ],
    containers: [
      { id: 'warehouse', kind: 'warehouse', position: warehouse, inventoryId: warehouseInv.id },
      { id: 'tool-locker', kind: 'tool_locker', position: locker, inventoryId: lockerInv.id },
    ],
    jobs: [
      createJob({ id: 'job-fish', definitionId: 'fish', targetId: 'node-river', assigneeId: 'fisher' }),
      createJob({ id: 'job-scavenge', definitionId: 'scavenge', targetId: 'node-ruin', assigneeId: 'scavenger' }),
      createJob({ id: 'job-hunt', definitionId: 'hunt', targetId: 'node-forest', assigneeId: null }),
      createJob({ id: 'job-gather', definitionId: 'gather', targetId: 'node-berry', assigneeId: null }),
      createJob({ id: 'job-draw', definitionId: 'draw', targetId: 'node-water', assigneeId: null }),
    ],
    nav: createNavGrid(),
    navDirty: true,
    player: {
      heroId: 'hunter',
      selectedId: 'hunter',
      controlledId: 'hunter',
      view: 'topdown',
    },
    structures: [],
    workZones: [
      createWorkZone('zone-hunt', 'hunt', 40, -40, 70, 0),
      createWorkZone('zone-fish', 'fish', -70, 15, -40, 50),
      createWorkZone('zone-draw', 'draw', -70, 15, -40, 50),
      createWorkZone('zone-gather', 'gather', 28, -30, 50, -4),
      createWorkZone('zone-scavenge', 'scavenge', 25, 40, 55, 70),
    ],
    enemies: [],
    wildlife: seedWildlife(),
    gear: {},
    groundLoot: [],
    nightPosts: [],
    lastPhase: 'dawn',
    nightSpawnedDay: 0,
    defenseSectors: createDefenseSectors(),
    decorations: loadDecorations(),
    scenery: seedOutdoorScenery(),
    projectiles: [],
    impacts: [],
    rosterStrategy: 'balanced',
    showInteriors: true,
    nightKills: 0,
    nightSpawned: 0,
    nightWalls: 0,
    nightReport: null,
    gameOver: false,
    paused: false,
  }

  seedBaseWalls(world)
  seedStarterBuildings(world)
  bindContainersToBuildings(world)
  assignStarterHomes(world)
  for (const survivor of world.survivors) dressProfession(survivor)
  const blueprintCell = worldToCell(world.nav, vec3(0, 0, BASE.south - 4))
  placeBlueprint(world, 'wall', blueprintCell.x, blueprintCell.z)
  loadCreativeStructures(world)
  promoteBuildingDecorations(world)
  rebuildNightPosts(world)
  rebuildNav(world)
  return world
}

function seedAt(world: WorldState, definitionId: string, x: number, z: number, open = true): void {
  const cell = worldToCell(world.nav, vec3(x, 0, z))
  createCompleteStructure(world, definitionId, cell.x, cell.z, open)
}

function seedStarterBuildings(world: WorldState): void {
  seedAt(world, 'kitchen', -22, 8)
  seedAt(world, 'warehouse', -22, -16)
  seedAt(world, 'hall', 18, 16)
  seedAt(world, 'quarters', 12, -8)
  seedAt(world, 'workshop', 16, -22)
  seedAt(world, 'watchtower', BASE.west + 2, BASE.north - 3)
  seedAt(world, 'watchtower', BASE.east - 3, BASE.north - 3)
  seedAt(world, 'watchtower', BASE.east - 3, BASE.south + 2)
  seedAt(world, 'watchtower', BASE.west + 2, BASE.south + 2)
  seedAt(world, 'bonfire', 0, 4)
  seedAt(world, 'brazier', -10, 26)
  seedAt(world, 'brazier', 8, 26)
  seedAt(world, 'brazier', -10, -22)
  seedAt(world, 'brazier', 8, -22)
}

function bindContainersToBuildings(world: WorldState): void {
  const warehouse = world.containers.find((entry) => entry.kind === 'warehouse')
  const locker = world.containers.find((entry) => entry.kind === 'tool_locker')
  const warehouseHall = world.structures.find((entry) => entry.definitionId === 'warehouse' && entry.stage === 'complete')
  const workshop = world.structures.find((entry) => entry.definitionId === 'workshop' && entry.stage === 'complete')
  if (warehouse && warehouseHall) warehouse.position = approachSouth(world, warehouseHall)
  if (locker && workshop) locker.position = approachSouth(world, workshop)
}

function assignStarterHomes(world: WorldState): void {
  const quarters = world.structures.find((entry) => entry.definitionId === 'quarters' && entry.stage === 'complete')
  if (!quarters) return
  const beds = facilityBeds(world, quarters)
  world.survivors.forEach((survivor, index) => {
    survivor.homePosition = beds[index] ?? beds[0] ?? survivor.homePosition
  })
}

function approachSouth(world: WorldState, structure: StructureState): Vec3 {
  const xs = structure.cells.map((cell) => cell.x)
  const zs = structure.cells.map((cell) => cell.z)
  const south = cellCenter(world.nav, {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    z: Math.min(...zs),
  })
  return { x: south.x, y: 0, z: south.z - 2.2 }
}

function seedBaseWalls(world: WorldState): void {
  const west = worldToCell(world.nav, vec3(BASE.west, 0, BASE.south))
  const east = worldToCell(world.nav, vec3(BASE.east, 0, BASE.south))
  const north = worldToCell(world.nav, vec3(BASE.west, 0, BASE.north))
  const south = worldToCell(world.nav, vec3(BASE.west, 0, BASE.south))
  const northGate = worldToCell(world.nav, vec3(-1, 0, BASE.north))
  const southGate = worldToCell(world.nav, vec3(-1, 0, BASE.south))

  for (let z = south.z; z <= north.z; z += 1) {
    createCompleteStructure(world, 'wall', west.x, z)
    createCompleteStructure(world, 'wall', east.x, z)
  }
  for (let x = north.x + 1; x < northGate.x; x += 1) createCompleteStructure(world, 'wall', x, north.z)
  for (let x = northGate.x + 3; x < east.x; x += 1) createCompleteStructure(world, 'wall', x, north.z)
  createCompleteStructure(world, 'gate', northGate.x, northGate.z, true)
  for (let x = south.x + 1; x < southGate.x; x += 1) createCompleteStructure(world, 'wall', x, south.z)
  for (let x = southGate.x + 3; x < east.x; x += 1) createCompleteStructure(world, 'wall', x, south.z)
  createCompleteStructure(world, 'gate', southGate.x, southGate.z, true)
}
