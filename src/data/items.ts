import type { InventoryState } from '@/simulation/types'

export const RAW_FOOD = ['raw_meat', 'raw_fish', 'berry'] as const
export type RawFoodId = (typeof RAW_FOOD)[number]

export const ITEM_LABELS: Record<string, string> = {
  wood: '木',
  scrap: '废铁',
  ammo: '弹药',
  raw_meat: '生肉',
  raw_fish: '生鱼',
  berry: '果子',
  meal: '熟食',
  water: '开水',
  raw_water: '生水',
  jacket: '外套',
  work_cap: '工帽',
  boots: '靴子',
  pistol: '手枪',
  cloth_hat: '布帽',
  hood: '兜帽',
  raincoat: '雨衣',
  work_clothes: '工装',
  hauler_vest: '搬运背心',
  work_gloves: '手套',
  rifle: '步枪',
  hunting_knife: '猎刀',
  rod: '鱼竿',
  crowbar: '撬棍',
  hammer: '锤子',
}

export const WORK_XP: Record<string, number> = {
  hunt: 6,
  fish: 4,
  gather: 3,
  scavenge: 3,
  cook: 5,
  repair: 4,
  draw: 3,
  upgrade: 6,
}

const PLUS_MARK = /^(.*)\+(\d+)$/

export function itemBase(id: string): string {
  return id.match(PLUS_MARK)?.[1] ?? id
}

export function itemPlus(id: string): number {
  const match = id.match(PLUS_MARK)
  return match ? Number(match[2]) : 0
}

export function withPlus(id: string, plus: number): string {
  const base = itemBase(id)
  return plus > 0 ? `${base}+${plus}` : base
}

export function itemLabel(id: string): string {
  const plus = itemPlus(id)
  const name = ITEM_LABELS[itemBase(id)] ?? itemBase(id)
  return plus > 0 ? `${name} +${plus}` : name
}

export function isRawFood(id: string): id is RawFoodId {
  return (RAW_FOOD as readonly string[]).includes(id)
}

export function countRawFood(inventory: InventoryState): number {
  return inventory.items.reduce((sum, item) => (isRawFood(item.itemId) ? sum + item.count : sum), 0)
}

export function firstRawFood(inventory: InventoryState): RawFoodId | null {
  for (const id of RAW_FOOD) {
    if (inventory.items.some((item) => item.itemId === id && item.count > 0)) return id
  }
  return null
}
