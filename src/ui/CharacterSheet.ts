import { EQUIP_SLOTS, equipmentById, statsOf } from '@/data/equipment'
import { enhanceChance, enhanceCost, ENHANCE_MAX, combatRating, spendAttr, tryEnhance, wornPlus } from '@/survivors/Enhance'
import {
  ensureSkills,
  professionSkills,
  SKILL_DEFS,
  skillDef,
  skillEffectLines,
  skillLevel,
  skillSummary,
  skillXpToNext,
} from '@/data/skills'
import { itemLabel } from '@/data/items'
import { fireProfile, INFINITE_AMMO, magazineSize, weaponById } from '@/data/weapons'
import { availableForSlot, equipItem, unequipSlot } from '@/survivors/Equipment'
import { xpToNext } from '@/survivors/Progress'
import { findSurvivor } from '@/simulation/EntityRegistry'
import type { EquipSlot, SkillId, SurvivorState, WorldState } from '@/simulation/types'
import { assignmentLabel } from '@/jobs/Roster'
import { survivorPortrait } from './GameHud'

const JOB_LABEL: Record<string, string> = {
  hunter: '猎手',
  fisher: '渔手',
  scavenger: '搜刮',
  hauler: '搬运',
  builder: '工匠',
}

type SheetTab = 'stats' | 'skills' | 'gear'

export class CharacterSheet {
  private openId: string | null = null
  private pickSlot: EquipSlot | null = null
  private tab: SheetTab = 'skills'
  private lastKey = ''

  constructor(private readonly root: HTMLElement) {
    this.root.classList.add('sheet-root')
    this.root.addEventListener('pointerdown', (event) => event.stopPropagation())
  }

  isOpen(): boolean {
    return this.openId !== null
  }

  open(id: string, tab: SheetTab = 'skills'): void {
    this.openId = id
    this.tab = tab
    this.pickSlot = null
    this.lastKey = ''
  }

  close(): void {
    this.openId = null
    this.pickSlot = null
    this.lastKey = ''
    this.root.innerHTML = ''
  }

  render(world: WorldState): void {
    if (!this.openId) {
      if (this.root.innerHTML) this.root.innerHTML = ''
      return
    }
    const survivor = findSurvivor(world, this.openId)
    if (!survivor) {
      this.close()
      return
    }
    const key = sheetKey(world, survivor, this.pickSlot, this.tab)
    if (key === this.lastKey) return
    this.lastKey = key
    this.root.innerHTML = renderSheet(world, survivor, this.pickSlot, this.tab)
    this.bind(world, survivor)
  }

  private bind(world: WorldState, survivor: SurvivorState): void {
    this.root.querySelector('[data-close]')?.addEventListener('click', () => this.close())
    this.root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        const next = button.dataset.tab
        if (next === 'stats' || next === 'skills' || next === 'gear') this.tab = next
        this.pickSlot = null
        this.lastKey = ''
        this.render(world)
      })
    })
    this.root.querySelectorAll<HTMLButtonElement>('[data-slot]').forEach((button) => {
      button.addEventListener('click', () => {
        const slot = button.dataset.slot as EquipSlot
        this.pickSlot = this.pickSlot === slot ? null : slot
        this.lastKey = ''
        this.render(world)
      })
    })
    this.root.querySelectorAll<HTMLButtonElement>('[data-equip]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.equip
        if (id) equipItem(world, survivor, id)
        this.pickSlot = null
        this.lastKey = ''
        this.render(world)
      })
    })
    this.root.querySelector('[data-unequip]')?.addEventListener('click', () => {
      if (this.pickSlot) unequipSlot(world, survivor, this.pickSlot)
      this.pickSlot = null
      this.lastKey = ''
      this.render(world)
    })
    this.root.querySelectorAll<HTMLButtonElement>('[data-stat]').forEach((button) => {
      button.addEventListener('click', () => {
        const key = button.dataset.stat
        if (key === 'strength' || key === 'agility' || key === 'constitution' || key === 'intelligence') {
          spendAttr(survivor, key)
        }
        this.lastKey = ''
        this.render(world)
      })
    })
    this.root.querySelectorAll<HTMLButtonElement>('[data-enhance]').forEach((button) => {
      button.addEventListener('click', () => {
        const slot = button.dataset.enhance as EquipSlot
        const result = tryEnhance(world, survivor, slot)
        this.lastKey = ''
        this.render(world)
        const notice = button.parentElement?.querySelector('[data-enhance-note]')
        if (notice) notice.textContent = enhanceNote(result)
      })
    })
  }
}

function sheetKey(world: WorldState, survivor: SurvivorState, pick: EquipSlot | null, tab: SheetTab): string {
  const stats = statsOf(survivor)
  const fire = fireProfile(survivor)
  const skills = ensureSkills(survivor)
  return [
    survivor.id,
    tab,
    pick ?? '-',
    survivor.health,
    survivor.level,
    survivor.xp,
    survivor.attrPoints,
    Object.values(survivor.enhance ?? {}).join(','),
    survivor.ammo,
    survivor.lastYieldItem ?? '',
    survivor.lastYieldCount,
    survivor.lastYieldXp,
    survivor.moveSpeed.toFixed(2),
    Object.values(survivor.equipment).join(','),
    SKILL_DEFS.map((entry) => `${entry.id}:${skills[entry.id]?.level}:${skills[entry.id]?.xp}`).join(','),
    `${stats.total.strength}/${stats.total.agility}/${stats.total.constitution}/${stats.total.intelligence}`,
    `${fire.weapon?.id ?? '-'}:${fire.damage}:${fire.cooldown.toFixed(2)}:${fire.range.toFixed(1)}`,
    world.inventories['inv-warehouse']?.items.map((item) => `${item.itemId}:${item.count}`).join(',') ?? '',
    world.inventories['inv-locker']?.items.map((item) => `${item.itemId}:${item.count}`).join(',') ?? '',
  ].join('|')
}

function renderSheet(world: WorldState, survivor: SurvivorState, pick: EquipSlot | null, tab: SheetTab): string {
  const next = xpToNext(survivor.level)
  const role = survivor.id === world.player.heroId ? '玩家技能' : 'NPC技能'
  const job = JOB_LABEL[survivor.professionId] ?? survivor.professionId
  const post = assignmentLabel(survivor, world.player.heroId)
  const tabs = (
    [
      ['skills', '技能'],
      ['stats', '概况'],
      ['gear', '装备'],
    ] as const
  )
    .map(([id, label]) => `<button type="button" class="sheet-tab${tab === id ? ' is-on' : ''}" data-tab="${id}">${label}</button>`)
    .join('')
  const body = tab === 'skills'
    ? renderSkillTab(world, survivor)
    : tab === 'stats'
      ? renderStatsTab(survivor)
      : renderGearTab(world, survivor, pick)
  return `
    <div class="sheet">
      <header class="sheet-head">
        <strong>${escapeHtml(survivor.name)}</strong>
        <span>${role} · ${job} · ${escapeHtml(post)} · ${survivor.level}级</span>
        <button type="button" data-close>关闭</button>
      </header>
      <div class="sheet-tabs">${tabs}</div>
      <div class="sheet-level">
        <div><strong>人物 ${survivor.level} 级</strong><small>${Math.floor(survivor.xp)}/${next} 经验 · 战力 ${combatRating(survivor)}</small></div>
        <i><b style="width:${Math.max(4, Math.min(100, (survivor.xp / next) * 100))}%"></b></i>
      </div>
      ${body}
    </div>
  `
}

function renderSkillTab(world: WorldState, survivor: SurvivorState): string {
  const skills = ensureSkills(survivor)
  const mains = professionSkills(survivor.professionId)
  const recent = survivor.lastYieldCount > 0 && survivor.lastYieldItem
    ? `<p class="sheet-yield">最近产出 +${survivor.lastYieldCount} ${itemLabel(survivor.lastYieldItem)} · 职业经验 +${survivor.lastYieldXp}</p>`
    : ''
  const cards = SKILL_DEFS.map((def) => renderSkillCard(survivor, def.id, skills[def.id], mains.includes(def.id))).join('')
  return `<div class="sheet-skills">
    <p class="sheet-role">${survivor.id === world.player.heroId ? '主角自己的技能' : '队员职业技能'} · 主修 ${skillSummary(survivor)}</p>
    ${recent}
    ${cards}
  </div>`
}

function renderSkillCard(survivor: SurvivorState, id: SkillId, skill: { level: number; xp: number } | undefined, main: boolean): string {
  const level = skill?.level ?? skillLevel(survivor, id)
  const xp = skill?.xp ?? 0
  const need = skillXpToNext(level)
  const width = Math.max(4, Math.min(100, (xp / need) * 100))
  const effects = skillEffectLines(survivor, id).map((line) => `<li>${escapeHtml(line)}</li>`).join('')
  const def = skillDef(id)
  return `<article class="sheet-skill${main ? ' is-main' : ''}">
    <header>
      <strong>${def.label}${main ? ' · 主修' : ''}</strong>
      <span>Lv${level}</span>
      <small>${Math.floor(xp)}/${need}</small>
    </header>
    <i><b style="width:${width}%"></b></i>
    <p>${escapeHtml(def.hint)}</p>
    <ul>${effects}</ul>
  </article>`
}

function renderStatsTab(survivor: SurvivorState): string {
  const stats = statsOf(survivor)
  const fire = fireProfile(survivor)
  const plus = wornPlus(survivor, 'weapon')
  const attrs = (
    [
      ['strength', '力量', stats.total.strength, survivor.attributes.strength, fire.weapon ? `枪伤 ${fire.damage}` : `徒手 ${stats.attackPower}`],
      ['agility', '敏捷', stats.total.agility, survivor.attributes.agility, `射速 ${fire.weapon ? fire.cooldown.toFixed(2) : stats.attackCooldown.toFixed(2)}秒 · 移速 ${stats.moveSpeed.toFixed(1)}`],
      ['constitution', '体质', stats.total.constitution, survivor.attributes.constitution, `生命 ${Math.ceil(survivor.health)}/${stats.maxHealth} · 防御 ${stats.defense + (skillLevel(survivor, 'combat') - 1)}`],
      ['intelligence', '智力', stats.total.intelligence, survivor.attributes.intelligence, `设施 ${stats.workRate.toFixed(2)}倍`],
    ] as const
  )
    .map(([key, label, total, base, detail]) => {
      const bonus = total - base
      const width = Math.max(6, Math.min(100, total * 5))
      const spend = survivor.attrPoints > 0
        ? `<button type="button" class="sheet-plus" data-stat="${key}">+</button>`
        : ''
      return `<div class="sheet-stat">
        <div><strong>${label} ${total}</strong><small>${bonus >= 0 ? `+${bonus}` : bonus} 基础${base}</small>${spend}</div>
        <i><b style="width:${width}%"></b></i>
        <span>${detail}</span>
      </div>`
    })
    .join('')
  return `<div class="sheet-stats-page">
    <p class="sheet-role">战力 ${combatRating(survivor)} · 可分配属性点 ${survivor.attrPoints}${survivor.spendOwnPoints ? ' · 自己点' : ' · 按职业自动加'}</p>
    ${attrs}
    ${renderFireCard(fire, survivor.ammo, plus)}
  </div>`
}

function renderGearTab(world: WorldState, survivor: SurvivorState, pick: EquipSlot | null): string {
  const slots = EQUIP_SLOTS.map((slot) => {
    const worn = survivor.equipment[slot.id]
    const plus = wornPlus(survivor, slot.id)
    const item = worn ? equipmentById(worn) : undefined
    const on = pick === slot.id ? ' is-on' : ''
    const name = item ? (plus > 0 ? `${item.label.replace(/ \+\d+$/, '')} +${plus}` : item.label) : '空'
    return `<button type="button" class="sheet-slot sheet-slot-${slot.id}${on}" data-slot="${slot.id}">
      <em>${slot.label}</em>
      <span class="${plus >= 7 ? 'is-plus-high' : plus > 0 ? 'is-plus' : ''}">${name}</span>
    </button>`
  }).join('')
  let picker = ''
  if (pick) {
    const options = availableForSlot(world, survivor, pick)
    const worn = survivor.equipment[pick]
    const list = options
      .map((item) => {
        const on = worn === item.id ? ' is-on' : ''
        const bonus = Object.entries(item.bonuses)
          .filter((entry) => entry[1])
          .map(([key, value]) => `${attrShort(key)}+${value}`)
          .join(' ')
        const gun = weaponById(item.id)
        const extra = gun ? `伤${gun.damage} 距${gun.range} ${gun.pellets > 1 ? `${gun.pellets}弹` : ''}` : bonus || '无加成'
        return `<button type="button" class="sheet-item${on}" data-equip="${item.id}">
          <strong>${item.label}</strong><span>${extra}</span>
        </button>`
      })
      .join('')
    picker = `<div class="sheet-picker">
      <header>选择${EQUIP_SLOTS.find((slot) => slot.id === pick)?.label ?? ''}</header>
      ${list || '<p>没有可换的装备</p>'}
      ${worn ? '<button type="button" class="sheet-unequip" data-unequip>卸下</button>' : ''}
    </div>`
  }
  return `<div class="sheet-body">
    <div class="sheet-doll">
      ${slots}
      <div class="sheet-avatar">${survivorPortrait(survivor)}</div>
    </div>
    <div class="sheet-stats">
      <p class="sheet-role">点格子换装。强化吃仓库废铁，+6 起有失败率，失败不掉级。</p>
      ${renderEnhance(world, survivor)}
      ${picker}
    </div>
  </div>`
}

function renderEnhance(world: WorldState, survivor: SurvivorState): string {
  const warehouse = world.inventories['inv-warehouse']
  const scrap = warehouse ? warehouse.items.find((item) => item.itemId === 'scrap')?.count ?? 0 : 0
  return EQUIP_SLOTS.map((slot) => {
    const worn = survivor.equipment[slot.id]
    if (!worn) return ''
    const plus = wornPlus(survivor, slot.id)
    const item = equipmentById(worn)
    const cost = enhanceCost(plus)
    const chance = Math.round(enhanceChance(plus) * 100)
    const maxed = plus >= ENHANCE_MAX
    return `<div class="sheet-enhance">
      <strong>${item?.label ?? slot.label} <em>+${plus}</em></strong>
      <span>${maxed ? '已满 +10' : `下一级 废铁${cost} · 成功率 ${chance}% · 库里 ${scrap}`}</span>
      ${maxed ? '' : `<button type="button" data-enhance="${slot.id}">强化 +${plus + 1}</button>`}
      <small data-enhance-note></small>
    </div>`
  }).join('')
}

function enhanceNote(result: ReturnType<typeof tryEnhance>): string {
  if (result === 'ok') return '强化成功'
  if (result === 'fail') return '强化失败，装备没掉级'
  if (result === 'max') return '已经 +10'
  if (result === 'no_scrap') return '仓库废铁不够'
  return '这一格是空的'
}

function renderFireCard(fire: ReturnType<typeof fireProfile>, ammo: number, plus = 0): string {
  if (!fire.weapon) {
    return `<div class="sheet-fire"><strong>未装备枪械</strong><span>去武器栏或工具柜换枪</span></div>`
  }
  const name = plus > 0 ? `${fire.weapon.label} +${plus}` : fire.weapon.label
  return `<div class="sheet-fire">
    <strong>${name}</strong>
    <span>弹药 ${INFINITE_AMMO ? '无限' : `${ammo}/${magazineSize(fire.weapon.id)}`} · ${fire.pellets > 1 ? `${fire.pellets}弹丸` : '单发'}</span>
    <ul>
      <li>伤害 ${fire.damage}</li>
      <li>间隔 ${fire.cooldown.toFixed(2)}秒</li>
      <li>射程 ${fire.range.toFixed(0)}米</li>
      <li>弹速 ${fire.speed.toFixed(0)}</li>
      <li>散布 ${(fire.spread * 100).toFixed(1)}</li>
    </ul>
  </div>`
}

function attrShort(key: string): string {
  if (key === 'strength') return '力'
  if (key === 'agility') return '敏'
  if (key === 'constitution') return '体'
  return '智'
}

export function inspectSheetHtml(world: WorldState, survivorId: string, tab: SheetTab = 'skills'): string {
  const survivor = findSurvivor(world, survivorId)
  if (!survivor) return ''
  return renderSheet(world, survivor, null, tab)
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    if (char === '&') return '&amp;'
    if (char === '<') return '&lt;'
    if (char === '>') return '&gt;'
    if (char === '"') return '&quot;'
    return '&#39;'
  })
}
