import type { EquipSlot, EquipmentLoadout, SurvivorAttributes } from '@/simulation/types'

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

export function equipmentById(id: string): EquipItemDef | undefined {
  return EQUIPMENT.find((entry) => entry.id === id)
}

export function defaultAttributes(professionId: string): SurvivorAttributes {
  return { ...(PROFESSION_STATS[professionId] ?? { strength: 10, agility: 10, constitution: 10, intelligence: 10 }) }
}

export function totalAttributes(base: SurvivorAttributes, loadout: EquipmentLoadout): SurvivorAttributes {
  const total = { ...base }
  for (const id of Object.values(loadout)) {
    if (!id) continue
    const item = equipmentById(id)
    if (!item) continue
    total.strength += item.bonuses.strength ?? 0
    total.agility += item.bonuses.agility ?? 0
    total.constitution += item.bonuses.constitution ?? 0
    total.intelligence += item.bonuses.intelligence ?? 0
  }
  return total
}

export function derivedStats(base: SurvivorAttributes, loadout: EquipmentLoadout) {
  const total = totalAttributes(base, loadout)
  return {
    total,
    attackPower: Math.round(10 + total.strength * 2),
    attackCooldown: Math.max(0.28, 0.72 - total.agility * 0.018),
    moveSpeed: 2.15 + total.agility * 0.08,
    maxHealth: 70 + total.constitution * 5,
    defense: Math.round(total.constitution * 0.7),
    workRate: 1 + total.intelligence * 0.035,
  }
}
