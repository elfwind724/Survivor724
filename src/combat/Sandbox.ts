import { damageStructure, demolishAt, repairStructure } from '@/base/construction'
import { addItem, inventoryOf } from '@/inventory/Inventory'
import { applyRosterStrategy } from '@/jobs/Roster'
import { cellCenter } from '@/navigation/NavGrid'
import { findContainer } from '@/simulation/EntityRegistry'
import { stepLiving } from '@/survivors/Living'
import { DUSK_END, NIGHT_END } from '@/simulation/TimeSystem'
import type { DefenseSectorId, WorldState } from '@/simulation/types'
import { hordeCounts } from '@/data/enemies'
import { prepareNightDefense, settleNight, spawnHordeWave, type HordeApproach } from './Night'

export type { HordeApproach }

export interface SandboxDraft {
  wanderers: number
  runners: number
  approach: HordeApproach
  dayIndex: number
}

export const SANDBOX_PRESETS: Array<{
  id: string
  label: string
  hint: string
  wanderers: number
  runners: number
  approach: HordeApproach
  weaken?: boolean
}> = [
  { id: 'probe', label: '试探', hint: '北面小股，看塔防', wanderers: 6, runners: 2, approach: 'north' },
  { id: 'main', label: '主攻', hint: '标准四面尸潮', wanderers: 18, runners: 8, approach: 'all' },
  { id: 'storm', label: '猛攻', hint: '更厚的四面潮', wanderers: 32, runners: 16, approach: 'all' },
  { id: 'breach', label: '破口', hint: '墙先残再冲北面', wanderers: 20, runners: 10, approach: 'north', weaken: true },
]

export function defaultSandboxDraft(dayIndex = 1): SandboxDraft {
  const counts = hordeCounts(dayIndex)
  return { wanderers: counts.wanderers, runners: counts.runners, approach: 'all', dayIndex }
}

export function sandboxSnapshot(world: WorldState): {
  enemies: number
  kills: number
  spawned: number
  downed: number
  walls: number
  wallHp: number
  paused: boolean
  phase: string
} {
  const walls = world.structures.filter((entry) => (entry.kind === 'wall' || entry.kind === 'gate') && entry.stage === 'complete')
  const hp = walls.reduce((sum, entry) => sum + entry.hp, 0)
  const max = walls.reduce((sum, entry) => sum + entry.maxHp, 0)
  return {
    enemies: world.enemies.length,
    kills: world.nightKills,
    spawned: world.nightSpawned,
    downed: world.survivors.filter((survivor) => survivor.downed).length,
    walls: walls.length,
    wallHp: max > 0 ? Math.round((hp / max) * 100) : 0,
    paused: world.paused,
    phase: world.time.phase,
  }
}

export function jumpToNight(world: WorldState, draft: SandboxDraft): void {
  world.paused = false
  world.gameOver = false
  world.nightReport = null
  world.time.dayIndex = Math.max(1, Math.floor(draft.dayIndex))
  world.time.daySeconds = DUSK_END + 1
  world.time.phase = 'night'
  world.lastPhase = 'dusk'
  world.nightSpawnedDay = world.time.dayIndex
  world.time.timeScale = Math.max(1, world.time.timeScale)
  restoreSurvivors(world)
  applyRosterStrategy(world, 'watch')
  prepareNightDefense(world)
  spawnHordeWave(world, { wanderers: draft.wanderers, runners: draft.runners }, draft.approach, true)
}

export function spawnAnotherWave(world: WorldState, draft: SandboxDraft): void {
  world.paused = false
  world.gameOver = false
  if (world.time.phase !== 'night') {
    jumpToNight(world, draft)
    return
  }
  spawnHordeWave(world, { wanderers: draft.wanderers, runners: draft.runners }, draft.approach, false)
}

export function clearHorde(world: WorldState): void {
  world.enemies = []
  world.projectiles = []
}

export function skipToAftermath(world: WorldState): void {
  if (world.time.phase === 'aftermath' && world.nightReport) return
  world.paused = false
  world.time.daySeconds = NIGHT_END + 1
  world.time.phase = 'aftermath'
  world.lastPhase = 'night'
  world.enemies = []
  settleNight(world)
  stepLiving(world)
  world.lastPhase = 'aftermath'
}

export function setSandboxPaused(world: WorldState, paused: boolean): void {
  world.paused = paused
}

export function setSandboxTimeScale(world: WorldState, scale: number): void {
  world.paused = false
  world.time.timeScale = scale
}

export function restoreSurvivors(world: WorldState): void {
  for (const survivor of world.survivors) {
    survivor.downed = false
    survivor.health = 100
    survivor.fatigue = Math.min(survivor.fatigue, 20)
    survivor.morale = Math.max(survivor.morale, 60)
    survivor.position.y = 0
  }
}

export function restockSandboxAmmo(world: WorldState): void {
  const warehouse = findContainer(world, 'warehouse')
  if (warehouse) addItem(inventoryOf(world.inventories, warehouse.inventoryId), 'ammo', 80)
  prepareNightDefense(world)
}

export function repairFortifications(world: WorldState): number {
  let count = 0
  for (const structure of world.structures) {
    if ((structure.kind !== 'wall' && structure.kind !== 'gate') || structure.stage !== 'complete') continue
    if (structure.hp >= structure.maxHp) continue
    repairStructure(world, structure, structure.maxHp)
    count += 1
  }
  return count
}

export function weakenFortifications(world: WorldState, ratio = 0.4): number {
  let count = 0
  for (const structure of world.structures) {
    if ((structure.kind !== 'wall' && structure.kind !== 'gate') || structure.stage !== 'complete') continue
    structure.hp = Math.max(1, Math.round(structure.maxHp * ratio))
    count += 1
  }
  return count
}

export function breachSector(world: WorldState, sector: DefenseSectorId): boolean {
  const wall = perimeterWall(world, sector)
  if (!wall?.cells[0]) return false
  const point = cellCenter(world.nav, wall.cells[0])
  if (wall.cells.length > 1) {
    demolishAt(world, point, false)
    return true
  }
  return damageStructure(world, wall, wall.hp)
}

function perimeterWall(world: WorldState, sector: DefenseSectorId) {
  const north = world.structures
    .filter((structure) => structure.kind === 'wall' && structure.stage === 'complete' && structure.cells.length > 0)
    .map((structure) => {
      const mid = structure.cells.reduce(
        (sum, cell) => ({ x: sum.x + cell.x, z: sum.z + cell.z }),
        { x: 0, z: 0 },
      )
      const x = world.nav.originX + (mid.x / structure.cells.length + 0.5) * world.nav.cellSize
      const z = world.nav.originZ + (mid.z / structure.cells.length + 0.5) * world.nav.cellSize
      return { structure, x, z }
    })
  const scored = north
    .map((entry) => {
      if (sector === 'north') return { ...entry, score: entry.z }
      if (sector === 'south') return { ...entry, score: -entry.z }
      if (sector === 'east') return { ...entry, score: entry.x }
      return { ...entry, score: -entry.x }
    })
    .sort((a, b) => b.score - a.score)
  return scored[0]?.structure
}

export function approachLabel(approach: HordeApproach): string {
  if (approach === 'north') return '北面'
  if (approach === 'east') return '东面'
  if (approach === 'south') return '南面'
  if (approach === 'west') return '西面'
  return '四面'
}
