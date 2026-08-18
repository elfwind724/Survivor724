import { itemBase, itemPlus } from '@/data/items'
import type { EnhanceLoadout, EquipSlot, EquipmentLoadout, SurvivorAttributes } from '@/simulation/types'

export interface EquipItemDef {
  id: string
  label: string
  slot: EquipSlot
  bonuses: Partial<SurvivorAttributes>
}

export const EQUIP_SLOTS: Array<{ id: EquipSlot; label: string }> = [
  { id: 'hat', label: '帽子' },
  { id: 'clothes', label: '衣服' },
  { id: 'gloves', label: '手套' },
  { id: 'shoes', label: '鞋子' },
  { id: 'weapon', label: '武器' },
  { id: 'tool', label: '工具' },
]

export const EQUIPMENT: readonly EquipItemDef[] = [
  { id: 'cloth_hat', label: '布帽', slot: 'hat', bonuses: { constitution: 1 } },
  { id: 'work_cap', label: '工帽', slot: 'hat', bonuses: { intelligence: 1 } },
  { id: 'hood', label: '兜帽', slot: 'hat', bonuses: { agility: 1 } },
  { id: 'jacket', label: '外套', slot: 'clothes', bonuses: { constitution: 2 } },
  { id: 'raincoat', label: '雨衣', slot: 'clothes', bonuses: { constitution: 1, intelligence: 1 } },
  { id: 'work_clothes', label: '工装', slot: 'clothes', bonuses: { strength: 1, intelligence: 1 } },
  { id: 'hauler_vest', label: '搬运背心', slot: 'clothes', bonuses: { strength: 2 } },
  { id: 'work_gloves', label: '手套', slot: 'gloves', bonuses: { agility: 1 } },
  { id: 'boots', label: '靴子', slot: 'shoes', bonuses: { agility: 1, constitution: 1 } },
  { id: 'rifle', label: '步枪', slot: 'weapon', bonuses: { strength: 3 } },
  { id: 'pistol', label: '手枪', slot: 'weapon', bonuses: { agility: 2 } },
  { id: 'revolver', label: '左轮', slot: 'weapon', bonuses: { strength: 2, agility: 1 } },
  { id: 'smg', label: '冲锋枪', slot: 'weapon', bonuses: { agility: 3 } },
  { id: 'shotgun', label: '霰弹枪', slot: 'weapon', bonuses: { strength: 2, constitution: 1 } },
  { id: 'sniper', label: '狙击枪', slot: 'weapon', bonuses: { strength: 2, intelligence: 1 } },
  { id: 'hunting_knife', label: '猎刀', slot: 'tool', bonuses: { strength: 1 } },
  { id: 'rod', label: '鱼竿', slot: 'tool', bonuses: { intelligence: 1 } },
  { id: 'crowbar', label: '撬棍', slot: 'tool', bonuses: { strength: 2 } },
  { id: 'hammer', label: '锤子', slot: 'tool', bonuses: { intelligence: 2 } },
]

export const PROFESSION_STATS: Record<string, SurvivorAttributes> = {
  hunter: { strength: 12, agility: 14, constitution: 10, intelligence: 8 },
  fisher: { strength: 10, agility: 11, constitution: 12, intelligence: 9 },
  scavenger: { strength: 9, agility: 13, constitution: 11, intelligence: 10 },
  hauler: { strength: 14, agility: 8, constitution: 13, intelligence: 7 },
  builder: { strength: 11, agility: 9, constitution: 12, intelligence: 13 },
}

export const PROFESSION_CLOTHES: Record<string, Partial<EquipmentLoadout>> = {
  hunter: { hat: 'cloth_hat', clothes: 'jacket', gloves: 'work_gloves', shoes: 'boots' },
  fisher: { hat: 'cloth_hat', clothes: 'raincoat', gloves: 'work_gloves', shoes: 'boots' },
  scavenger: { hat: 'hood', clothes: 'jacket', gloves: 'work_gloves', shoes: 'boots' },
  hauler: { hat: 'work_cap', clothes: 'hauler_vest', gloves: 'work_gloves', shoes: 'boots' },
  builder: { hat: 'work_cap', clothes: 'work_clothes', gloves: 'work_gloves', shoes: 'boots' },
}

export function emptyLoadout(): EquipmentLoadout {
  return { hat: null, clothes: null, gloves: null, shoes: null, weapon: null, tool: null }
}

export function emptyEnhance(): EnhanceLoadout {
  return { hat: 0, clothes: 0, gloves: 0, shoes: 0, weapon: 0, tool: 0 }
}

export function equipmentById(id: string, world?: { gear?: Record<string, { name: string; slot: EquipSlot; plus: number; baseId: string; affixes: Array<{ id: string; value: number }> }> }): EquipItemDef | undefined {
  const piece = world?.gear?.[id]
  if (piece) {
    const bonuses: Partial<SurvivorAttributes> = {}
    for (const affix of piece.affixes) {
      if (affix.id === 'str') bonuses.strength = (bonuses.strength ?? 0) + affix.value
      if (affix.id === 'agi') bonuses.agility = (bonuses.agility ?? 0) + affix.value
      if (affix.id === 'con') bonuses.constitution = (bonuses.constitution ?? 0) + affix.value
      if (affix.id === 'int') bonuses.intelligence = (bonuses.intelligence ?? 0) + affix.value
    }
    const def = EQUIPMENT.find((entry) => entry.id === piece.baseId)
    return {
      id,
      label: piece.plus > 0 ? `${piece.name} +${piece.plus}` : piece.name,
      slot: piece.slot,
      bonuses: scaleBonuses({ ...def?.bonuses, ...bonuses }, piece.plus),
    }
  }
  const base = itemBase(id)
  const plus = itemPlus(id)
  const def = EQUIPMENT.find((entry) => entry.id === base)
  if (!def) return undefined
  return {
    id,
    label: plus > 0 ? `${def.label} +${plus}` : def.label,
    slot: def.slot,
    bonuses: scaleBonuses(def.bonuses, plus),
  }
}

export function scaleBonuses(bonuses: Partial<SurvivorAttributes>, plus: number): Partial<SurvivorAttributes> {
  if (plus <= 0) return { ...bonuses }
  const bump = Math.ceil(plus / 2)
  const next: Partial<SurvivorAttributes> = {}
  if (bonuses.strength) next.strength = bonuses.strength + bump
  else if (plus >= 2) next.strength = Math.floor(plus / 2)
  if (bonuses.agility) next.agility = bonuses.agility + bump
  if (bonuses.constitution) next.constitution = bonuses.constitution + bump
  if (bonuses.intelligence) next.intelligence = bonuses.intelligence + bump
  return next
}

export function defaultAttributes(professionId: string): SurvivorAttributes {
  return { ...(PROFESSION_STATS[professionId] ?? { strength: 10, agility: 10, constitution: 10, intelligence: 10 }) }
}

export function totalAttributes(
  base: SurvivorAttributes,
  loadout: EquipmentLoadout,
  enhance: EnhanceLoadout = emptyEnhance(),
): SurvivorAttributes {
  const total = { ...base }
  for (const slot of EQUIP_SLOTS) {
    const id = loadout[slot.id]
    if (!id) continue
    const plus = Math.max(enhance[slot.id] ?? 0, itemPlus(id))
    const item = equipmentById(withDisplayId(id, plus))
    if (!item) continue
    total.strength += item.bonuses.strength ?? 0
    total.agility += item.bonuses.agility ?? 0
    total.constitution += item.bonuses.constitution ?? 0
    total.intelligence += item.bonuses.intelligence ?? 0
  }
  return total
}

function withDisplayId(id: string, plus: number): string {
  const extra = plus > itemPlus(id) ? plus : itemPlus(id)
  return extra > 0 ? `${itemBase(id)}+${extra}` : itemBase(id)
}

export function statsOf(
  survivor: {
    attributes: SurvivorAttributes
    equipment: EquipmentLoadout
    enhance?: EnhanceLoadout
  },
  world?: { gear?: Record<string, { name: string; slot: EquipSlot; plus: number; baseId: string; affixes: Array<{ id: string; value: number }> }> },
) {
  const stats = derivedStats(survivor.attributes, survivor.equipment, survivor.enhance ?? emptyEnhance())
  if (!world?.gear) return stats
  for (const slot of EQUIP_SLOTS) {
    const id = survivor.equipment[slot.id]
    if (!id) continue
    const piece = world.gear[id]
    if (!piece) continue
    for (const affix of piece.affixes) {
      if (affix.id === 'str') stats.total.strength += affix.value
      if (affix.id === 'agi') stats.total.agility += affix.value
      if (affix.id === 'con') stats.total.constitution += affix.value
      if (affix.id === 'int') stats.total.intelligence += affix.value
    }
  }
  return stats
}

export function derivedStats(
  base: SurvivorAttributes,
  loadout: EquipmentLoadout,
  enhance: EnhanceLoadout = emptyEnhance(),
) {
  const total = totalAttributes(base, loadout, enhance)
  return {
    total,
    attackPower: Math.round(10 + total.strength * 2),
    attackCooldown: Math.max(0.28, 0.72 - total.agility * 0.018),
    moveSpeed: 5.4 + total.agility * 0.14,
    maxHealth: 70 + total.constitution * 5,
    defense: Math.round(total.constitution * 0.7),
    workRate: 1 + total.intelligence * 0.035,
  }
}
