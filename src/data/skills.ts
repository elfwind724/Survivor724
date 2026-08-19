import type { SkillId, SkillState, SurvivorState } from '@/simulation/types'

export interface SkillDef {
  id: SkillId
  label: string
  group: 'profession' | 'combat' | 'survival'
  hint: string
}

export const SKILL_IDS: readonly SkillId[] = [
  'hunt',
  'fish',
  'gather',
  'cook',
  'scavenge',
  'build',
  'haul',
  'marksmanship',
  'combat',
  'survival',
]

export const SKILL_DEFS: readonly SkillDef[] = [
  { id: 'hunt', label: '狩猎', group: 'profession', hint: '追踪野兽，剥出生肉、兽皮和骨料' },
  { id: 'fish', label: '钓鱼', group: 'profession', hint: '河边下竿，捞出生鱼' },
  { id: 'gather', label: '采集', group: 'profession', hint: '灌木丛里摘果子' },
  { id: 'cook', label: '厨艺', group: 'profession', hint: '把生料做成熟食' },
  { id: 'scavenge', label: '搜刮', group: 'profession', hint: '废墟里翻废铁和零件' },
  { id: 'build', label: '工艺', group: 'profession', hint: '建造、拆除、修墙' },
  { id: 'haul', label: '负重', group: 'profession', hint: '搬运材料和成品' },
  { id: 'marksmanship', label: '射击', group: 'combat', hint: '枪伤、射程、散布' },
  { id: 'combat', label: '战斗', group: 'combat', hint: '挨打、近战、守夜' },
  { id: 'survival', label: '生存', group: 'survival', hint: '挨饿、口渴、野外消耗' },
]

export const PROFESSION_SKILLS: Record<string, readonly SkillId[]> = {
  hunter: ['hunt', 'marksmanship', 'combat', 'survival'],
  fisher: ['fish', 'gather', 'survival'],
  scavenger: ['scavenge', 'haul', 'survival'],
  hauler: ['haul', 'build', 'survival'],
  builder: ['build', 'haul', 'survival'],
}

const PROFESSION_START: Record<string, Partial<Record<SkillId, number>>> = {
  hunter: { hunt: 2, marksmanship: 2, combat: 2, survival: 2 },
  fisher: { fish: 2, gather: 2, survival: 2 },
  scavenger: { scavenge: 2, haul: 2, survival: 1 },
  hauler: { haul: 2, build: 1, survival: 1 },
  builder: { build: 2, haul: 1, survival: 1 },
}

const JOB_SKILL: Record<string, SkillId> = {
  hunt: 'hunt',
  fish: 'fish',
  gather: 'gather',
  draw: 'gather',
  cook: 'cook',
  scavenge: 'scavenge',
  build: 'build',
  demolish: 'build',
  repair: 'build',
  upgrade: 'build',
  haul: 'haul',
}

export function skillDef(id: SkillId): SkillDef {
  return SKILL_DEFS.find((entry) => entry.id === id) ?? SKILL_DEFS[0]!
}

export function skillXpToNext(level: number): number {
  return 20 + level * 12
}

export function seedSkills(professionId: string): Record<SkillId, SkillState> {
  const start = PROFESSION_START[professionId] ?? {}
  const skills = {} as Record<SkillId, SkillState>
  for (const id of SKILL_IDS) {
    skills[id] = { level: start[id] ?? 1, xp: 0 }
  }
  return skills
}

export function ensureSkills(survivor: SurvivorState): Record<SkillId, SkillState> {
  if (survivor.skills && survivor.skills.hunt && survivor.skills.survival) return survivor.skills
  survivor.skills = seedSkills(survivor.professionId)
  return survivor.skills
}

export function skillLevel(survivor: SurvivorState, id: SkillId): number {
  return Math.max(1, ensureSkills(survivor)[id]?.level ?? 1)
}

export function skillForJob(jobId: string): SkillId | null {
  return JOB_SKILL[jobId] ?? null
}

export function professionSkills(professionId: string): readonly SkillId[] {
  return PROFESSION_SKILLS[professionId] ?? ['survival']
}

export function isMainSkill(professionId: string, id: SkillId): boolean {
  return professionSkills(professionId).includes(id)
}

export function skillWorkMult(survivor: SurvivorState, jobId: string): number {
  const id = skillForJob(jobId)
  if (!id) return 1
  return 1 + (skillLevel(survivor, id) - 1) * (id === 'build' ? 0.06 : 0.045)
}

export function skillYieldChance(survivor: SurvivorState, id: SkillId): number {
  return Math.min(0.75, (skillLevel(survivor, id) - 1) * 0.08)
}

export function extraYieldCount(survivor: SurvivorState, id: SkillId, seed: string): number {
  const chance = skillYieldChance(survivor, id)
  if (chance <= 0) return 0
  return hash01(`${survivor.id}:${id}:${seed}`) < chance ? 1 : 0
}

export function skillDamageMult(survivor: SurvivorState): number {
  return 1 + (skillLevel(survivor, 'marksmanship') - 1) * 0.03
}

export function skillSpreadMult(survivor: SurvivorState): number {
  return Math.max(0.55, 1 - (skillLevel(survivor, 'marksmanship') - 1) * 0.02)
}

export function skillRangeMult(survivor: SurvivorState): number {
  return 1 + (skillLevel(survivor, 'marksmanship') - 1) * 0.02
}

export function skillDefenseBonus(survivor: SurvivorState): number {
  return skillLevel(survivor, 'combat') - 1
}

export function skillHungerMult(survivor: SurvivorState): number {
  return Math.max(0.55, 1 - (skillLevel(survivor, 'survival') - 1) * 0.03)
}

export function skillEffectLines(survivor: SurvivorState, id: SkillId): string[] {
  const level = skillLevel(survivor, id)
  const rank = level - 1
  if (id === 'hunt') return [`剥皮多肉 +${Math.round(rank * 8)}%`, '命中野兽后可剥生肉']
  if (id === 'fish') return [`出鱼加成 +${Math.round(rank * 8)}%`, `下竿速度 +${Math.round(rank * 4.5)}%`]
  if (id === 'gather') return [`摘果加成 +${Math.round(rank * 8)}%`, `采集速度 +${Math.round(rank * 4.5)}%`]
  if (id === 'cook') return [`出餐加成 +${Math.round(rank * 8)}%`, `做饭速度 +${Math.round(rank * 4.5)}%`]
  if (id === 'scavenge') return [`搜刮加成 +${Math.round(rank * 8)}%`, `翻找速度 +${Math.round(rank * 4.5)}%`]
  if (id === 'build') return [`施工速度 +${Math.round(rank * 6)}%`, '建造、拆除、修墙都吃这档']
  if (id === 'haul') return [`搬运速度 +${Math.round(rank * 4.5)}%`, '来回扛材料更快']
  if (id === 'marksmanship') return [`枪伤 +${Math.round(rank * 3)}%`, `射程 +${Math.round(rank * 2)}% · 散布 -${Math.round(rank * 2)}%`]
  if (id === 'combat') return [`防御 +${rank}`, '守夜和挨打更抗揍']
  return [`饥饿口渴消耗 -${Math.round(rank * 3)}%`, '野外过夜少掉状态']
}

export function skillSummary(survivor: SurvivorState): string {
  const mains = professionSkills(survivor.professionId).map((id) => `${skillDef(id).label}Lv${skillLevel(survivor, id)}`)
  return mains.join(' · ')
}

function hash01(seed: string): number {
  let hash = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return ((hash >>> 0) % 10_000) / 10_000
}
