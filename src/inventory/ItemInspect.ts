import { equipmentById, statsOf } from '@/data/equipment'
import { itemLabel } from '@/data/items'
import { affixText, findGear, previewFire, procLabel, RARITY_LABEL } from '@/data/loot'
import { BANDAGE_HEAL } from '@/inventory/Pack'
import { MEAL_HUNGER, MEAL_THIRST, RAW_HUNGER, WATER_THIRST } from '@/survivors/Living'
import type { SurvivorState, WorldState } from '@/simulation/types'
import { weaponById } from '@/data/weapons'

export interface ItemInspect {
  title: string
  rarity: string | null
  lines: string[]
  hint: string
}

export function inspectItem(world: WorldState, survivor: SurvivorState, itemId: string): ItemInspect {
  if (!itemId) {
    return { title: '空格', rarity: null, lines: ['没有东西'], hint: '把背包物品点到这里' }
  }
  const piece = findGear(world, itemId)
  const item = equipmentById(itemId, world)
  const gun = weaponById(itemId)
  const title = piece ? piece.name : item?.label ?? itemLabel(itemId)
  const rarity = piece ? RARITY_LABEL[piece.rarity] : null
  const lines: string[] = []
  if (rarity) lines.push(rarity)
  if (gun) {
    const fire = previewFire(world, survivor, itemId)
    lines.push(`攻击 ${Math.round(fire.minDamage)}-${Math.round(fire.maxDamage)}`)
    lines.push(`攻速 ${(1 / Math.max(0.08, fire.cooldown)).toFixed(2)}/秒 · 射程 ${fire.range.toFixed(0)}米`)
    lines.push(`暴击 ${(fire.critChance * 100).toFixed(0)}% · 暴伤 ×${fire.critDamage.toFixed(2)}`)
    if (piece) {
      for (const affix of piece.affixes) lines.push(affixText(affix))
      for (const proc of piece.procs) lines.push(procLabel(proc))
    }
  } else if (itemId === 'meal') {
    lines.push(`熟食 · 饥饿 +${MEAL_HUNGER} 口渴 +${MEAL_THIRST}`)
  } else if (itemId === 'bandage') {
    const max = statsOf(survivor, world).maxHealth
    lines.push(`包扎 · 回复 ${BANDAGE_HEAL} 血（上限 ${Math.round(max)}）`)
  } else if (itemId === 'raw_meat' || itemId === 'raw_fish') {
    lines.push(`生食 · 饥饿 +${RAW_HUNGER}`)
  } else if (itemId === 'berry') {
    lines.push('果子 · 稍微垫饥')
  } else if (itemId === 'water') {
    lines.push(`开水 · 口渴 +${WATER_THIRST}`)
  } else if (itemId === 'ammo') {
    lines.push('弹药 · 按 R 往枪里装')
  } else if (item) {
    lines.push(item.slot === 'tool' ? '工具' : item.label)
  }
  return {
    title,
    rarity,
    lines: lines.length > 0 ? lines : [itemLabel(itemId)],
    hint: 'E 使用 · 右键丢弃 · F 拆解',
  }
}

export function inspectHtml(info: ItemInspect): string {
  const rare = info.rarity ? `<em>${escapeTip(info.rarity)}</em>` : ''
  const lines = info.lines.map((line) => `<li>${escapeTip(line)}</li>`).join('')
  return `<div class="item-tip"><strong>${escapeTip(info.title)}</strong>${rare}<ul>${lines}</ul><small>${escapeTip(info.hint)}</small></div>`
}

function escapeTip(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
