import { statsOf } from '@/data/equipment'
import { extraYieldCount, skillWorkMult } from '@/data/skills'
import { WORK_XP } from '@/data/items'
import { addItem, canAdd, inventoryOf, usedSlots } from '@/inventory/Inventory'
import { beginTravel } from '@/navigation/Travel'
import { recordWorkYield } from '@/survivors/Progress'
import { cloneVec3, distanceXZ, type ItemStack, type RuinCrateKind, type RuinCrateState, type SurvivorState, type WorldState } from '@/simulation/types'

export type { RuinCrateKind, RuinCrateState }

export const SEARCH_SECONDS: Record<RuinCrateKind, number> = {
  crate: 7,
  locker: 8,
  pile: 5,
  heavy: 10,
}

export const RUIN_LABEL: Record<RuinCrateKind, string> = {
  crate: '铁皮箱',
  locker: '生锈柜',
  pile: '废料堆',
  heavy: '发电机',
}

export const RUIN_REACH = 1.5

export type RuinStep = 'none' | 'travel' | 'searching' | 'looted' | 'full' | 'empty'

export function seedRuinCrates(): RuinCrateState[] {
  return [
    crate('ruin-crate-1', 'crate', 32, 48),
    crate('ruin-locker-1', 'locker', 46, 46),
    crate('ruin-pile-1', 'pile', 34, 64),
    crate('ruin-crate-2', 'crate', 48, 62),
    crate('ruin-heavy-1', 'heavy', 42, 68),
  ]
}

export function refillRuinCrates(world: WorldState): void {
  for (const box of world.ruinCrates) {
    box.searched = false
    box.occupantId = null
    box.loot = lootFor(box.kind)
  }
}

export function hasCrowbar(survivor: SurvivorState): boolean {
  return survivor.carriedTools.includes('crowbar')
}

export function ruinCrateOf(world: WorldState, survivor: SurvivorState): RuinCrateState | undefined {
  return world.ruinCrates.find((entry) => entry.occupantId === survivor.id)
}

export function isSearchingRuin(world: WorldState, survivor: SurvivorState): boolean {
  const box = ruinCrateOf(world, survivor)
  if (!box || survivor.downed || box.kind === 'heavy') return false
  return distanceXZ(survivor.position, box.position) <= RUIN_REACH + 0.2
}

export function searchSecondsFor(box: RuinCrateState | undefined, survivor: SurvivorState): number {
  const kind = box?.kind ?? 'crate'
  return SEARCH_SECONDS[kind] / Math.max(0.5, skillWorkMult(survivor, 'scavenge'))
}

export function remainingSearch(world: WorldState, survivor: SurvivorState): number {
  const box = ruinCrateOf(world, survivor)
  return Math.max(0, searchSecondsFor(box, survivor) - survivor.workElapsed)
}

export function claimRuinCrate(world: WorldState, survivor: SurvivorState): RuinCrateState | null {
  const held = ruinCrateOf(world, survivor)
  if (held && !held.searched && held.kind !== 'heavy' && lootCount(held) > 0) return held
  if (held) held.occupantId = null
  const free = world.ruinCrates.filter((entry) => !entry.occupantId && !entry.searched && entry.kind !== 'heavy' && lootCount(entry) > 0)
  const pick = nearestBox(free, survivor.position)
  if (!pick) return null
  pick.occupantId = survivor.id
  return pick
}

export function releaseRuinCrate(world: WorldState, survivor: SurvivorState): void {
  for (const box of world.ruinCrates) {
    if (box.occupantId === survivor.id) box.occupantId = null
  }
}

export function stepScavenge(
  world: WorldState,
  survivor: SurvivorState,
  dt: number,
  opts: { autoTravel?: boolean; moving?: boolean } = {},
): RuinStep {
  if (survivor.downed) return 'none'
  if (opts.moving) {
    releaseRuinCrate(world, survivor)
    survivor.workElapsed = 0
    return 'none'
  }
  if (world.time.phase === 'night' || world.time.phase === 'aftermath') return 'none'
  if (!wantsToScavenge(world, survivor) || !hasCrowbar(survivor)) return 'none'

  const box = claimRuinCrate(world, survivor)
  if (!box) return 'empty'

  const dist = distanceXZ(survivor.position, box.position)
  if (dist > RUIN_REACH) {
    if (!opts.autoTravel) {
      if (dist > 3) releaseRuinCrate(world, survivor)
      return 'none'
    }
    const aim = survivor.pathTarget ?? survivor.destination
    if (!aim || distanceXZ(aim, box.position) > 1) beginTravel(world, survivor, box.position)
    return 'travel'
  }

  survivor.destination = null
  survivor.path = []
  survivor.pathTarget = null
  const dx = box.position.x - survivor.position.x
  const dz = box.position.z - survivor.position.z
  if (Math.hypot(dx, dz) > 0.001) survivor.facingYaw = Math.atan2(dx, dz)

  const bag = inventoryOf(world.inventories, survivor.inventoryId)
  survivor.workElapsed += dt * statsOf(survivor).workRate
  if (survivor.workElapsed < searchSecondsFor(box, survivor)) return 'searching'

  const taken = takeCrateLoot(survivor, box, world)
  if (taken.moved <= 0) {
    if (usedSlots(bag) >= bag.capacity) return 'full'
    box.searched = true
    box.occupantId = null
    survivor.workElapsed = 0
    const next = claimRuinCrate(world, survivor)
    if (!next) return 'empty'
    if (opts.autoTravel) beginTravel(world, survivor, next.position)
    return 'travel'
  }
  const extra = extraYieldCount(survivor, 'scavenge', `${box.id}:${survivor.id}:${Math.floor(survivor.lastYieldAt)}`)
  if (extra > 0 && canAdd(bag, extra)) {
    addItem(bag, 'scrap', extra)
    taken.moved += extra
    taken.itemId = taken.itemId || 'scrap'
  }
  recordWorkYield(world, survivor, taken.itemId, taken.moved, WORK_XP.scavenge ?? 3, 'scavenge')
  survivor.workElapsed = 0
  if (lootCount(box) <= 0) {
    box.searched = true
    box.occupantId = null
  }
  return usedSlots(bag) >= bag.capacity ? 'full' : 'looted'
}

function takeCrateLoot(
  survivor: SurvivorState,
  box: RuinCrateState,
  world: WorldState,
): { moved: number; itemId: string } {
  const bag = inventoryOf(world.inventories, survivor.inventoryId)
  let moved = 0
  let itemId = ''
  const leftover: ItemStack[] = []
  for (const stack of box.loot) {
    const room = bag.capacity - usedSlots(bag)
    if (room <= 0) {
      leftover.push(stack)
      continue
    }
    const take = Math.min(stack.count, room)
    if (take > 0 && addItem(bag, stack.itemId, take)) {
      moved += take
      if (!itemId) itemId = stack.itemId
    }
    if (stack.count > take) leftover.push({ itemId: stack.itemId, count: stack.count - take })
  }
  box.loot = leftover
  return { moved, itemId }
}

function wantsToScavenge(world: WorldState, survivor: SurvivorState): boolean {
  if (survivor.dayAssignment === 'scavenge') return true
  const job = world.jobs.find((entry) => entry.id === survivor.currentJobId)
  return job?.definitionId === 'scavenge'
}

function lootCount(box: RuinCrateState): number {
  return box.loot.reduce((sum, item) => sum + item.count, 0)
}

function nearestBox(boxes: RuinCrateState[], from: { x: number; z: number }): RuinCrateState | null {
  let best: RuinCrateState | null = null
  let bestDist = Infinity
  for (const box of boxes) {
    const dist = distanceXZ(box.position, { x: from.x, y: 0, z: from.z })
    if (dist < bestDist) {
      best = box
      bestDist = dist
    }
  }
  return best
}

function lootFor(kind: RuinCrateKind): ItemStack[] {
  if (kind === 'crate') return [{ itemId: 'scrap', count: 2 }]
  if (kind === 'locker') return [{ itemId: 'scrap', count: 1 }, { itemId: 'ammo', count: 6 }]
  if (kind === 'pile') return [{ itemId: 'scrap', count: 3 }]
  return []
}

function crate(id: string, kind: RuinCrateKind, x: number, z: number): RuinCrateState {
  return {
    id,
    kind,
    position: cloneVec3({ x, y: 0, z }),
    occupantId: null,
    searched: kind === 'heavy',
    loot: lootFor(kind),
  }
}
