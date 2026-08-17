import type { ResourceNodeState, SurvivorState, Vec3, WorkZoneState, WorldState } from '@/simulation/types'

export function createWorkZone(
  id: string,
  jobDefinitionId: string,
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number,
): WorkZoneState {
  return {
    id,
    jobDefinitionId,
    minX: Math.min(minX, maxX),
    minZ: Math.min(minZ, maxZ),
    maxX: Math.max(minX, maxX),
    maxZ: Math.max(minZ, maxZ),
  }
}

export function pointInZone(point: Vec3, zone: WorkZoneState): boolean {
  return point.x >= zone.minX && point.x <= zone.maxX && point.z >= zone.minZ && point.z <= zone.maxZ
}

export function nodeAllowedForSurvivor(world: WorldState, survivor: SurvivorState, node: ResourceNodeState): boolean {
  if (!survivor.dayAssignment) return false
  const zones = world.workZones.filter((zone) => zone.jobDefinitionId === survivor.dayAssignment)
  if (zones.length === 0) return true
  return zones.some((zone) => pointInZone(node.position, zone))
}

export function setWorkZone(
  world: WorldState,
  jobDefinitionId: string,
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number,
): WorkZoneState {
  const existing = world.workZones.find((zone) => zone.jobDefinitionId === jobDefinitionId)
  if (existing) {
    existing.minX = Math.min(minX, maxX)
    existing.minZ = Math.min(minZ, maxZ)
    existing.maxX = Math.max(minX, maxX)
    existing.maxZ = Math.max(minZ, maxZ)
    return existing
  }
  const zone = createWorkZone(`zone-${jobDefinitionId}`, jobDefinitionId, minX, minZ, maxX, maxZ)
  world.workZones.push(zone)
  return zone
}
