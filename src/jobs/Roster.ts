import { leaveFacility } from '@/base/FacilityLife'
import { jobDefinition } from '@/data/jobs'
import type { WorldState } from '@/simulation/types'

export const ROSTER_POSTS = [
  { id: 'hunt', label: '打猎' },
  { id: 'fish', label: '钓鱼' },
  { id: 'scavenge', label: '搜刮' },
  { id: 'haul', label: '搬运' },
  { id: 'build', label: '建造' },
  { id: 'cook', label: '做饭' },
  { id: 'idle', label: '待命' },
] as const

export type RosterPostId = (typeof ROSTER_POSTS)[number]['id']

export const ROSTER_STRATEGIES = [
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

export function assignPost(world: WorldState, survivorId: string, postId: RosterPostId): boolean {
  const survivor = world.survivors.find((entry) => entry.id === survivorId)
  if (!survivor || survivor.downed) return false
  const next = postId === 'idle' ? null : postId
  if (next && !jobDefinition(next) && next !== 'cook') return false
  survivor.dayAssignment = next
  survivor.currentJobId = null
  survivor.workerState = 'RestOrNextJob'
  survivor.destination = null
  survivor.path = []
  survivor.pathTarget = null
  leaveFacility(world, survivor)
  world.rosterStrategy = null
  return true
}

export function applyRosterStrategy(world: WorldState, strategyId: RosterStrategyId): void {
  const strategy = ROSTER_STRATEGIES.find((entry) => entry.id === strategyId)
  if (!strategy) return
  world.rosterStrategy = strategyId
  if (strategyId === 'balanced') {
    for (const survivor of world.survivors) {
      if (survivor.downed) continue
      assignQuiet(world, survivor.id, PROFESSION_POST[survivor.professionId] ?? 'idle')
    }
    return
  }

  const remaining = [...strategy.posts] as RosterPostId[]
  const ready = world.survivors.filter((survivor) => !survivor.downed)
  for (const survivor of ready) {
    const preferred = PROFESSION_POST[survivor.professionId]
    const match = preferred ? remaining.indexOf(preferred) : -1
    const post = (match >= 0 ? remaining.splice(match, 1)[0] : remaining.shift()) ?? 'idle'
    assignQuiet(world, survivor.id, post)
  }
}

function assignQuiet(world: WorldState, survivorId: string, postId: RosterPostId): void {
  const strategy = world.rosterStrategy
  assignPost(world, survivorId, postId)
  world.rosterStrategy = strategy
}
