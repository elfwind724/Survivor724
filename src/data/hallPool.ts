import { hallLevel } from '@/base/upgrade'
import { WEAPONS } from '@/data/weapons'
import type { AffixRoll, CodexState, GearPiece, WeaponProc, WorldState } from '@/simulation/types'

export const AFFIX_CATALOG: Array<{ id: AffixRoll['id']; label: string; hall: number }> = [
  { id: 'min_dmg', label: '最小攻击', hall: 1 },
  { id: 'max_dmg', label: '最大攻击', hall: 1 },
  { id: 'aspd', label: '攻速', hall: 2 },
  { id: 'crit', label: '暴击几率', hall: 2 },
  { id: 'crit_dmg', label: '暴击伤害', hall: 3 },
  { id: 'knockback', label: '击退', hall: 3 },
  { id: 'charm', label: '魅惑', hall: 3 },
  { id: 'str', label: '力量', hall: 4 },
  { id: 'agi', label: '敏捷', hall: 4 },
  { id: 'con', label: '体质', hall: 4 },
  { id: 'int', label: '智力', hall: 4 },
]

export const PROC_CATALOG: Array<{ id: WeaponProc; label: string; hall: number }> = [
  { id: 'burn', label: '燃烧', hall: 3 },
  { id: 'freeze', label: '冰冻', hall: 3 },
  { id: 'poison', label: '毒素', hall: 3 },
  { id: 'pierce', label: '穿透', hall: 4 },
  { id: 'scatter', label: '散射', hall: 4 },
  { id: 'paralyze', label: '麻痹', hall: 4 },
  { id: 'double', label: '双射', hall: 5 },
  { id: 'triple', label: '三射', hall: 5 },
  { id: 'split', label: '分裂', hall: 5 },
  { id: 'explode', label: '爆炸', hall: 5 },
  { id: 'lightning', label: '雷电', hall: 5 },
]

export function emptyCodex(): CodexState {
  return { affixes: [], procs: [], bases: ['pistol'] }
}

export function unlockedAffixIds(level: number): Array<AffixRoll['id']> {
  return AFFIX_CATALOG.filter((entry) => entry.hall <= level).map((entry) => entry.id)
}

export function unlockedProcIds(level: number): WeaponProc[] {
  return PROC_CATALOG.filter((entry) => entry.hall <= level).map((entry) => entry.id)
}

export function hallPoolFor(world: WorldState): { level: number; affixes: Array<AffixRoll['id']>; procs: WeaponProc[] } {
  const level = hallLevel(world)
  return { level, affixes: unlockedAffixIds(level), procs: unlockedProcIds(level) }
}

export function unlocksAtHall(level: number): { affixes: string[]; procs: string[] } {
  return {
    affixes: AFFIX_CATALOG.filter((entry) => entry.hall === level).map((entry) => entry.label),
    procs: PROC_CATALOG.filter((entry) => entry.hall === level).map((entry) => entry.label),
  }
}

export function noteGear(world: WorldState, piece: GearPiece | undefined): void {
  if (!piece) return
  if (!world.codex) world.codex = emptyCodex()
  const book = world.codex
  if (!book.bases.includes(piece.baseId)) book.bases.push(piece.baseId)
  for (const affix of piece.affixes) {
    if (!book.affixes.includes(affix.id)) book.affixes.push(affix.id)
  }
  for (const proc of piece.procs) {
    if (!book.procs.includes(proc)) book.procs.push(proc)
  }
}

export function weaponBaseCatalog(): Array<{ id: string; label: string }> {
  return WEAPONS.map((gun) => ({ id: gun.id, label: gun.label }))
}
