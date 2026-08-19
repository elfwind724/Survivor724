import { autoCombat, butcherWildlife, stepAilments, stepEnemies, stepProjectiles, stepRevive, tickCooldowns } from '@/combat/Combat'
import { ejectWarehouseGear, pickupGroundLoot } from '@/data/loot'
import { applyDungeonNav, stepDungeonRun } from '@/dungeon/Dungeon'
import { depositIfNearWarehouse } from '@/inventory/Cargo'
import { stepFishing } from '@/world/Fishing'
import { stepWildlife } from '@/world/Wildlife'
import { readyForNightPost, stepNightCycle, stepNightDefender } from '@/combat/Night'
import { type ControlIntent, stepPlayerControl } from '@/controls/PlayerControl'
import { stepDayWorker } from '@/jobs/DayWorker'
import { planJobs } from '@/jobs/JobPlanner'
import { rebuildNav } from '@/navigation/NavGrid'
import { stepLiving } from '@/survivors/Living'
import { stepVitals } from '@/survivors/Vitals'
import { advanceTime } from './TimeSystem'
import type { WorldState } from './types'

export function stepWorld(world: WorldState, dt: number, intent: ControlIntent | null = null): void {
  advanceTime(world, dt)
  ejectWarehouseGear(world)
  if (world.navDirty) {
    rebuildNav(world)
    applyDungeonNav(world)
  }
  stepLiving(world)
  stepNightCycle(world)
  planJobs(world)
  tickCooldowns(world, dt)
  if (world.player.controlledId) {
    const self = world.survivors.find((entry) => entry.id === world.player.controlledId)
    if (intent) stepPlayerControl(world, dt, intent)
    if (self) {
      butcherWildlife(world, self, dt)
      const moving = !!intent && (intent.wishX !== 0 || intent.wishZ !== 0)
      stepFishing(world, self, dt, { autoTravel: false, moving })
      pickupGroundLoot(world, self)
      depositIfNearWarehouse(world, self)
      autoCombat(world, self)
    }
  }
  const hero = world.survivors.find((entry) => entry.id === world.player.heroId)
  if (hero && hero.id !== world.player.controlledId) pickupGroundLoot(world, hero)
  for (const survivor of world.survivors) {
    if (survivor.id === world.player.controlledId) continue
    if (readyForNightPost(world, survivor)) stepNightDefender(world, survivor, dt)
    else stepDayWorker(world, survivor, dt)
  }
  stepProjectiles(world, dt)
  stepAilments(world, dt)
  stepEnemies(world, dt)
  stepDungeonRun(world)
  stepWildlife(world, dt)
  stepRevive(world, dt)
  stepVitals(world, dt)
}

export function skipSeconds(world: WorldState, seconds: number): void {
  const dt = 1 / 30
  const steps = Math.max(1, Math.round(seconds / dt))
  for (let i = 0; i < steps; i += 1) stepWorld(world, dt)
}
