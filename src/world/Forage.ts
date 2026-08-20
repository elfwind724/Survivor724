import { statsOf } from '@/data/equipment'
import { extraYieldCount, skillWorkMult } from '@/data/skills'
import { WORK_XP } from '@/data/items'
import { addItem, canAdd, inventoryOf } from '@/inventory/Inventory'
import { beginTravel } from '@/navigation/Travel'
import { recordWorkYield } from '@/survivors/Progress'
import { cloneVec3, distanceXZ, type BerryBushState, type SurvivorState, type WorldState } from '@/simulation/types'

export type { BerryBushState }

export const PICK_SECONDS = 5
export const BUSH_BERRIES = 3
export const FORAGE_REACH = 1.5

export type ForageStep = 'none' | 'travel' | 'picking' | 'picked' | 'full' | 'empty'

export function seedBerryBushes(): BerryBushState[] {
  return [
    bush('bush-1', 38, -16),
    bush('bush-2', 42, -18),
    bush('bush-3', 34, -14),
    bush('bush-4', 46, -8),
    bush('bush-5', 40, -22),
  ]
}

export function refillBerryBushes(world: WorldState): void {
  for (const shrub of world.berryBushes) {
    shrub.berries = BUSH_BERRIES
    shrub.occupantId = null
  }
}

export function berryBushOf(world: WorldState, survivor: SurvivorState): BerryBushState | undefined {
  return world.berryBushes.find((entry) => entry.occupantId === survivor.id)
}

export function isPickingBerries(world: WorldState, survivor: SurvivorState): boolean {
  const shrub = berryBushOf(world, survivor)
  if (!shrub || survivor.downed) return false
  return distanceXZ(survivor.position, shrub.position) <= FORAGE_REACH + 0.2
}

export function pickSecondsFor(survivor: SurvivorState): number {
  return PICK_SECONDS / Math.max(0.5, skillWorkMult(survivor, 'gather'))
}

export function remainingPick(world: WorldState, survivor: SurvivorState): number {
  return Math.max(0, pickSecondsFor(survivor) - survivor.workElapsed)
}

export function claimBerryBush(world: WorldState, survivor: SurvivorState): BerryBushState | null {
  const held = berryBushOf(world, survivor)
  if (held && held.berries > 0) return held
  if (held) held.occupantId = null
  const free = world.berryBushes.filter((entry) => !entry.occupantId && entry.berries > 0)
  const pick = nearestBush(free, survivor.position)
  if (!pick) return null
  pick.occupantId = survivor.id
  return pick
}

export function releaseBerryBush(world: WorldState, survivor: SurvivorState): void {
  for (const shrub of world.berryBushes) {
    if (shrub.occupantId === survivor.id) shrub.occupantId = null
  }
}

export function stepGather(
  world: WorldState,
  survivor: SurvivorState,
  dt: number,
  opts: { autoTravel?: boolean; moving?: boolean } = {},
): ForageStep {
  if (survivor.downed) return 'none'
  if (opts.moving) {
    releaseBerryBush(world, survivor)
    survivor.workElapsed = 0
    return 'none'
  }
  if (world.time.phase === 'night' || world.time.phase === 'aftermath') return 'none'
  if (!wantsToGather(world, survivor)) return 'none'

  const shrub = claimBerryBush(world, survivor)
  if (!shrub) return 'empty'

  const dist = distanceXZ(survivor.position, shrub.position)
  if (dist > FORAGE_REACH) {
    if (!opts.autoTravel) {
      if (dist > 3) releaseBerryBush(world, survivor)
      return 'none'
    }
    const aim = survivor.pathTarget ?? survivor.destination
    if (!aim || distanceXZ(aim, shrub.position) > 1) beginTravel(world, survivor, shrub.position)
    return 'travel'
  }

  survivor.destination = null
  survivor.path = []
  survivor.pathTarget = null

  const bag = inventoryOf(world.inventories, survivor.inventoryId)
  const count = 1 + extraYieldCount(survivor, 'gather', `${shrub.id}:${survivor.id}:${Math.floor(survivor.lastYieldAt)}`)
  survivor.workElapsed += dt * statsOf(survivor).workRate
  if (survivor.workElapsed < pickSecondsFor(survivor)) return 'picking'
  if (!canAdd(bag, count) || shrub.berries <= 0) {
    survivor.workElapsed = pickSecondsFor(survivor)
    return shrub.berries <= 0 ? 'empty' : 'full'
  }
  const take = Math.min(count, shrub.berries)
  addItem(bag, 'berry', take)
  shrub.berries -= take
  recordWorkYield(world, survivor, 'berry', take, WORK_XP.gather ?? 3, 'gather')
  survivor.workElapsed = 0
  if (shrub.berries <= 0) {
    shrub.occupantId = null
    const next = claimBerryBush(world, survivor)
    if (next && opts.autoTravel) {
      beginTravel(world, survivor, next.position)
      return 'travel'
    }
  }
  return 'picked'
}

function wantsToGather(world: WorldState, survivor: SurvivorState): boolean {
  if (survivor.dayAssignment === 'gather') return true
  const job = world.jobs.find((entry) => entry.id === survivor.currentJobId)
  return job?.definitionId === 'gather'
}

function nearestBush(bushes: BerryBushState[], from: { x: number; z: number }): BerryBushState | null {
  let best: BerryBushState | null = null
  let bestDist = Infinity
  for (const shrub of bushes) {
    const dist = distanceXZ(shrub.position, { x: from.x, y: 0, z: from.z })
    if (dist < bestDist) {
      best = shrub
      bestDist = dist
    }
  }
  return best
}

function bush(id: string, x: number, z: number): BerryBushState {
  return {
    id,
    position: cloneVec3({ x, y: 0, z }),
    occupantId: null,
    berries: BUSH_BERRIES,
  }
}
