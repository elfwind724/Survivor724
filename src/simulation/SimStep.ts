import { harvestWildlife, stepEnemies, stepRevive, stepWildlife, tickCooldowns } from '@/combat/Combat'
import { stepNightCycle, stepNightDefender } from '@/combat/Night'
import { type ControlIntent, stepPlayerControl } from '@/controls/PlayerControl'
import { stepDayWorker } from '@/jobs/DayWorker'
import { planJobs } from '@/jobs/JobPlanner'
import { rebuildNav } from '@/navigation/NavGrid'
import { advanceTime } from './TimeSystem'
import type { WorldState } from './types'

export function stepWorld(world: WorldState, dt: number, intent: ControlIntent | null = null): void {
  advanceTime(world, dt)
  if (world.navDirty) rebuildNav(world)
  stepNightCycle(world)
  planJobs(world)
  tickCooldowns(world, dt)
  if (intent && world.player.controlledId) {
    const self = world.survivors.find((entry) => entry.id === world.player.controlledId)
    stepPlayerControl(world, dt, intent)
    if (self) harvestWildlife(world, self)
  }
  const nightWatch = world.time.phase === 'night' || world.time.phase === 'aftermath'
  for (const survivor of world.survivors) {
    if (survivor.id === world.player.controlledId) continue
    if (nightWatch) stepNightDefender(world, survivor, dt)
    else stepDayWorker(world, survivor, dt)
  }
  stepEnemies(world, dt)
  stepWildlife(world, dt)
  stepRevive(world, dt)
}

export function skipSeconds(world: WorldState, seconds: number): void {
  const dt = 1 / 30
  const steps = Math.max(1, Math.round(seconds / dt))
  for (let i = 0; i < steps; i += 1) stepWorld(world, dt)
}
