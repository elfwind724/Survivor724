import { defaultAttributes, emptyEnhance, emptyLoadout } from '@/data/equipment'
import { seedSkills } from '@/data/skills'
import { cloneVec3, type EnhanceLoadout, type EquipmentLoadout, type SkillId, type SkillState, type SurvivorAttributes, type SurvivorState, type Vec3 } from '@/simulation/types'

type SurvivorDraft = Omit<
  SurvivorState,
  | 'destination'
  | 'homePosition'
  | 'workElapsed'
  | 'carriedTools'
  | 'returnFill'
  | 'blockedReason'
  | 'path'
  | 'pathTarget'
  | 'pathVersion'
  | 'facingYaw'
  | 'ammo'
  | 'weaponAmmo'
  | 'fireCooldown'
  | 'fireCooldownMax'
  | 'nightPostId'
  | 'watchPostId'
  | 'indoorId'
  | 'downed'
  | 'level'
  | 'xp'
  | 'attrPoints'
  | 'spendOwnPoints'
  | 'hunger'
  | 'thirst'
  | 'attributes'
  | 'equipment'
  | 'enhance'
  | 'lastYieldItem'
  | 'lastYieldCount'
  | 'lastYieldXp'
  | 'lastYieldAt'
  | 'skills'
> & {
  destination?: Vec3 | null
  homePosition?: Vec3
  workElapsed?: number
  carriedTools?: string[]
  returnFill?: number
  blockedReason?: SurvivorState['blockedReason']
  path?: Vec3[]
  pathTarget?: Vec3 | null
  pathVersion?: number
  facingYaw?: number
  ammo?: number
  weaponAmmo?: Record<string, number>
  fireCooldown?: number
  fireCooldownMax?: number
  nightPostId?: string | null
  watchPostId?: string | null
  indoorId?: string | null
  downed?: boolean
  level?: number
  xp?: number
  attrPoints?: number
  spendOwnPoints?: boolean
  hunger?: number
  thirst?: number
  attributes?: SurvivorAttributes
  equipment?: EquipmentLoadout
  enhance?: EnhanceLoadout
  lastYieldItem?: string | null
  lastYieldCount?: number
  lastYieldXp?: number
  lastYieldAt?: number
  skills?: Record<SkillId, SkillState>
}

export function createSurvivor(input: SurvivorDraft): SurvivorState {
  return {
    ...input,
    position: cloneVec3(input.position),
    destination: input.destination ? cloneVec3(input.destination) : null,
    homePosition: cloneVec3(input.homePosition ?? input.position),
    workElapsed: input.workElapsed ?? 0,
    carriedTools: [...(input.carriedTools ?? [])],
    returnFill: input.returnFill ?? 1,
    blockedReason: input.blockedReason ?? null,
    path: (input.path ?? []).map((point) => cloneVec3(point)),
    pathTarget: input.pathTarget ? cloneVec3(input.pathTarget) : null,
    pathVersion: input.pathVersion ?? 0,
    facingYaw: input.facingYaw ?? 0,
    ammo: input.ammo ?? 18,
    weaponAmmo: { ...(input.weaponAmmo ?? {}) },
    fireCooldown: input.fireCooldown ?? 0,
    fireCooldownMax: input.fireCooldownMax ?? 0,
    nightPostId: input.nightPostId ?? null,
    watchPostId: input.watchPostId ?? null,
    indoorId: input.indoorId ?? null,
    downed: input.downed ?? false,
    level: input.level ?? 1,
    xp: input.xp ?? 0,
    attrPoints: input.attrPoints ?? 0,
    spendOwnPoints: input.spendOwnPoints ?? false,
    hunger: input.hunger ?? 80,
    thirst: input.thirst ?? 80,
    attributes: input.attributes ?? defaultAttributes(input.professionId),
    equipment: input.equipment ?? emptyLoadout(),
    enhance: input.enhance ?? emptyEnhance(),
    lastYieldItem: input.lastYieldItem ?? null,
    lastYieldCount: input.lastYieldCount ?? 0,
    lastYieldXp: input.lastYieldXp ?? 0,
    lastYieldAt: input.lastYieldAt ?? 0,
    skills: input.skills ?? seedSkills(input.professionId),
  }
}

export function moveToward(survivor: SurvivorState, dt: number): boolean {
  const destination = survivor.destination
  if (!destination) return false

  const dx = destination.x - survivor.position.x
  const dz = destination.z - survivor.position.z
  const distance = Math.hypot(dx, dz)
  const step = survivor.moveSpeed * dt
  if (distance <= step || distance === 0) {
    survivor.position.x = destination.x
    survivor.position.z = destination.z
    return true
  }

  survivor.facingYaw = Math.atan2(dx, dz)
  survivor.position.x += (dx / distance) * step
  survivor.position.z += (dz / distance) * step
  return false
}
