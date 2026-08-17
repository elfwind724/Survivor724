import { stepDayWorker } from '@/jobs/DayWorker'
import { planJobs } from '@/jobs/JobPlanner'
import { rebuildNav } from '@/navigation/NavGrid'
import { advanceTime } from './TimeSystem'
import type { WorldState } from './types'

export function stepWorld(world: WorldState, dt: number): void {
  advanceTime(world, dt)
  if (world.navDirty) rebuildNav(world)
  planJobs(world)
  for (const survivor of world.survivors) {
    stepDayWorker(world, survivor, dt)
  }
}
