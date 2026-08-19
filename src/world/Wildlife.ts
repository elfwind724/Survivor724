import { BASE } from '@/simulation/baseLayout'
import { cloneVec3, distanceXZ, type Vec3, type WildlifeKind, type WildlifeState, type WorldState } from '@/simulation/types'

export interface SpeciesDef {
  kind: WildlifeKind
  habitat: WildlifeState['habitat']
  height: number
  health: number
  meat: number
  fleeRadius: number
  speed: number
  killXp: number
  assetId: string
}

export const WILDLIFE_SPECIES: Record<WildlifeKind, SpeciesDef> = {
  deer: { kind: 'deer', habitat: 'forest', height: 1.18, health: 28, meat: 2, fleeRadius: 14, speed: 3.4, killXp: 8, assetId: 'animals/deer' },
  stag: { kind: 'stag', habitat: 'forest', height: 1.36, health: 36, meat: 3, fleeRadius: 13, speed: 3.6, killXp: 10, assetId: 'animals/stag' },
  fox: { kind: 'fox', habitat: 'forest', height: 0.62, health: 16, meat: 1, fleeRadius: 16, speed: 4.2, killXp: 5, assetId: 'animals/fox' },
  wolf: { kind: 'wolf', habitat: 'forest', height: 0.86, health: 32, meat: 2, fleeRadius: 9, speed: 4.0, killXp: 9, assetId: 'animals/wolf' },
  cow: { kind: 'cow', habitat: 'grass', height: 1.32, health: 40, meat: 4, fleeRadius: 12, speed: 2.2, killXp: 8, assetId: 'animals/cow' },
  bull: { kind: 'bull', habitat: 'grass', height: 1.42, health: 48, meat: 4, fleeRadius: 10, speed: 2.4, killXp: 10, assetId: 'animals/bull' },
  horse: { kind: 'horse', habitat: 'grass', height: 1.52, health: 36, meat: 3, fleeRadius: 16, speed: 5.0, killXp: 8, assetId: 'animals/horse' },
  alpaca: { kind: 'alpaca', habitat: 'grass', height: 1.12, health: 24, meat: 2, fleeRadius: 14, speed: 2.8, killXp: 6, assetId: 'animals/alpaca' },
  donkey: { kind: 'donkey', habitat: 'grass', height: 1.08, health: 28, meat: 2, fleeRadius: 13, speed: 2.6, killXp: 6, assetId: 'animals/donkey' },
}

const HABITATS: Record<WildlifeState['habitat'], { x: number; z: number; radius: number }> = {
  forest: { x: 56, z: -22, radius: 22 },
  grass: { x: 26, z: 74, radius: 20 },
  river: { x: -56, z: 34, radius: 16 },
}

const RESPAWN_SECONDS = 88

export function wildlifeHeight(kind: WildlifeKind): number {
  return WILDLIFE_SPECIES[kind].height
}

export function wildlifeMeat(kind: WildlifeKind): number {
  return WILDLIFE_SPECIES[kind].meat
}

export function wildlifeKillXp(kind: WildlifeKind): number {
  return WILDLIFE_SPECIES[kind].killXp
}

export function wildlifeAsset(kind: WildlifeKind): string {
  return WILDLIFE_SPECIES[kind].assetId
}

export function wildlifeAssetOf(animal: WildlifeState): string {
  return animal.assetId ?? WILDLIFE_SPECIES[animal.kind].assetId
}

const ASSET_KIND: Record<string, WildlifeKind> = {
  deer: 'deer',
  stag: 'stag',
  fox: 'fox',
  wolf: 'wolf',
  cow: 'cow',
  bull: 'bull',
  horse: 'horse',
  alpaca: 'alpaca',
  donkey: 'donkey',
  husky: 'wolf',
  'shiba-inu': 'fox',
  'white-horse': 'horse',
}

export function animalKindFromAsset(assetId: string): WildlifeKind | null {
  if (!assetId.startsWith('animals/')) return null
  return ASSET_KIND[assetId.slice('animals/'.length)] ?? null
}

export const WILDLIFE_LABEL: Record<WildlifeKind, string> = {
  deer: '鹿',
  stag: '牡鹿',
  fox: '狐狸',
  wolf: '狼',
  cow: '牛',
  bull: '公牛',
  horse: '马',
  alpaca: '羊驼',
  donkey: '驴',
}

export function createAnimal(input: {
  id: string
  kind: WildlifeKind
  habitat?: WildlifeState['habitat']
  herdId: string
  position: Vec3
  assetId?: string
}): WildlifeState {
  const species = WILDLIFE_SPECIES[input.kind]
  const habitat = input.habitat ?? species.habitat
  const animal: WildlifeState = {
    id: input.id,
    kind: input.kind,
    habitat,
    herdId: input.herdId,
    position: cloneVec3(input.position),
    home: cloneVec3(input.position),
    destination: null,
    facingYaw: 0,
    health: species.health,
    maxHealth: species.health,
    alive: true,
    mood: 'graze',
    fleeTimer: 0,
    harvested: false,
    respawnIn: 0,
    butcherElapsed: 0,
  }
  if (input.assetId) animal.assetId = input.assetId
  return animal
}

const CREATIVE_WILDLIFE_KEY = 'dawn-bastion-creative-wildlife'

interface SavedCreativeAnimal {
  kind: WildlifeKind
  assetId: string
  x: number
  z: number
  yaw: number
}

export function spawnCreativeAnimal(
  world: WorldState,
  assetId: string,
  x: number,
  z: number,
  yaw = 0,
): WildlifeState | null {
  const kind = animalKindFromAsset(assetId)
  if (!kind) return null
  const id = `creative-${kind}-${world.wildlife.length + 1}`
  const animal = createAnimal({
    id,
    kind,
    herdId: `creative-${id}`,
    position: { x, y: 0, z },
    assetId,
  })
  animal.facingYaw = yaw
  animal.mood = 'wander'
  world.wildlife.push(animal)
  return animal
}

export function removeCreativeAnimal(world: WorldState, id: string): boolean {
  const index = world.wildlife.findIndex((entry) => entry.id === id && entry.id.startsWith('creative-'))
  if (index < 0) return false
  world.wildlife.splice(index, 1)
  persistCreativeWildlife(world)
  return true
}

export function persistCreativeWildlife(world: WorldState): void {
  if (typeof localStorage === 'undefined') return
  const saved: SavedCreativeAnimal[] = world.wildlife
    .filter((entry) => entry.id.startsWith('creative-') && entry.alive)
    .map((entry) => ({
      kind: entry.kind,
      assetId: wildlifeAssetOf(entry),
      x: entry.position.x,
      z: entry.position.z,
      yaw: entry.facingYaw,
    }))
  localStorage.setItem(CREATIVE_WILDLIFE_KEY, JSON.stringify(saved))
}

export function loadCreativeWildlife(world: WorldState): void {
  if (typeof localStorage === 'undefined') return
  try {
    const raw = localStorage.getItem(CREATIVE_WILDLIFE_KEY)
    if (!raw) return
    const saved = JSON.parse(raw) as SavedCreativeAnimal[]
    if (!Array.isArray(saved)) return
    for (const entry of saved) {
      if (!animalKindFromAsset(entry.assetId) && !WILDLIFE_SPECIES[entry.kind]) continue
      if (!Number.isFinite(entry.x) || !Number.isFinite(entry.z)) continue
      spawnCreativeAnimal(world, entry.assetId, entry.x, entry.z, entry.yaw)
    }
  } catch {
    return
  }
}

export function createDeer(id: string, position: Vec3): WildlifeState {
  return createAnimal({ id, kind: 'deer', herdId: 'herd-legacy', position })
}

export function seedWildlife(): WildlifeState[] {
  const animals: WildlifeState[] = []
  const add = (kind: WildlifeKind, herdId: string, x: number, z: number, habitat?: WildlifeState['habitat']): void => {
    const draft: Parameters<typeof createAnimal>[0] = {
      id: `${kind}-${animals.length + 1}`,
      kind,
      herdId,
      position: { x, y: 0, z },
    }
    if (habitat) draft.habitat = habitat
    animals.push(createAnimal(draft))
  }

  add('deer', 'herd-forest', 52, -18)
  add('deer', 'herd-forest', 58, -24)
  add('deer', 'herd-forest', 48, -14)
  add('stag', 'herd-forest', 62, -16)
  add('fox', 'fox-1', 44, -28)
  add('fox', 'fox-2', 70, -8)
  add('wolf', 'pack-forest', 74, -34)
  add('wolf', 'pack-forest', 68, -38)

  add('cow', 'herd-grass', 24, 72)
  add('cow', 'herd-grass', 30, 78)
  add('bull', 'herd-grass', 22, 80)
  add('horse', 'herd-horses', 16, 70)
  add('horse', 'herd-horses', 20, 66)
  add('alpaca', 'herd-alpaca', 34, 68)
  add('alpaca', 'herd-alpaca', 36, 74)
  add('donkey', 'pair-donkeys', 12, 78)

  add('deer', 'herd-river', -52, 32, 'river')
  add('deer', 'herd-river', -58, 38, 'river')
  add('fox', 'fox-river', -46, 28, 'river')
  return animals
}

export function nearestLivingWildlife(
  world: WorldState,
  from: { x: number; z: number },
  range: number,
): WildlifeState | undefined {
  let best: WildlifeState | undefined
  let bestDist = range
  for (const animal of world.wildlife) {
    if (!animal.alive || animal.harvested) continue
    const distance = Math.hypot(animal.position.x - from.x, animal.position.z - from.z)
    if (distance < bestDist) {
      best = animal
      bestDist = distance
    }
  }
  return best
}

export function markHarvested(animal: WildlifeState): void {
  animal.harvested = true
  animal.alive = false
  animal.destination = null
  animal.mood = 'graze'
  animal.respawnIn = RESPAWN_SECONDS
}

export function stepWildlife(world: WorldState, dt: number): void {
  const day = world.time.phase === 'dawn' || world.time.phase === 'day'
  for (const animal of world.wildlife) {
    if (animal.harvested) {
      animal.respawnIn -= dt
      if (animal.respawnIn <= 0) reviveAnimal(animal)
      continue
    }
    if (!animal.alive) continue
    const species = WILDLIFE_SPECIES[animal.kind]
    const threat = nearestThreatTo(world, animal.position, species.fleeRadius + 6)
    const danger = threat ? distanceXZ(animal.position, threat) : Number.POSITIVE_INFINITY
    const fleeAt = species.fleeRadius + (day ? 0 : 4)
    if (threat && danger < fleeAt) {
      animal.mood = 'flee'
      animal.fleeTimer = 4.2
      const dx = animal.position.x - threat.x
      const dz = animal.position.z - threat.z
      const len = Math.hypot(dx, dz) || 1
      animal.destination = keepWild({
        x: animal.position.x + (dx / len) * 16,
        y: 0,
        z: animal.position.z + (dz / len) * 16,
      }, animal, 1.8)
    } else if (animal.fleeTimer > 0) {
      animal.fleeTimer -= dt
      if (animal.fleeTimer <= 0) {
        if (animal.mood === 'flee') animal.mood = day ? 'wander' : 'graze'
        animal.destination = null
      }
    } else if (!animal.destination || distanceXZ(animal.position, animal.destination) < 0.7) {
      chooseNextMove(world, animal, day)
    }
    if (animal.mood === 'graze' || !animal.destination) continue
    const speed = animal.mood === 'flee' ? species.speed * 1.35 : species.speed * 0.7
    stepToward(animal, animal.destination, speed * dt)
  }
}

function reviveAnimal(animal: WildlifeState): void {
  const species = WILDLIFE_SPECIES[animal.kind]
  animal.alive = true
  animal.harvested = false
  animal.health = species.health
  animal.mood = 'graze'
  animal.fleeTimer = 0
  animal.destination = null
  animal.butcherElapsed = 0
  animal.position = cloneVec3(animal.home)
}

function nearestThreatTo(world: WorldState, from: Vec3, range: number): Vec3 | null {
  let best: Vec3 | null = null
  let bestDist = range
  for (const survivor of world.survivors) {
    if (survivor.downed) continue
    const distance = distanceXZ(survivor.position, from)
    if (distance < bestDist) {
      best = survivor.position
      bestDist = distance
    }
  }
  return best
}

function chooseNextMove(world: WorldState, animal: WildlifeState, day: boolean): void {
  const roll = unitNoise(`${animal.id}:${Math.floor(world.time.daySeconds)}`)
  if (!day) {
    animal.mood = 'graze'
    animal.destination = null
    animal.fleeTimer = 4 + roll * 6
    return
  }
  const arrivedWander = animal.mood === 'wander' && animal.destination
  animal.mood = arrivedWander
    ? (roll > 0.42 ? 'graze' : 'wander')
    : roll > 0.48 ? 'wander' : 'graze'
  if (animal.mood === 'wander') {
    animal.destination = pickHabitatPoint(world, animal, day)
    animal.fleeTimer = 0
    return
  }
  animal.destination = null
  animal.fleeTimer = 2.6 + unitNoise(`${animal.id}:dwell`) * 6.5
}

function pickHabitatPoint(world: WorldState, animal: WildlifeState, day: boolean): Vec3 {
  const pad = HABITATS[animal.habitat]
  const herd = herdCenter(world, animal.herdId) ?? animal.home
  const spread = day ? pad.radius * 0.55 : pad.radius * 0.28
  const seed = `${animal.id}:${Math.floor(world.time.daySeconds / 4)}`
  const angle = unitNoise(seed) * Math.PI * 2
  const radius = unitNoise(`${seed}:r`) * spread
  const point = keepWild({
    x: herd.x + Math.cos(angle) * radius,
    y: 0,
    z: herd.z + Math.sin(angle) * radius,
  }, animal, day ? 1.15 : 0.7)
  return point
}

function herdCenter(world: WorldState, herdId: string): Vec3 | null {
  let x = 0
  let z = 0
  let count = 0
  for (const animal of world.wildlife) {
    if (animal.herdId !== herdId || !animal.alive) continue
    x += animal.position.x
    z += animal.position.z
    count += 1
  }
  if (count === 0) return null
  return { x: x / count, y: 0, z: z / count }
}

function keepWild(point: Vec3, animal: WildlifeState, radiusScale: number): Vec3 {
  const pad = HABITATS[animal.habitat]
  const dx = point.x - pad.x
  const dz = point.z - pad.z
  const dist = Math.hypot(dx, dz)
  const max = pad.radius * radiusScale
  if (dist > max && dist > 0.001) {
    point.x = pad.x + (dx / dist) * max
    point.z = pad.z + (dz / dist) * max
  }
  pushOutOfBase(point)
  return point
}

function pushOutOfBase(point: Vec3): void {
  const pad = 8
  const west = BASE.west - pad
  const east = BASE.east + pad
  const south = BASE.south - pad
  const north = BASE.north + pad
  if (point.x <= west || point.x >= east || point.z <= south || point.z >= north) return
  const left = point.x - west
  const right = east - point.x
  const down = point.z - south
  const up = north - point.z
  const nearest = Math.min(left, right, down, up)
  if (nearest === left) point.x = west
  else if (nearest === right) point.x = east
  else if (nearest === down) point.z = south
  else point.z = north
}

function stepToward(animal: WildlifeState, target: Vec3, step: number): void {
  const dx = target.x - animal.position.x
  const dz = target.z - animal.position.z
  const dist = Math.hypot(dx, dz)
  if (dist < 0.001) return
  animal.facingYaw = Math.atan2(dx, dz)
  const move = Math.min(step, dist)
  animal.position.x += (dx / dist) * move
  animal.position.z += (dz / dist) * move
}

function unitNoise(seed: string): number {
  let hash = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return ((hash >>> 0) % 10_000) / 10_000
}
