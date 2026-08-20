import { statsOf } from '@/data/equipment'
import { extraYieldCount, skillWorkMult } from '@/data/skills'
import { WORK_XP } from '@/data/items'
import { addItem, canAdd, inventoryOf } from '@/inventory/Inventory'
import { beginTravel } from '@/navigation/Travel'
import { recordWorkYield } from '@/survivors/Progress'
import { cloneVec3, distanceXZ, type SurvivorState, type WaterScoopState, type WorldState } from '@/simulation/types'

export type { WaterScoopState }

export const SCOOP_SECONDS = 5
export const DRAW_REACH = 1.5

export type DrawStep = 'none' | 'travel' | 'scooping' | 'scooped' | 'full'

export function seedWaterScoops(): WaterScoopState[] {
  return [
    scoop('scoop-1', -46, 24, -58, 26),
    scoop('scoop-2', -46, 32, -58, 32),
    scoop('scoop-3', -44, 40, -56, 40),
    scoop('scoop-4', -47, 18, -58, 18),
  ]
}

export function waterScoopOf(world: WorldState, survivor: SurvivorState): WaterScoopState | undefined {
  return world.waterScoops.find((entry) => entry.occupantId === survivor.id)
}

export function isScoopingWater(world: WorldState, survivor: SurvivorState): boolean {
  const bank = waterScoopOf(world, survivor)
  if (!bank || survivor.downed) return false
  return distanceXZ(survivor.position, bank.position) <= DRAW_REACH + 0.2
}

export function scoopSecondsFor(survivor: SurvivorState): number {
  return SCOOP_SECONDS / Math.max(0.5, skillWorkMult(survivor, 'draw'))
}

export function remainingScoop(world: WorldState, survivor: SurvivorState): number {
  return Math.max(0, scoopSecondsFor(survivor) - survivor.workElapsed)
}

export function claimWaterScoop(world: WorldState, survivor: SurvivorState): WaterScoopState | null {
  const held = waterScoopOf(world, survivor)
  if (held) return held
  const free = world.waterScoops.filter((entry) => !entry.occupantId)
  const pick = nearestScoop(free, survivor.position)
  if (!pick) return null
  pick.occupantId = survivor.id
  return pick
}

export function releaseWaterScoop(world: WorldState, survivor: SurvivorState): void {
  for (const bank of world.waterScoops) {
    if (bank.occupantId === survivor.id) bank.occupantId = null
  }
}

export function stepDraw(
  world: WorldState,
  survivor: SurvivorState,
  dt: number,
  opts: { autoTravel?: boolean; moving?: boolean } = {},
): DrawStep {
  if (survivor.downed) return 'none'
  if (opts.moving) {
    releaseWaterScoop(world, survivor)
    survivor.workElapsed = 0
    return 'none'
  }
  if (world.time.phase === 'night' || world.time.phase === 'aftermath') return 'none'
  if (!wantsToDraw(world, survivor)) return 'none'

  const bank = claimWaterScoop(world, survivor)
  if (!bank) return 'none'

  const dist = distanceXZ(survivor.position, bank.position)
  if (dist > DRAW_REACH) {
    if (!opts.autoTravel) {
      if (dist > 3) releaseWaterScoop(world, survivor)
      return 'none'
    }
    const aim = survivor.pathTarget ?? survivor.destination
    if (!aim || distanceXZ(aim, bank.position) > 1) beginTravel(world, survivor, bank.position)
    return 'travel'
  }

  survivor.destination = null
  survivor.path = []
  survivor.pathTarget = null
  const dx = bank.water.x - survivor.position.x
  const dz = bank.water.z - survivor.position.z
  if (Math.hypot(dx, dz) > 0.001) survivor.facingYaw = Math.atan2(dx, dz)

  const bag = inventoryOf(world.inventories, survivor.inventoryId)
  const count = 1 + extraYieldCount(survivor, 'gather', `${bank.id}:${survivor.id}:${Math.floor(survivor.lastYieldAt)}`)
  survivor.workElapsed += dt * statsOf(survivor).workRate
  if (survivor.workElapsed < scoopSecondsFor(survivor)) return 'scooping'
  if (!canAdd(bag, count)) {
    survivor.workElapsed = scoopSecondsFor(survivor)
    return 'full'
  }
  addItem(bag, 'raw_water', count)
  recordWorkYield(world, survivor, 'raw_water', count, WORK_XP.draw ?? 3, 'gather')
  survivor.workElapsed = 0
  return 'scooped'
}

function wantsToDraw(world: WorldState, survivor: SurvivorState): boolean {
  if (survivor.dayAssignment === 'draw') return true
  const job = world.jobs.find((entry) => entry.id === survivor.currentJobId)
  return job?.definitionId === 'draw'
}

function nearestScoop(spots: WaterScoopState[], from: { x: number; z: number }): WaterScoopState | null {
  let best: WaterScoopState | null = null
  let bestDist = Infinity
  for (const bank of spots) {
    const dist = distanceXZ(bank.position, { x: from.x, y: 0, z: from.z })
    if (dist < bestDist) {
      best = bank
      bestDist = dist
    }
  }
  return best
}

function scoop(id: string, x: number, z: number, wx: number, wz: number): WaterScoopState {
  return {
    id,
    position: cloneVec3({ x, y: 0, z }),
    water: cloneVec3({ x: wx, y: 0, z: wz }),
    occupantId: null,
  }
}
