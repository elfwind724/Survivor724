import { autoCombat } from '@/combat/Combat'
import { heroSurvivor, isHero } from '@/controls/PlayerControl'
import { beginTravel, followTravel } from '@/navigation/Travel'
import { distanceXZ, type SurvivorState, type Vec3, type WorldState } from '@/simulation/types'
import { assignPost } from './Roster'

export function toggleFollow(world: WorldState, survivorId: string): 'follow' | 'idle' | null {
  const survivor = world.survivors.find((entry) => entry.id === survivorId)
  if (!survivor || isHero(world, survivor)) return null
  if (survivor.dayAssignment === 'follow') {
    assignPost(world, survivorId, 'idle')
    return 'idle'
  }
  if (!assignPost(world, survivorId, 'follow')) return null
  return 'follow'
}

export function stepFollowHero(world: WorldState, survivor: SurvivorState, dt: number): void {
  const hero = heroSurvivor(world)
  if (!hero) return
  const spot = followSpot(world, survivor, hero)
  if (distanceXZ(survivor.position, spot) > 1.9) {
    survivor.position.y = 0
    if (!survivor.pathTarget || distanceXZ(survivor.pathTarget, spot) > 1.1) {
      beginTravel(world, survivor, spot)
    }
    followTravel(world, survivor, dt)
    return
  }
  survivor.destination = null
  survivor.path = []
  survivor.pathTarget = null
  survivor.facingYaw = hero.facingYaw
  autoCombat(world, survivor)
}

function followSpot(world: WorldState, follower: SurvivorState, hero: SurvivorState): Vec3 {
  const pack = world.survivors.filter((entry) => entry.dayAssignment === 'follow' && !entry.downed)
  const index = Math.max(0, pack.findIndex((entry) => entry.id === follower.id))
  const angle = (index * (Math.PI * 2)) / Math.max(1, pack.length) + Math.PI * 0.65
  return {
    x: hero.position.x + Math.sin(angle) * 2.2,
    y: 0,
    z: hero.position.z + Math.cos(angle) * 2.2,
  }
}
