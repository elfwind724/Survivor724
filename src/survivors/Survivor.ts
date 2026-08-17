import { cloneVec3, type SurvivorState, type Vec3 } from '@/simulation/types'

type SurvivorDraft = Omit<
  SurvivorState,
  | 'destination'
  | 'homePosition'
  | 'workElapsed'
  | 'carriedTools'
  | 'returnFill'
  | 'blockedReason'
  | 'path'
  | 'pathTarget'
  | 'pathVersion'
  | 'facingYaw'
> & {
  destination?: Vec3 | null
  homePosition?: Vec3
  workElapsed?: number
  carriedTools?: string[]
  returnFill?: number
  blockedReason?: SurvivorState['blockedReason']
  path?: Vec3[]
  pathTarget?: Vec3 | null
  pathVersion?: number
  facingYaw?: number
}

export function createSurvivor(input: SurvivorDraft): SurvivorState {
  return {
    ...input,
    position: cloneVec3(input.position),
    destination: input.destination ? cloneVec3(input.destination) : null,
    homePosition: cloneVec3(input.homePosition ?? input.position),
    workElapsed: input.workElapsed ?? 0,
    carriedTools: [...(input.carriedTools ?? [])],
    returnFill: input.returnFill ?? 1,
    blockedReason: input.blockedReason ?? null,
    path: (input.path ?? []).map((point) => cloneVec3(point)),
    pathTarget: input.pathTarget ? cloneVec3(input.pathTarget) : null,
    pathVersion: input.pathVersion ?? 0,
    facingYaw: input.facingYaw ?? 0,
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
