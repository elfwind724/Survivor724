import { leaveFacility } from '@/base/FacilityLife'
import { cloneVec3, type SurvivorState, type Vec3, type WorldState } from '@/simulation/types'
import { moveToward } from '@/survivors/Survivor'
import { findPath } from './AStar'

export function beginTravel(world: WorldState, survivor: SurvivorState, target: Vec3): boolean {
  leaveFacility(world, survivor)
  survivor.position.y = 0
  const path = findPath(world, survivor.position, target)
  survivor.pathTarget = cloneVec3(target)
  survivor.pathVersion = world.nav.version
  if (!path || path.length === 0) {
    survivor.path = []
    survivor.destination = null
    survivor.blockedReason = 'route_blocked'
    return false
  }
  if (survivor.blockedReason === 'route_blocked') survivor.blockedReason = null
  survivor.path = path
  const first = path[0]
  survivor.destination = first ? cloneVec3(first) : cloneVec3(target)
  return true
}

export function followTravel(world: WorldState, survivor: SurvivorState, dt: number): boolean {
  if (survivor.pathTarget && survivor.pathVersion !== world.nav.version) {
    if (!beginTravel(world, survivor, survivor.pathTarget)) return false
  }
  if (!survivor.destination) return true
  if (!moveToward(survivor, dt)) return false
  survivor.path.shift()
  const next = survivor.path[0]
  if (!next) {
    survivor.destination = null
    survivor.pathTarget = null
    return true
  }
  survivor.destination = cloneVec3(next)
  return false
}
