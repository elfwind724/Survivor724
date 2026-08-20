import { hallLevel } from '@/base/upgrade'
import { seedFishingSpots } from '@/world/Fishing'
import { seedRuinCrates } from '@/world/Ruins'
import { seedBerryBushes } from '@/world/Forage'
import { seedWaterScoops } from '@/world/Draw'
import { emptyCodex } from '@/data/hallPool'
import { remapNav } from '@/navigation/NavGrid'
import { phaseLabel } from '@/simulation/TimeSystem'
import type { DayPhase, WorldState } from '@/simulation/types'

export const SAVE_VERSION = 3
export const SAVE_KEY = 'dawn-bastion-save'
export const SAVE_SLOT_IDS = ['auto', '1', '2', '3'] as const
export type SaveSlotId = (typeof SAVE_SLOT_IDS)[number]

export const SAVE_SLOTS: Array<{ id: SaveSlotId; key: string; label: string }> = [
  { id: 'auto', key: 'dawn-bastion-save-auto', label: '自动' },
  { id: '1', key: SAVE_KEY, label: '档位 1' },
  { id: '2', key: 'dawn-bastion-save-2', label: '档位 2' },
  { id: '3', key: 'dawn-bastion-save-3', label: '档位 3' },
]

export interface SaveMeta {
  name: string
  savedAt: number
  day: number
  phase: DayPhase
  people: number
  hall: number
}

export interface SaveFile {
  version: number
  meta?: SaveMeta
  world: WorldState
}

export interface SaveSlotView {
  id: SaveSlotId
  label: string
  empty: boolean
  meta: SaveMeta | null
}

export function defaultSaveName(world: WorldState): string {
  return `第 ${world.time.dayIndex} 天 · ${phaseLabel(world.time.phase)}`
}

export function serializeWorld(world: WorldState, name?: string): SaveFile {
  return {
    version: SAVE_VERSION,
    meta: makeMeta(world, name),
    world: structuredClone(world),
  }
}

export function deserializeWorld(raw: unknown): WorldState {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid save')
  const file = raw as SaveFile
  if (typeof file.version !== 'number' || !file.world || typeof file.world !== 'object') {
    throw new Error('Invalid save')
  }
  const world = structuredClone(file.world)
  if (typeof world.worldSeed !== 'string' || world.worldSeed.length === 0) world.worldSeed = 'dawn'
  if (world.dungeonRun === undefined) world.dungeonRun = null
  if (world.dungeonRun && !Array.isArray(world.dungeonRun.spawnedRooms)) world.dungeonRun.spawnedRooms = []
  if (world.raidEntered !== true) world.raidEntered = false
  if (world.raidBestRarity === undefined) world.raidBestRarity = null
  if (typeof world.dayGunshots !== 'number' || world.dayGunshots < 0) world.dayGunshots = 0
  if (!world.dayNoise || typeof world.dayNoise !== 'object') {
    world.dayNoise = { north: 0, east: 0, west: 0, south: 0 }
  } else {
    world.dayNoise.north = Math.max(0, world.dayNoise.north || 0)
    world.dayNoise.east = Math.max(0, world.dayNoise.east || 0)
    world.dayNoise.west = Math.max(0, world.dayNoise.west || 0)
    world.dayNoise.south = Math.max(0, world.dayNoise.south || 0)
  }
  if (!Array.isArray(world.fishingSpots) || world.fishingSpots.length === 0) world.fishingSpots = seedFishingSpots()
  if (!Array.isArray(world.ruinCrates) || world.ruinCrates.length === 0) world.ruinCrates = seedRuinCrates()
  if (!Array.isArray(world.berryBushes) || world.berryBushes.length === 0) world.berryBushes = seedBerryBushes()
  if (!Array.isArray(world.waterScoops) || world.waterScoops.length === 0) world.waterScoops = seedWaterScoops()
  if (!world.codex || typeof world.codex !== 'object') world.codex = emptyCodex()
  if (!Array.isArray(world.codex.affixes)) world.codex.affixes = []
  if (!Array.isArray(world.codex.procs)) world.codex.procs = []
  if (!Array.isArray(world.codex.bases) || world.codex.bases.length === 0) world.codex.bases = ['pistol']
  if (Array.isArray(world.groundLoot)) {
    for (const drop of world.groundLoot) {
      if (typeof drop.count !== 'number' || drop.count < 1) drop.count = 1
    }
  }
  remapNav(world)
  return world
}

export function saveToBrowser(world: WorldState): boolean {
  return writeSlot('1', world)
}

export function loadFromBrowser(): WorldState | null {
  return readSlot('1')
}

export function writeSlot(id: SaveSlotId, world: WorldState, name?: string): boolean {
  if (typeof localStorage === 'undefined') return false
  const slot = SAVE_SLOTS.find((entry) => entry.id === id)
  if (!slot) return false
  try {
    localStorage.setItem(slot.key, JSON.stringify(serializeWorld(world, name)))
    return true
  } catch {
    return false
  }
}

export function readSlot(id: SaveSlotId): WorldState | null {
  const slot = SAVE_SLOTS.find((entry) => entry.id === id)
  if (!slot) return null
  const raw = readRaw(slot.key)
  if (!raw) return null
  try {
    return deserializeWorld(raw)
  } catch {
    return null
  }
}

export function peekSlot(id: SaveSlotId): SaveMeta | null {
  const slot = SAVE_SLOTS.find((entry) => entry.id === id)
  if (!slot) return null
  return peekMeta(readRaw(slot.key))
}

export function listSlots(): SaveSlotView[] {
  return SAVE_SLOTS.map((slot) => ({
    id: slot.id,
    label: slot.label,
    empty: readRaw(slot.key) === null,
    meta: peekMeta(readRaw(slot.key)),
  }))
}

function makeMeta(world: WorldState, name?: string): SaveMeta {
  const trimmed = name?.trim()
  return {
    name: trimmed && trimmed.length > 0 ? trimmed : defaultSaveName(world),
    savedAt: Date.now(),
    day: world.time.dayIndex,
    phase: world.time.phase,
    people: world.survivors.length,
    hall: hallLevel(world),
  }
}

function peekMeta(raw: unknown): SaveMeta | null {
  if (!raw || typeof raw !== 'object') return null
  const file = raw as SaveFile
  if (file.meta && typeof file.meta.name === 'string') {
    return {
      name: file.meta.name,
      savedAt: typeof file.meta.savedAt === 'number' ? file.meta.savedAt : 0,
      day: file.meta.day ?? file.world?.time?.dayIndex ?? 1,
      phase: file.meta.phase ?? file.world?.time?.phase ?? 'dawn',
      people: file.meta.people ?? file.world?.survivors?.length ?? 0,
      hall: file.meta.hall ?? 1,
    }
  }
  const world = file.world
  if (!world?.time) return null
  return {
    name: defaultSaveName(world),
    savedAt: 0,
    day: world.time.dayIndex,
    phase: world.time.phase,
    people: Array.isArray(world.survivors) ? world.survivors.length : 0,
    hall: 1,
  }
}

function readRaw(key: string): unknown {
  if (typeof localStorage === 'undefined') return null
  try {
    const text = localStorage.getItem(key)
    if (!text) return null
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}
