import { type ControlIntent, stepPlayerControl } from '@/controls/PlayerControl'
import { stepDayWorker } from '@/jobs/DayWorker'
import { planJobs } from '@/jobs/JobPlanner'
import { rebuildNav } from '@/navigation/NavGrid'
import { advanceTime } from './TimeSystem'
import type { WorldState } from './types'

export function stepWorld(world: WorldState, dt: number, intent: ControlIntent | null = null): void {
  advanceTime(world, dt)
  if (world.navDirty) rebuildNav(world)
  planJobs(world)
  if (intent && world.player.controlledId) stepPlayerControl(world, dt, intent)
  for (const survivor of world.survivors) {
    if (survivor.id === world.player.controlledId) continue
    stepDayWorker(world, survivor, dt)
  }
}
