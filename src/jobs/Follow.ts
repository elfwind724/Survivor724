import { autoCombat } from '@/combat/Combat'
import { heroSurvivor, isHero } from '@/controls/PlayerControl'
import { beginTravel, followTravel } from '@/navigation/Travel'
import { distanceXZ, type SurvivorState, type Vec3, type WorldState } from '@/simulation/types'
import { assignPost } from './Roster'

export function followingSurvivors(world: WorldState): SurvivorState[] {
  return world.survivors.filter((entry) => entry.dayAssignment === 'follow' && !entry.downed)
}

export function gatherFollowers(world: WorldState, at: Vec3): void {
  const pack = followingSurvivors(world)
  for (let i = 0; i < pack.length; i += 1) {
    const follower = pack[i]
    if (!follower) continue
    const angle = (i / Math.max(1, pack.length)) * Math.PI * 2 + 0.5
    follower.position = { x: at.x + Math.sin(angle) * 1.6, y: 0, z: at.z + Math.cos(angle) * 1.6 }
    follower.destination = null
    follower.path = []
    follower.pathTarget = null
  }
}

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
  if (distanceXZ(survivor.position, spot) > 14) {
    survivor.position = { x: spot.x, y: 0, z: spot.z }
    survivor.destination = null
    survivor.path = []
    survivor.pathTarget = null
    return
  }
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
  const pack = followingSurvivors(world)
  const index = Math.max(0, pack.findIndex((entry) => entry.id === follower.id))
  const angle = (index * (Math.PI * 2)) / Math.max(1, pack.length) + Math.PI * 0.65
  return {
    x: hero.position.x + Math.sin(angle) * 2.2,
    y: 0,
    z: hero.position.z + Math.cos(angle) * 2.2,
  }
}
