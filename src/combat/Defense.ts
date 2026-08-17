import { distanceXZ, type DefenseSectorId, type WorldState } from '@/simulation/types'

export function createDefenseSectors(): WorldState['defenseSectors'] {
  return [
    { id: 'north', order: 'hold' },
    { id: 'east', order: 'hold' },
    { id: 'west', order: 'hold' },
    { id: 'south', order: 'hold' },
  ]
}

export function sectorPressure(world: WorldState, sector: DefenseSectorId): number {
  return world.enemies.filter((enemy) => sectorOfPoint(enemy.position.x, enemy.position.z) === sector).length
}

export function reinforceSector(world: WorldState, sector: DefenseSectorId): void {
  for (const entry of world.defenseSectors) {
    entry.order = entry.id === sector ? 'reinforce' : 'hold'
  }
  const extras = world.survivors.filter((survivor) => !survivor.downed && survivor.id !== world.player.controlledId)
  const sectorPosts = world.nightPosts.filter((post) => post.sector === sector)
  for (const [index, survivor] of extras.entries()) {
    const post = sectorPosts[index % Math.max(1, sectorPosts.length)]
    if (!post) continue
    const previous = world.nightPosts.find((entry) => entry.occupantId === survivor.id)
    if (previous && previous.id !== post.id) previous.occupantId = null
    post.occupantId = survivor.id
    survivor.nightPostId = post.id
    survivor.path = []
    survivor.destination = null
  }
}

export function fallbackSector(world: WorldState, sector: DefenseSectorId): void {
  const entry = world.defenseSectors.find((item) => item.id === sector)
  if (entry) entry.order = 'fallback'
  for (const post of world.nightPosts) {
    if (post.sector !== sector || !post.occupantId) continue
    const survivor = world.survivors.find((item) => item.id === post.occupantId)
    post.occupantId = null
    if (!survivor) continue
    survivor.nightPostId = null
    survivor.destination = { ...survivor.homePosition }
  }
}

export function sectorOfPoint(x: number, z: number): DefenseSectorId {
  if (Math.abs(x) > Math.abs(z)) return x >= 0 ? 'east' : 'west'
  return z >= 0 ? 'north' : 'south'
}
