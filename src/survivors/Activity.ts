import { isCooking, isSleeping } from '@/base/FacilityLife'
import { nearestCarcass } from '@/combat/Combat'
import { WORK_SECONDS } from '@/data/jobs'
import { isCasting, remainingCast } from '@/world/Fishing'
import { isSearchingRuin, remainingSearch } from '@/world/Ruins'
import { isPickingBerries, remainingPick } from '@/world/Forage'
import { itemLabel } from '@/data/items'
import { EAT_SECONDS } from '@/survivors/Living'
import { xpToNext } from '@/survivors/Progress'
import type { SurvivorState, WorldState } from '@/simulation/types'

export const PROFESSION_LABEL: Record<string, string> = {
  hunter: '猎手',
  fisher: '渔手',
  scavenger: '搜刮',
  hauler: '搬运',
  builder: '工匠',
}

export function activityCaption(world: WorldState, survivor: SurvivorState): string {
  if (survivor.downed) return '倒地'
  if (survivor.id === world.player.heroId && world.player.controlledId === survivor.id) return '主角'
  if (survivor.dayAssignment === 'follow') return '跟随中'
  if (isSleeping(world, survivor)) return '睡觉中'
  if (survivor.watchPostId || survivor.dayAssignment === 'watch') {
    if (world.time.phase === 'night') return '守夜中'
    if (survivor.workerState !== 'TravelToTarget') return '站岗中'
  }
  if (isCooking(world, survivor) || (jobId(world, survivor) === 'cook' && survivor.workerState === 'Work')) {
    return survivor.workerState === 'Work' && cookingWater(world, survivor) ? '烧水中' : '做饭中'
  }
  if (jobId(world, survivor) === 'hunt' && survivor.workerState === 'Work' && nearestCarcass(world, survivor.position, 1.8)) {
    return '剥皮取肉中'
  }
  if (isCasting(world, survivor)) return '下竿等待'
  if (isSearchingRuin(world, survivor)) return '翻箱中'
  if (isPickingBerries(world, survivor)) return '摘果中'
  if (world.time.phase === 'night' || world.time.phase === 'aftermath') return '守夜中'
  const job = jobId(world, survivor)
  switch (survivor.workerState) {
    case 'AcquireEquipment':
      return '取工具中'
    case 'TravelToTarget':
      return travelCaption(job)
    case 'Work':
      return workCaption(job)
    case 'CollectOutput':
      return '收货中'
    case 'ReturnToBase':
      return '返程中'
    case 'DepositItems':
      return '卸货中'
    case 'ReturnEquipment':
      return '还工具中'
    case 'Eat':
      return '吃饭喝水中'
    case 'Rest':
      return '休息中'
    default:
      return '待命'
  }
}

export function activityCooldown(world: WorldState, survivor: SurvivorState): number {
  if (isCasting(world, survivor)) return remainingCast(world, survivor)
  if (isSearchingRuin(world, survivor)) return remainingSearch(world, survivor)
  if (isPickingBerries(world, survivor)) return remainingPick(world, survivor)
  if (survivor.workerState === 'Work') {
    if (jobId(world, survivor) === 'hunt' && survivor.fireCooldown > 0) return survivor.fireCooldown
    if (jobId(world, survivor) === 'fish') return remainingCast(world, survivor)
    if (jobId(world, survivor) === 'scavenge') return remainingSearch(world, survivor)
    if (jobId(world, survivor) === 'gather') return remainingPick(world, survivor)
    return Math.max(0, WORK_SECONDS - survivor.workElapsed)
  }
  if (survivor.workerState === 'Eat') return Math.max(0, EAT_SECONDS - survivor.workElapsed)
  if (survivor.fireCooldown > 0 && (world.time.phase === 'night' || survivor.dayAssignment === 'watch')) {
    return survivor.fireCooldown
  }
  return 0
}

export function yieldIsFresh(world: WorldState, survivor: SurvivorState, window = 8): boolean {
  if (survivor.lastYieldAt <= 0) return false
  return clockSeconds(world) - survivor.lastYieldAt < window
}

export function activityLines(world: WorldState, survivor: SurvivorState): string[] {
  const lines = [activityCaption(world, survivor)]
  const cd = activityCooldown(world, survivor)
  if (cd > 0.05) lines[0] = `${lines[0]}  CD ${cd.toFixed(1)}s`
  if (yieldIsFresh(world, survivor)) {
    const bits: string[] = []
    if (survivor.lastYieldCount > 0 && survivor.lastYieldItem) {
      bits.push(`+${survivor.lastYieldCount} ${itemLabel(survivor.lastYieldItem)}`)
    }
    if (survivor.lastYieldXp > 0) bits.push(`+${survivor.lastYieldXp}经验`)
    if (bits.length > 0) lines.push(bits.join('  '))
  }
  lines.push(`${PROFESSION_LABEL[survivor.professionId] ?? survivor.professionId} Lv${survivor.level} ${Math.floor(survivor.xp)}/${xpToNext(survivor.level)}`)
  return lines
}

function jobId(world: WorldState, survivor: SurvivorState): string {
  return world.jobs.find((entry) => entry.id === survivor.currentJobId)?.definitionId ?? ''
}

function workCaption(job: string): string {
  if (job === 'hunt') return '打猎中'
  if (job === 'fish') return '下竿等待'
  if (job === 'gather') return '摘果中'
  if (job === 'draw') return '打水中'
  if (job === 'upgrade') return '升级中'
  if (job === 'scavenge') return '翻箱中'
  if (job === 'cook') return '做饭中'
  if (job === 'build') return '建造中'
  if (job === 'demolish') return '拆除中'
  if (job === 'repair') return '修理中'
  if (job === 'haul') return '搬运中'
  return '工作中'
}

function travelCaption(job: string): string {
  if (job === 'hunt') return '去打猎'
  if (job === 'fish') return '去钓鱼'
  if (job === 'scavenge') return '去废墟'
  if (job === 'gather') return '去采果'
  if (job === 'draw') return '去打水'
  if (job === 'cook') return '去厨房'
  if (job === 'repair') return '去修缮'
  if (job === 'upgrade') return '去升级'
  return '赶路中'
}

function cookingWater(world: WorldState, survivor: SurvivorState): boolean {
  const bag = world.inventories[survivor.inventoryId]
  return !!bag && bag.items.some((item) => item.itemId === 'raw_water' && item.count > 0)
}

export function clockSeconds(world: WorldState): number {
  return world.time.dayIndex * world.time.dayLengthSeconds + world.time.daySeconds
}
