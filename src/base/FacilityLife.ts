import { cellCenter, worldToCell } from '@/navigation/NavGrid'
import { cloneVec3, distanceXZ, type StructureState, type SurvivorState, type Vec3, type WorldState } from '@/simulation/types'

export interface InteriorProp {
  assetId: string
  x: number
  z: number
  yaw: number
  scale?: number
}

export function structureMid(world: WorldState, structure: StructureState): Vec3 {
  const xs = structure.cells.map((cell) => cell.x)
  const zs = structure.cells.map((cell) => cell.z)
  return cellCenter(world.nav, {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    z: (Math.min(...zs) + Math.max(...zs)) / 2,
  })
}

export function facilityApproach(world: WorldState, structure: StructureState): Vec3 {
  const xs = structure.cells.map((cell) => cell.x)
  const zs = structure.cells.map((cell) => cell.z)
  const south = cellCenter(world.nav, {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    z: Math.min(...zs),
  })
  return { x: south.x, y: 0, z: south.z - 2.2 }
}

export function findFacility(world: WorldState, definitionId: string): StructureState | undefined {
  return world.structures.find((structure) => structure.definitionId === definitionId && structure.stage === 'complete')
}

export function bedSpot(world: WorldState, survivor: SurvivorState): Vec3 {
  const quarters = findFacility(world, 'quarters')
  if (!quarters) return cloneVec3(survivor.homePosition)
  const beds = facilityBeds(world, quarters)
  const index = Math.max(0, world.survivors.findIndex((entry) => entry.id === survivor.id))
  return beds[index % beds.length] ?? facilityApproach(world, quarters)
}

export function facilityBeds(world: WorldState, structure: StructureState): Vec3[] {
  const mid = structureMid(world, structure)
  return [-3.2, -1.6, 0, 1.6, 3.2].map((offset) => ({ x: mid.x + offset, y: 0, z: mid.z + 1.1 }))
}

export function cookSpot(world: WorldState, kitchen: StructureState): Vec3 {
  const mid = structureMid(world, kitchen)
  return { x: mid.x + 0.4, y: 0, z: mid.z + 1.4 }
}

export function eatSpot(world: WorldState, kitchen: StructureState): Vec3 {
  const mid = structureMid(world, kitchen)
  return { x: mid.x - 0.2, y: 0, z: mid.z - 1.6 }
}

export function enterFacility(world: WorldState, survivor: SurvivorState, structure: StructureState, spot: Vec3): void {
  survivor.indoorId = structure.id
  if (distanceXZ(survivor.position, spot) < 0.35) survivor.position = cloneVec3(spot)
  survivor.destination = null
  survivor.path = []
  survivor.pathTarget = null
}

export function leaveFacility(_world: WorldState, survivor: SurvivorState): void {
  survivor.indoorId = null
}

export function occupiedFacilityIds(world: WorldState): Set<string> {
  const ids = new Set<string>()
  for (const survivor of world.survivors) {
    if (survivor.indoorId) ids.add(survivor.indoorId)
    const cell = worldToCell(world.nav, survivor.position)
    for (const structure of world.structures) {
      if (structure.kind !== 'building' || structure.stage !== 'complete') continue
      if (structure.cells.some((entry) => entry.x === cell.x && entry.z === cell.z)) ids.add(structure.id)
    }
  }
  return ids
}

export function isSleeping(survivor: SurvivorState): boolean {
  return survivor.workerState === 'Rest' && Boolean(survivor.indoorId)
}

export function isCooking(world: WorldState, survivor: SurvivorState): boolean {
  if (survivor.workerState !== 'Work' || !survivor.indoorId) return false
  const structure = world.structures.find((entry) => entry.id === survivor.indoorId)
  return structure?.definitionId === 'kitchen'
}

export function tryEnterAfterArrival(
  world: WorldState,
  survivor: SurvivorState,
  definitionId: string,
  spot: Vec3,
): boolean {
  const structure = findFacility(world, definitionId)
  if (!structure) return false
  if (distanceXZ(survivor.position, facilityApproach(world, structure)) > 2.8 && distanceXZ(survivor.position, spot) > 2.8) {
    return false
  }
  enterFacility(world, survivor, structure, spot)
  return true
}

export function interiorProps(world: WorldState, structure: StructureState): InteriorProp[] {
  const mid = structureMid(world, structure)
  if (structure.definitionId === 'quarters') {
    const beds = facilityBeds(world, structure).map((bed, index) => ({
      assetId: 'interior/bed-single',
      x: bed.x,
      z: bed.z,
      yaw: index % 2 === 0 ? Math.PI / 2 : -Math.PI / 2,
    }))
    return [
      ...beds,
      { assetId: 'interior/night-stand', x: mid.x - 3.2, z: mid.z - 1.4, yaw: 0 },
      { assetId: 'interior/night-stand', x: mid.x + 3.2, z: mid.z - 1.4, yaw: 0 },
      { assetId: 'interior/chair', x: mid.x, z: mid.z - 1.8, yaw: 0 },
    ]
  }
  if (structure.definitionId === 'kitchen') {
    return [
      { assetId: 'interior/oven', x: mid.x + 1.8, z: mid.z + 2.0, yaw: Math.PI },
      { assetId: 'interior/kitchen-sink', x: mid.x, z: mid.z + 2.0, yaw: Math.PI },
      { assetId: 'interior/kitchen-fridge', x: mid.x - 1.8, z: mid.z + 2.0, yaw: Math.PI },
      { assetId: 'interior/table-round-small', x: mid.x, z: mid.z - 1.4, yaw: 0 },
      { assetId: 'interior/chair', x: mid.x - 1.1, z: mid.z - 1.4, yaw: Math.PI / 2 },
      { assetId: 'interior/chair', x: mid.x + 1.1, z: mid.z - 1.4, yaw: -Math.PI / 2 },
      { assetId: 'food/cooking-pot', x: mid.x + 1.6, z: mid.z + 1.2, yaw: 0.4, scale: 0.55 },
      { assetId: 'food/frying-pan', x: mid.x + 0.6, z: mid.z + 1.15, yaw: 0.8, scale: 0.5 },
    ]
  }
  if (structure.definitionId === 'workshop') {
    return [
      { assetId: 'interior/table-round-small', x: mid.x, z: mid.z + 0.4, yaw: 0 },
      { assetId: 'interior/shelf-small', x: mid.x + 2.0, z: mid.z + 1.4, yaw: Math.PI },
      { assetId: 'interior/chair', x: mid.x - 1.4, z: mid.z + 0.4, yaw: Math.PI / 2 },
    ]
  }
  if (structure.definitionId === 'hall') {
    return [
      { assetId: 'interior/table-round-large', x: mid.x, z: mid.z, yaw: 0 },
      { assetId: 'interior/chair', x: mid.x - 1.6, z: mid.z, yaw: Math.PI / 2 },
      { assetId: 'interior/chair', x: mid.x + 1.6, z: mid.z, yaw: -Math.PI / 2 },
      { assetId: 'interior/chair', x: mid.x, z: mid.z + 1.6, yaw: Math.PI },
    ]
  }
  if (structure.definitionId === 'warehouse') {
    return [
      { assetId: 'interior/shelf-large', x: mid.x - 1.8, z: mid.z, yaw: Math.PI / 2 },
      { assetId: 'interior/shelf-large', x: mid.x + 1.8, z: mid.z, yaw: -Math.PI / 2 },
    ]
  }
  return []
}
