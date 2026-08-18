import { leaveFacility } from '@/base/FacilityLife'
import { isHero } from '@/controls/PlayerControl'
import { jobDefinition } from '@/data/jobs'
import type { SurvivorState, WorldState } from '@/simulation/types'

export const ROSTER_POSTS = [
  { id: 'hunt', label: '打猎' },
  { id: 'fish', label: '钓鱼' },
  { id: 'scavenge', label: '搜刮' },
  { id: 'haul', label: '搬运' },
  { id: 'build', label: '建造' },
  { id: 'cook', label: '做饭' },
  { id: 'watch', label: '站岗' },
  { id: 'follow', label: '跟随' },
  { id: 'idle', label: '待命' },
] as const

export type RosterPostId = (typeof ROSTER_POSTS)[number]['id']

export const WATCH_CORNERS = [
  { id: 'post-nw', label: '西北' },
  { id: 'post-ne', label: '东北' },
  { id: 'post-se', label: '东南' },
  { id: 'post-sw', label: '西南' },
] as const

export const ROSTER_STRATEGIES = [
  { id: 'watch', label: '四角站岗', hint: '四名队员一键上四座瞭望塔', posts: ['watch', 'watch', 'watch', 'watch'] },
  { id: 'balanced', label: '均衡上岗', hint: '按职业回各自岗位', posts: ['hunt', 'fish', 'scavenge', 'haul', 'build'] },
  { id: 'food', label: '优先食物', hint: '打猎钓鱼做饭', posts: ['hunt', 'fish', 'cook', 'hunt', 'haul'] },
  { id: 'build', label: '优先建设', hint: '搬运和施工优先', posts: ['haul', 'build', 'build', 'scavenge', 'hunt'] },
  { id: 'scavenge', label: '优先搜刮', hint: '多派人外出搜刮', posts: ['scavenge', 'scavenge', 'haul', 'hunt', 'cook'] },
  { id: 'rest', label: '全体待命', hint: '收回营地休息', posts: ['idle', 'idle', 'idle', 'idle', 'idle'] },
] as const

export type RosterStrategyId = (typeof ROSTER_STRATEGIES)[number]['id']

const PROFESSION_POST: Record<string, RosterPostId> = {
  hunter: 'hunt',
  fisher: 'fish',
  scavenger: 'scavenge',
  hauler: 'haul',
  builder: 'build',
}

export function postLabel(id: string | null): string {
  return ROSTER_POSTS.find((post) => post.id === id)?.label ?? '待命'
}

export function watchCornerLabel(postId: string | null): string {
  return WATCH_CORNERS.find((corner) => corner.id === postId)?.label ?? ''
}

export function assignmentLabel(survivor: { id?: string; dayAssignment: string | null; watchPostId: string | null }, heroId?: string): string {
  if (heroId && survivor.id === heroId) return '主角'
  if (survivor.dayAssignment === 'follow') return '跟随'
  if (survivor.dayAssignment === 'watch') {
    const corner = watchCornerLabel(survivor.watchPostId)
    return corner ? `站岗·${corner}` : '站岗'
  }
  return postLabel(survivor.dayAssignment)
}

export function commandableSurvivors(world: WorldState): SurvivorState[] {
  return world.survivors.filter((survivor) => !survivor.downed && !isHero(world, survivor))
}

export function assignPost(world: WorldState, survivorId: string, postId: RosterPostId): boolean {
  const survivor = world.survivors.find((entry) => entry.id === survivorId)
  if (!survivor || survivor.downed || isHero(world, survivor)) return false
  const next = postId === 'idle' ? null : postId
  if (next && !jobDefinition(next) && next !== 'cook' && next !== 'watch' && next !== 'follow') return false
  survivor.dayAssignment = next
  survivor.currentJobId = null
  survivor.workerState = 'RestOrNextJob'
  survivor.destination = null
  survivor.path = []
  survivor.pathTarget = null
  leaveFacility(world, survivor)
  if (next === 'watch' && !survivor.watchPostId) {
    const open = world.nightPosts.find((post) => !world.survivors.some((entry) => entry.watchPostId === post.id && entry.id !== survivor.id))
    if (open) {
      survivor.watchPostId = open.id
      survivor.nightPostId = open.id
      open.occupantId = survivor.id
    }
  }
  if (next !== 'watch') {
    if (survivor.watchPostId) {
      const post = world.nightPosts.find((entry) => entry.id === survivor.watchPostId)
      if (post && post.occupantId === survivor.id) post.occupantId = null
    }
    survivor.watchPostId = null
    survivor.nightPostId = null
  }
  world.rosterStrategy = null
  return true
}

export function assignWatch(world: WorldState, postId: string, survivorId: string): boolean {
  const survivor = world.survivors.find((entry) => entry.id === survivorId)
  const post = world.nightPosts.find((entry) => entry.id === postId)
  if (!survivor || !post || survivor.downed || isHero(world, survivor)) return false
  for (const other of world.survivors) {
    if (other.id === survivor.id || other.watchPostId !== postId) continue
    other.watchPostId = null
    if (other.nightPostId === postId) other.nightPostId = null
    if (other.dayAssignment === 'watch') other.dayAssignment = null
  }
  survivor.dayAssignment = 'watch'
  survivor.watchPostId = postId
  survivor.nightPostId = postId
  survivor.currentJobId = null
  survivor.workerState = 'RestOrNextJob'
  survivor.destination = null
  survivor.path = []
  leaveFacility(world, survivor)
  post.occupantId = survivor.id
  world.rosterStrategy = null
  return true
}

export function applyRosterStrategy(world: WorldState, strategyId: RosterStrategyId): void {
  const strategy = ROSTER_STRATEGIES.find((entry) => entry.id === strategyId)
  if (!strategy) return
  world.rosterStrategy = strategyId
  if (strategyId === 'watch') {
    assignFourTowers(world)
    return
  }
  if (strategyId === 'balanced') {
    for (const survivor of commandableSurvivors(world)) {
      assignQuiet(world, survivor.id, PROFESSION_POST[survivor.professionId] ?? 'idle')
    }
    return
  }

  const remaining = [...strategy.posts] as RosterPostId[]
  const ready = commandableSurvivors(world)
  for (const survivor of ready) {
    const preferred = PROFESSION_POST[survivor.professionId]
    const match = preferred ? remaining.indexOf(preferred) : -1
    const post = (match >= 0 ? remaining.splice(match, 1)[0] : remaining.shift()) ?? 'idle'
    assignQuiet(world, survivor.id, post)
  }
}

function assignFourTowers(world: WorldState): void {
  const ready = commandableSurvivors(world)
  for (const [index, corner] of WATCH_CORNERS.entries()) {
    const survivor = ready[index]
    if (!survivor) break
    assignWatch(world, corner.id, survivor.id)
  }
  for (const extra of ready.slice(WATCH_CORNERS.length)) {
    if (extra.dayAssignment === 'watch') assignPost(world, extra.id, 'idle')
  }
  world.rosterStrategy = 'watch'
}

function assignQuiet(world: WorldState, survivorId: string, postId: RosterPostId): void {
  const strategy = world.rosterStrategy
  assignPost(world, survivorId, postId)
  world.rosterStrategy = strategy
}
