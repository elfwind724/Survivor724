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
import { affixText, compareFire, findGear, previewFire, primaryAffixes, procLabel, RARITY_LABEL, secondaryAffixes, weaponScore } from '@/data/loot'
import { fireProfile, INFINITE_AMMO, magazineSize } from '@/data/weapons'
import { availableForSlot, equipItem, unequipSlot } from '@/survivors/Equipment'
import { xpToNext } from '@/survivors/Progress'
import { findSurvivor } from '@/simulation/EntityRegistry'
import type { AffixRoll, EquipSlot, SkillId, SurvivorState, WeaponProc, WorldState } from '@/simulation/types'
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
  private compareId: string | null = null
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
    this.compareId = null
    this.lastKey = ''
  }

  close(): void {
    this.openId = null
    this.pickSlot = null
    this.compareId = null
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
    const key = sheetKey(world, survivor, this.pickSlot, this.tab, this.compareId)
    if (key === this.lastKey) return
    this.lastKey = key
    this.root.innerHTML = renderSheet(world, survivor, this.pickSlot, this.tab, this.compareId)
    this.bind(world, survivor)
  }

  private bind(world: WorldState, survivor: SurvivorState): void {
    this.root.querySelector('[data-close]')?.addEventListener('click', () => this.close())
    this.root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        const next = button.dataset.tab
        if (next === 'stats' || next === 'skills' || next === 'gear') this.tab = next
        this.pickSlot = null
        this.compareId = null
        this.lastKey = ''
        this.render(world)
      })
    })
    this.root.querySelectorAll<HTMLButtonElement>('[data-slot]').forEach((button) => {
      button.addEventListener('click', () => {
        const slot = button.dataset.slot as EquipSlot
        this.pickSlot = this.pickSlot === slot ? null : slot
        this.compareId = null
        this.lastKey = ''
        this.render(world)
      })
    })
    this.root.querySelectorAll<HTMLButtonElement>('[data-preview]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.preview
        if (!id) return
        if (this.compareId === id) {
          equipItem(world, survivor, id)
          this.compareId = null
          this.pickSlot = null
        } else {
          this.compareId = id
        }
        this.lastKey = ''
        this.render(world)
      })
    })
    this.root.querySelectorAll<HTMLButtonElement>('[data-equip]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.equip
        if (id) equipItem(world, survivor, id)
        this.pickSlot = null
        this.compareId = null
        this.lastKey = ''
        this.render(world)
      })
    })
    this.root.querySelector('[data-take]')?.addEventListener('click', () => {
      if (this.compareId) equipItem(world, survivor, this.compareId)
      this.pickSlot = null
      this.compareId = null
      this.lastKey = ''
      this.render(world)
    })
    this.root.querySelector('[data-unequip]')?.addEventListener('click', () => {
      if (this.pickSlot) unequipSlot(world, survivor, this.pickSlot)
      this.pickSlot = null
      this.compareId = null
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

function sheetKey(world: WorldState, survivor: SurvivorState, pick: EquipSlot | null, tab: SheetTab, compare: string | null = null): string {
  const stats = statsOf(survivor, world)
  const fire = fireProfile(survivor, 0, world)
  const skills = ensureSkills(survivor)
  return [
    survivor.id,
    tab,
    pick ?? '-',
    compare ?? '-',
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
    world.inventories[survivor.inventoryId]?.items.map((item) => `${item.itemId}:${item.count}`).join(',') ?? '',
    world.inventories['inv-warehouse']?.items.map((item) => `${item.itemId}:${item.count}`).join(',') ?? '',
    world.inventories['inv-locker']?.items.map((item) => `${item.itemId}:${item.count}`).join(',') ?? '',
  ].join('|')
}

function renderSheet(world: WorldState, survivor: SurvivorState, pick: EquipSlot | null, tab: SheetTab, compare: string | null = null): string {
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
      ? renderStatsTab(world, survivor)
      : renderGearTab(world, survivor, pick, compare)
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

function renderStatsTab(world: WorldState, survivor: SurvivorState): string {
  const stats = statsOf(survivor, world)
  const fire = fireProfile(survivor, 0, world)
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
    ${renderFireCard(fire, survivor.ammo, plus, world, survivor)}
  </div>`
}

function renderGearTab(world: WorldState, survivor: SurvivorState, pick: EquipSlot | null, compare: string | null = null): string {
  const slots = EQUIP_SLOTS.map((slot) => {
    const worn = survivor.equipment[slot.id]
    const plus = wornPlus(survivor, slot.id)
    const item = worn ? equipmentById(worn, world) : undefined
    const piece = worn ? world.gear[worn] : undefined
    const on = pick === slot.id ? ' is-on' : ''
    const name = item ? (plus > 0 ? `${item.label.replace(/ \+\d+$/, '')} +${plus}` : item.label) : '空'
    const rare = piece ? ` rarity-${piece.rarity}` : plus >= 7 ? ' is-plus-high' : plus > 0 ? ' is-plus' : ''
    return `<button type="button" class="sheet-slot sheet-slot-${slot.id}${on}" data-slot="${slot.id}">
      <em>${slot.label}</em>
      <span class="${rare}">${name}</span>
    </button>`
  }).join('')
  let picker = ''
  if (pick === 'weapon') {
    picker = renderWeaponPicker(world, survivor, compare)
  } else if (pick) {
    const options = availableForSlot(world, survivor, pick)
    const worn = survivor.equipment[pick]
    const list = options
      .map((item) => {
        const on = worn === item.id ? ' is-on' : ''
        const bonus = Object.entries(item.bonuses)
          .filter((entry) => entry[1])
          .map(([key, value]) => `${attrShort(key)}+${value}`)
          .join(' ')
        return `<button type="button" class="sheet-item${on}" data-equip="${item.id}">
          <strong>${item.label}</strong><span>${bonus || '无加成'}</span>
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

function renderWeaponPicker(world: WorldState, survivor: SurvivorState, compare: string | null): string {
  const options = availableForSlot(world, survivor, 'weapon')
  const worn = survivor.equipment.weapon
  const current = fireProfile(survivor, 0, world)
  const currentScore = current.weapon ? weaponScore(current) : 0
  const rows = options
    .map((item) => {
      const fire = previewFire(world, survivor, item.id)
      return { item, fire, score: weaponScore(fire) }
    })
    .sort((a, b) => {
      if (a.item.id === worn) return -1
      if (b.item.id === worn) return 1
      return b.score - a.score
    })
  const list = rows
    .map((row) => {
      const piece = world.gear[row.item.id]
      const on = worn === row.item.id ? ' is-on' : ''
      const picking = compare === row.item.id ? ' is-pick' : ''
      const rare = piece ? ` rarity-${piece.rarity}` : ''
      const delta = worn === row.item.id || currentScore <= 0
        ? worn === row.item.id ? '当前' : '新枪'
        : scoreDelta(compareFire(current, row.fire).deltaPct)
      const dir = worn === row.item.id ? '' : deltaClass(compareFire(current, row.fire).deltaPct)
      const procs = piece?.procs.map((proc) => procLabel(proc)).join(' ') ?? ''
      const affix = piece
        ? [...primaryAffixes(piece.affixes), ...secondaryAffixes(piece.affixes)]
          .slice(0, 3)
          .map((entry) => affixText(entry))
          .join(' · ')
        : ''
      const extra = [procs, affix].filter(Boolean).join(' · ') || (row.fire.pellets > 1 ? `${row.fire.pellets}弹` : '单发')
      return `<button type="button" class="sheet-item sheet-gun${on}${picking}${rare}" data-preview="${row.item.id}">
        <strong>${escapeHtml(row.item.label)}</strong>
        <em class="sheet-delta${dir}">${delta}</em>
        <small>攻击 ${Math.round(row.fire.minDamage)}-${Math.round(row.fire.maxDamage)} · 攻速 ${aps(row.fire.cooldown)}/秒 · 暴击 ${(row.fire.critChance * 100).toFixed(0)}%</small>
        <small>输出 ${Math.round(row.score)} · ${escapeHtml(extra)}</small>
      </button>`
    })
    .join('')
  const selected = rows.find((row) => row.item.id === compare)
  return `<div class="sheet-picker">
    <header>换枪 · 绿比现在强，红比现在弱。点一下看对比，再点或按装备换上。</header>
    ${selected ? renderCompareCard(world, survivor, current, selected.item.id, selected.fire) : ''}
    ${list || '<p>没有可换的枪</p>'}
    ${worn ? '<button type="button" class="sheet-unequip" data-unequip>卸下</button>' : ''}
  </div>`
}

function renderCompareCard(
  world: WorldState,
  survivor: SurvivorState,
  current: ReturnType<typeof fireProfile>,
  nextId: string,
  next: ReturnType<typeof fireProfile>,
): string {
  const piece = world.gear[nextId]
  const worn = findGear(world, survivor.equipment.weapon)
  const cmp = compareFire(current, next)
  const currentName = worn?.name ?? current.weapon?.label ?? '空手'
  const nextName = piece?.name ?? next.weapon?.label ?? nextId
  const lines = [
    ['攻击', current.weapon ? `${Math.round(current.minDamage)}-${Math.round(current.maxDamage)}` : '—', next.weapon ? `${Math.round(next.minDamage)}-${Math.round(next.maxDamage)}` : '—', next.damage - current.damage],
    ['攻速', current.weapon ? `${aps(current.cooldown)}/秒` : '—', next.weapon ? `${aps(next.cooldown)}/秒` : '—', (1 / Math.max(0.08, next.cooldown)) - (1 / Math.max(0.08, current.cooldown))],
    ['暴击', `${(current.critChance * 100).toFixed(0)}%`, `${(next.critChance * 100).toFixed(0)}%`, next.critChance - current.critChance],
    ['暴伤', `×${current.critDamage.toFixed(2)}`, `×${next.critDamage.toFixed(2)}`, next.critDamage - current.critDamage],
    ['射程', `${current.range.toFixed(0)}米`, `${next.range.toFixed(0)}米`, next.range - current.range],
    ['输出', `${Math.round(cmp.currentScore)}`, `${Math.round(cmp.nextScore)}`, cmp.nextScore - cmp.currentScore],
  ] as const
  const rows = lines
    .map(([label, left, right, delta]) => {
      const dir = Number(delta) > 0.001 ? ' is-up' : Number(delta) < -0.001 ? ' is-down' : ''
      return `<li><span>${label}</span><b>${left}</b><em class="${dir}">${right}</em></li>`
    })
    .join('')
  const affixes = piece ? renderAffixList(piece.affixes, piece.procs) : ''
  const verdict = cmp.deltaPct > 2 ? `比现在强 ${cmp.deltaPct}%` : cmp.deltaPct < -2 ? `比现在弱 ${Math.abs(cmp.deltaPct)}%` : '和现在差不多'
  const verdictClass = cmp.deltaPct > 2 ? 'is-up' : cmp.deltaPct < -2 ? 'is-down' : ''
  return `<article class="sheet-compare">
    <header>
      <strong class="${piece ? `rarity-${piece.rarity}` : ''}">${escapeHtml(nextName)}${piece ? ` · ${RARITY_LABEL[piece.rarity]}` : ''}</strong>
      <span>对比 ${escapeHtml(currentName)}</span>
    </header>
    <p class="sheet-verdict ${verdictClass}">${verdict}</p>
    <ul>${rows}</ul>
    ${affixes}
    <button type="button" class="sheet-take" data-take>装备这把</button>
  </article>`
}

function aps(cooldown: number): string {
  return (1 / Math.max(0.08, cooldown)).toFixed(2)
}

function scoreDelta(pct: number): string {
  if (Math.abs(pct) < 1) return '持平'
  return pct > 0 ? `+${pct}%` : `${pct}%`
}

function deltaClass(pct: number): string {
  if (pct > 2) return ' is-up'
  if (pct < -2) return ' is-down'
  return ''
}

function enhanceNote(result: ReturnType<typeof tryEnhance>): string {
  if (result === 'ok') return '强化成功'
  if (result === 'fail') return '强化失败，装备没掉级'
  if (result === 'max') return '已经 +10'
  if (result === 'no_scrap') return '仓库废铁不够'
  return '这一格是空的'
}

function renderFireCard(
  fire: ReturnType<typeof fireProfile>,
  ammo: number,
  plus = 0,
  world?: WorldState,
  survivor?: SurvivorState,
): string {
  if (!fire.weapon) {
    return `<div class="sheet-fire"><strong>未装备枪械</strong><span>去武器栏或工具柜换枪</span></div>`
  }
  const piece = world && survivor ? findGear(world, survivor.equipment.weapon) : undefined
  const name = piece ? piece.name : plus > 0 ? `${fire.weapon.label} +${plus}` : fire.weapon.label
  const rare = piece ? ` rarity-${piece.rarity}` : ''
  const affixes = piece ? renderAffixList(piece.affixes, piece.procs) : ''
  return `<div class="sheet-fire">
    <strong class="${rare}">${escapeHtml(name)}${piece ? ` · ${RARITY_LABEL[piece.rarity]}` : ''}</strong>
    <span>弹药 ${INFINITE_AMMO ? '无限' : `${ammo}/${magazineSize(fire.weapon.id)}`} · ${fire.pellets > 1 ? `${fire.pellets}弹` : '单发'}</span>
    <ul>
      <li>攻击 ${fire.minDamage}-${fire.maxDamage}</li>
      <li>攻速 ${(1 / Math.max(0.08, fire.cooldown)).toFixed(2)}/秒</li>
      <li>暴击 ${(fire.critChance * 100).toFixed(0)}%</li>
      <li>暴伤 ×${fire.critDamage.toFixed(2)}</li>
      <li>击退 ${fire.knockback.toFixed(1)}</li>
      <li>魅惑 ${(fire.charm * 100).toFixed(0)}%</li>
      <li>射程 ${fire.range.toFixed(0)}米</li>
    </ul>
    ${affixes}
  </div>`
}

function renderAffixList(affixes: AffixRoll[], procs: WeaponProc[]): string {
  const mains = primaryAffixes(affixes).map((affix) => `<li>${affixText(affix)}</li>`).join('')
  const minors = secondaryAffixes(affixes).map((affix) => `<li class="is-minor">${affixText(affix)} · 次</li>`).join('')
  const procItems = procs.map((proc) => `<li class="is-proc">${procLabel(proc)}</li>`).join('')
  if (!mains && !minors && !procItems) return ''
  return `<ul class="sheet-affix">${mains}${minors}${procItems}</ul>`
}

function attrShort(key: string): string {
  if (key === 'strength') return '力'
  if (key === 'agility') return '敏'
  if (key === 'constitution') return '体'
  return '智'
}

export function inspectSheetHtml(world: WorldState, survivorId: string, tab: SheetTab = 'skills', pick: EquipSlot | null = null): string {
  const survivor = findSurvivor(world, survivorId)
  if (!survivor) return ''
  return renderSheet(world, survivor, pick, tab, null)
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
