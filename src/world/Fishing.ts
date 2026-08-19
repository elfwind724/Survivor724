import { statsOf } from '@/data/equipment'
import { extraYieldCount, skillLevel, skillWorkMult } from '@/data/skills'
import { WORK_XP } from '@/data/items'
import { addItem, canAdd, inventoryOf } from '@/inventory/Inventory'
import { beginTravel } from '@/navigation/Travel'
import { recordWorkYield } from '@/survivors/Progress'
import { cloneVec3, distanceXZ, type FishingSpotKind, type FishingSpotState, type SurvivorState, type WorldState } from '@/simulation/types'

export type { FishingSpotKind, FishingSpotState }

export const CAST_SECONDS = { shallow: 12, deep: 16 } as const
export const FISH_YIELD = { shallow: 1, deep: 2 } as const
export const DEEP_FISH_SKILL = 3
export const FISHING_REACH = 1.5

export type FishStep = 'none' | 'travel' | 'waiting' | 'caught' | 'full'

export function seedFishingSpots(): FishingSpotState[] {
  return [
    spot('fish-s1', 'shallow', -48, 28, -60, 30),
    spot('fish-s2', 'shallow', -48, 36, -60, 36),
    spot('fish-s3', 'shallow', -50, 44, -62, 44),
    spot('fish-d1', 'deep', -58, 20, -68, 16),
  ]
}

export function hasFishingRod(survivor: SurvivorState): boolean {
  return survivor.carriedTools.includes('rod')
}

export function canFishDeep(survivor: SurvivorState): boolean {
  return skillLevel(survivor, 'fish') >= DEEP_FISH_SKILL
}

export function fishingSpotOf(world: WorldState, survivor: SurvivorState): FishingSpotState | undefined {
  return world.fishingSpots.find((entry) => entry.occupantId === survivor.id)
}

export function isCasting(world: WorldState, survivor: SurvivorState): boolean {
  const hole = fishingSpotOf(world, survivor)
  if (!hole || survivor.downed) return false
  return distanceXZ(survivor.position, hole.position) <= FISHING_REACH + 0.2
}

export function castSecondsFor(spot: FishingSpotState | undefined, survivor: SurvivorState): number {
  const kind = spot?.kind ?? 'shallow'
  return CAST_SECONDS[kind] / Math.max(0.5, skillWorkMult(survivor, 'fish'))
}

export function fishYieldFor(spot: FishingSpotState, survivor: SurvivorState): number {
  const extra = extraYieldCount(survivor, 'fish', `${spot.id}:${survivor.id}:${Math.floor(survivor.lastYieldAt)}`)
  return FISH_YIELD[spot.kind] + extra
}

export function remainingCast(world: WorldState, survivor: SurvivorState): number {
  const hole = fishingSpotOf(world, survivor)
  return Math.max(0, castSecondsFor(hole, survivor) - survivor.workElapsed)
}

export function claimFishingSpot(world: WorldState, survivor: SurvivorState): FishingSpotState | null {
  const held = fishingSpotOf(world, survivor)
  if (held) {
    if (held.kind === 'deep' && !canFishDeep(survivor)) {
      held.occupantId = null
    } else {
      return held
    }
  }
  const wantDeep = canFishDeep(survivor)
  const free = world.fishingSpots.filter((entry) => !entry.occupantId)
  const preferred = wantDeep
    ? [...free.filter((entry) => entry.kind === 'deep'), ...free.filter((entry) => entry.kind === 'shallow')]
    : free.filter((entry) => entry.kind === 'shallow')
  const pick = preferred[0]
  if (!pick) return null
  pick.occupantId = survivor.id
  return pick
}

export function releaseFishingSpot(world: WorldState, survivor: SurvivorState): void {
  for (const hole of world.fishingSpots) {
    if (hole.occupantId === survivor.id) hole.occupantId = null
  }
}

export function stepFishing(
  world: WorldState,
  survivor: SurvivorState,
  dt: number,
  opts: { autoTravel?: boolean; moving?: boolean } = {},
): FishStep {
  if (survivor.downed) return 'none'
  if (opts.moving) {
    releaseFishingSpot(world, survivor)
    survivor.workElapsed = 0
    return 'none'
  }
  if (world.time.phase === 'night' || world.time.phase === 'aftermath') return 'none'
  if (!wantsToFish(world, survivor) || !hasFishingRod(survivor)) return 'none'

  const hole = claimFishingSpot(world, survivor)
  if (!hole) return 'none'

  const dist = distanceXZ(survivor.position, hole.position)
  if (dist > FISHING_REACH) {
    if (!opts.autoTravel) {
      if (dist > 3) releaseFishingSpot(world, survivor)
      return 'none'
    }
    const aim = survivor.pathTarget ?? survivor.destination
    if (!aim || distanceXZ(aim, hole.position) > 1) beginTravel(world, survivor, hole.position)
    return 'travel'
  }

  survivor.destination = null
  survivor.path = []
  survivor.pathTarget = null
  const dx = hole.water.x - survivor.position.x
  const dz = hole.water.z - survivor.position.z
  if (Math.hypot(dx, dz) > 0.001) survivor.facingYaw = Math.atan2(dx, dz)

  const bag = inventoryOf(world.inventories, survivor.inventoryId)
  const count = fishYieldFor(hole, survivor)
  survivor.workElapsed += dt * statsOf(survivor).workRate
  if (survivor.workElapsed < castSecondsFor(hole, survivor)) return 'waiting'
  if (!canAdd(bag, count)) {
    survivor.workElapsed = castSecondsFor(hole, survivor)
    return 'full'
  }
  addItem(bag, 'raw_fish', count)
  recordWorkYield(world, survivor, 'raw_fish', count, WORK_XP.fish ?? 4, 'fish')
  survivor.workElapsed = 0
  return 'caught'
}

function wantsToFish(world: WorldState, survivor: SurvivorState): boolean {
  if (survivor.dayAssignment === 'fish') return true
  const job = world.jobs.find((entry) => entry.id === survivor.currentJobId)
  return job?.definitionId === 'fish'
}

function spot(id: string, kind: FishingSpotKind, x: number, z: number, wx: number, wz: number): FishingSpotState {
  return {
    id,
    kind,
    position: cloneVec3({ x, y: 0, z }),
    water: cloneVec3({ x: wx, y: 0, z: wz }),
    occupantId: null,
  }
}
