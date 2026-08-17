import { cloneVec3, type SurvivorState, type Vec3 } from '@/simulation/types'

export function createSurvivor(input: Omit<SurvivorState, 'destination'> & { destination?: Vec3 | null }): SurvivorState {
  return {
    ...input,
    position: cloneVec3(input.position),
    destination: input.destination ? cloneVec3(input.destination) : null,
  }
}

export function moveToward(survivor: SurvivorState, dt: number): boolean {
  const destination = survivor.destination
  if (!destination) return false

  const dx = destination.x - survivor.position.x
  const dz = destination.z - survivor.position.z
  const distance = Math.hypot(dx, dz)
  const step = survivor.moveSpeed * dt
  if (distance <= step || distance === 0) {
    survivor.position.x = destination.x
    survivor.position.z = destination.z
    return true
  }

  survivor.position.x += (dx / distance) * step
  survivor.position.z += (dz / distance) * step
  return false
}
