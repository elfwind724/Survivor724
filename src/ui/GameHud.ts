import { activityCaption } from '@/survivors/Activity'
import { bagFill, HUD_STOCK_IDS } from '@/inventory/Cargo'
import { countItem, usedSlots } from '@/inventory/Inventory'
import { itemLabel } from '@/data/items'
import { RARITY_COLOR, RARITY_LABEL } from '@/data/loot'
import { assignmentLabel, postLabel } from '@/jobs/Roster'
import { equippedWeapon, INFINITE_AMMO, magazineSize, readMag } from '@/data/weapons'
import { duskWarningLevel, duskWarningText, hudTimeCaption, phaseLabel } from '@/simulation/TimeSystem'
import type { SurvivorState, WorldState } from '@/simulation/types'
import { clampVital } from '@/survivors/Vitals'

export interface HudPick {
  id: string
  kind: 'select' | 'possess'
}

export type HudCommand = 'reset-view' | 'toggle-interiors' | 'restart' | 'ack-night' | 'open-sheet'

interface HudStock {
  id: string
  label: string
  count: number
}

interface HudBar {
  key: 'hp' | 'hunger' | 'thirst'
  label: string
  value: number
}

export interface HudCard {
  id: string
  name: string
  job: string
  status: string
  selected: boolean
  live: boolean
  downed: boolean
  ammo: number | null
  ammoMax: number
  weapon: string | null
  cooldown: number
  portrait: string
  bars: HudBar[]
  bagUsed: number
  bagCap: number
}

export interface HudModel {
  day: number
  phase: string
  caption: string
  timeScale: number
  notice: string
  warning: string
  sites: number
  interiors: boolean
  stocks: HudStock[]
  extras: HudStock[]
  warehouseUsed: number
  warehouseCap: number
  bag: {
    name: string
    used: number
    capacity: number
    full: boolean
    items: HudStock[]
  }
  cards: HudCard[]
  weapon: {
    name: string
    ammo: number
    ammoMax: number
    cooldown: number
  } | null
  report: {
    title: string
    reason: string
    stats: string
    loot: string
    lost: boolean
  } | null
}

const PROFESSION_LABEL: Record<string, string> = {
  hunter: '猎手',
  fisher: '渔手',
  scavenger: '搜刮',
  hauler: '搬运',
  builder: '工匠',
}

export function buildHudModel(world: WorldState, notice = ''): HudModel {
  const warehouse = world.inventories['inv-warehouse']
  const hero = world.survivors.find((entry) => entry.id === world.player.heroId) ?? world.survivors[0]
  const bagInv = hero ? world.inventories[hero.inventoryId] : undefined
  const fill = bagInv ? bagFill(bagInv) : { used: 0, capacity: 0, full: false }
  const tracked = new Set<string>(HUD_STOCK_IDS)
  return {
    day: world.time.dayIndex,
    phase: phaseLabel(world.time.phase),
    caption: hudTimeCaption(world),
    timeScale: world.time.timeScale,
    notice,
    warning: duskWarningText(duskWarningLevel(world)),
    sites: world.structures.filter((structure) => structure.stage !== 'complete').length,
    interiors: world.showInteriors,
    stocks: HUD_STOCK_IDS.map((id) => ({
      id,
      label: itemLabel(id),
      count: warehouse ? countItem(warehouse, id) : 0,
    })),
    extras: warehouse
      ? warehouse.items
        .filter((item) => !tracked.has(item.itemId) && item.count > 0)
        .map((item) => {
          const piece = world.gear[item.itemId]
          return {
            id: item.itemId,
            label: piece ? `${RARITY_LABEL[piece.rarity]} ${piece.name}` : itemLabel(item.itemId),
            count: item.count,
          }
        })
      : [],
    warehouseUsed: warehouse ? usedSlots(warehouse) : 0,
    warehouseCap: warehouse?.capacity ?? 0,
    bag: {
      name: hero?.name ?? '背包',
      used: fill.used,
      capacity: fill.capacity,
      full: fill.full,
      items: (bagInv?.items ?? [])
        .filter((item) => item.count > 0)
        .map((item) => ({ id: item.itemId, label: itemLabel(item.itemId), count: item.count })),
    },
    cards: world.survivors.map((survivor) => cardModel(world, survivor)),
    weapon: focusWeapon(world),
    report: reportModel(world),
  }
}

export function hudModelKey(model: HudModel): string {
  const stocks = model.stocks.map((item) => `${item.id}:${item.count}`).join(',')
  const extras = model.extras.map((item) => `${item.id}:${item.count}`).join(',')
  const bag = `${model.bag.used}/${model.bag.capacity}:${model.bag.items.map((item) => `${item.id}:${item.count}`).join(',')}`
  const cards = model.cards
    .map((card) => `${card.id}:${card.live ? 1 : 0}${card.selected ? 1 : 0}:${Math.round(card.bars[0]?.value ?? 0)}:${Math.round(card.bars[1]?.value ?? 0)}:${Math.round(card.bars[2]?.value ?? 0)}:${card.job}:${card.status}:${card.ammo ?? '-'}:${card.cooldown.toFixed(2)}:${card.bagUsed}/${card.bagCap}`)
    .join('|')
  const weapon = model.weapon ? `${model.weapon.name}:${model.weapon.ammo}/${model.weapon.ammoMax}:${model.weapon.cooldown.toFixed(2)}` : '-'
  const report = model.report ? `${model.report.lost ? 'L' : 'W'}:${model.report.stats}:${model.report.loot}` : '-'
  return `${model.day}:${model.phase}:${model.caption}:${model.timeScale}:${model.sites}:${model.interiors ? 1 : 0}:${model.warning}:${model.notice}:${model.warehouseUsed}/${model.warehouseCap}:${stocks}:${extras}:${bag}:${cards}:${weapon}:${report}`
}

export function renderHudHtml(model: HudModel): string {
  const scale = model.timeScale !== 1 ? `<span class="hud-chip">${model.timeScale}×</span>` : ''
  const sites = model.sites > 0 ? `<span class="hud-chip hud-chip-work">施工 ${model.sites}</span>` : ''
  const stocks = model.stocks
    .map((item) => `<span class="hud-stock${item.count <= 0 ? ' is-empty' : ''}" data-stock="${item.id}"><i></i>${escapeHtml(item.label)} ${item.count}</span>`)
    .join('')
  const extras = model.extras
    .map((item) => {
      const rare = item.id.startsWith('g-') ? ' is-loot' : ''
      return `<span class="hud-stock${rare}" data-stock="${item.id}"><i></i>${escapeHtml(item.label)} ${item.count}</span>`
    })
    .join('')
  const bagItems = model.bag.items.length > 0
    ? model.bag.items.map((item) => `<span class="hud-stock" data-stock="${item.id}"><i></i>${escapeHtml(item.label)} ${item.count}</span>`).join('')
    : '<span class="hud-stock is-empty">空</span>'
  const cards = model.cards.map(renderCard).join('')
  const toast = model.notice ? `<p class="hud-toast">${escapeHtml(model.notice)}</p>` : ''
  return `
    <div class="hud-top">
      <div class="hud-clock">
        <strong>第 ${model.day} 天</strong>
        <span class="hud-phase">${model.phase}</span>
        <span class="hud-caption">${model.caption}</span>
        ${scale}${sites}${model.warning ? `<span class="hud-chip hud-chip-warn">${model.warning}</span>` : ''}
        <button type="button" class="hud-reset" data-action="reset-view">复位镜头</button>
        <button type="button" class="hud-reset" data-action="toggle-interiors">${model.interiors ? '显示整栋' : '显示内部'}</button>
        <button type="button" class="hud-reset" data-action="open-sheet">C 技能</button>
      </div>
      <div class="hud-stocks">
        <strong>仓库 ${model.warehouseUsed}/${model.warehouseCap}</strong>
        ${stocks}
        ${extras}
      </div>
      <div class="hud-bag${model.bag.full ? ' is-full' : ''}">
        <strong>背包 ${model.bag.used}/${model.bag.capacity}</strong>
        ${bagItems}
        ${model.bag.full ? '<em>满了，回仓库卸货</em>' : model.bag.used > 0 ? '<em>走近仓库自动入库 · G 卸货</em>' : ''}
      </div>
      ${renderWeaponHud(model.weapon)}
    </div>
    <div class="hud-roster">${cards}</div>
    ${toast}
    ${renderReport(model)}
  `
}

export class GameHud {
  private lastKey = ''
  private lastClickAt = 0
  private lastClickId: string | null = null

  constructor(
    private readonly root: HTMLElement,
    private readonly onPick: (pick: HudPick) => void,
    private readonly onCommand: (command: HudCommand) => void,
  ) {
    this.root.classList.add('game-hud')
    this.root.addEventListener('pointerdown', this.onPointerDown)
  }

  render(world: WorldState, notice = ''): void {
    const model = buildHudModel(world, notice)
    const key = hudModelKey(model)
    if (key === this.lastKey) return
    this.lastKey = key
    this.root.innerHTML = renderHudHtml(model)
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    const target = event.target
    if (!(target instanceof Element)) return
    const command = target.closest<HTMLButtonElement>('[data-action]')
    const action = command?.dataset.action
    if (action === 'reset-view' || action === 'toggle-interiors' || action === 'restart' || action === 'ack-night' || action === 'open-sheet') {
      event.stopPropagation()
      this.onCommand(action)
      return
    }
    const button = target.closest<HTMLButtonElement>('[data-survivor]')
    if (!button?.dataset.survivor) return
    event.stopPropagation()
    const id = button.dataset.survivor
    const now = performance.now()
    const kind = this.lastClickId === id && now - this.lastClickAt < 320 ? 'possess' : 'select'
    this.lastClickAt = now
    this.lastClickId = id
    this.onPick({ id, kind })
  }
}

function cardModel(world: WorldState, survivor: SurvivorState): HudCard {
  const gun = equippedWeapon(survivor)
  const bag = world.inventories[survivor.inventoryId]
  const fill = bag ? bagFill(bag) : { used: 0, capacity: 0, full: false }
  return {
    id: survivor.id,
    name: survivor.name,
    job: survivor.id === world.player.heroId
      ? `主角 · ${PROFESSION_LABEL[survivor.professionId] ?? survivor.professionId}Lv${survivor.level}`
      : `${PROFESSION_LABEL[survivor.professionId] ?? survivor.professionId}Lv${survivor.level}·${assignmentLabel(survivor, world.player.heroId)}`,
    status: statusLabel(world, survivor),
    selected: world.player.selectedId === survivor.id,
    live: world.player.controlledId === survivor.id,
    downed: survivor.downed,
    ammo: gun ? readMag(survivor, gun.id) : null,
    ammoMax: gun ? magazineSize(gun.id) : 0,
    weapon: gun?.label ?? null,
    cooldown: cooldownRatio(survivor),
    portrait: survivorPortrait(survivor),
    bagUsed: fill.used,
    bagCap: fill.capacity,
    bars: [
      { key: 'hp', label: '血', value: clampVital(survivor.health) },
      { key: 'hunger', label: '饥', value: clampVital(survivor.hunger) },
      { key: 'thirst', label: '渴', value: clampVital(survivor.thirst) },
    ],
  }
}

function renderCard(card: HudCard): string {
  const flags = [
    card.live ? 'is-live' : '',
    card.selected ? 'is-selected' : '',
    card.downed ? 'is-downed' : '',
  ].filter(Boolean).join(' ')
  const bars = card.bars
    .map((bar) => {
      const width = Math.max(4, Math.round(bar.value))
      return `<div class="hud-bar hud-bar-${bar.key}" title="${bar.label} ${Math.round(bar.value)}">
        <span>${bar.label}</span>
        <i><b style="width:${width}%"></b></i>
      </div>`
    })
    .join('')
  const ammo = card.ammo !== null
    ? `<em class="hud-ammo">${INFINITE_AMMO ? '∞' : `${card.ammo}/${card.ammoMax}`}</em>`
    : ''
  return `<button type="button" class="hud-card ${flags}" data-survivor="${card.id}">
    <span class="hud-face" aria-hidden="true">${card.portrait}</span>
    <span class="hud-meta">
      <strong>${escapeHtml(card.name)}${ammo}</strong>
      <small>${escapeHtml(card.job)} · ${escapeHtml(card.status)} · 袋${card.bagUsed}/${card.bagCap}</small>
      ${bars}
    </span>
  </button>`
}

function focusWeapon(world: WorldState): HudModel['weapon'] {
  const id = world.player.controlledId ?? world.player.selectedId
  const survivor = id ? world.survivors.find((entry) => entry.id === id) : undefined
  if (!survivor) return null
  const gun = equippedWeapon(survivor)
  if (!gun) return null
  const piece = world.gear[survivor.equipment.weapon ?? '']
  const plus = survivor.enhance?.weapon ?? 0
  return {
    name: piece ? piece.name : plus > 0 ? `${gun.label} +${plus}` : gun.label,
    ammo: readMag(survivor, gun.id),
    ammoMax: magazineSize(gun.id),
    cooldown: cooldownRatio(survivor),
  }
}

function reportModel(world: WorldState): HudModel['report'] {
  const report = world.nightReport
  if (!report) return null
  if (report.outcome === 'lost' && !world.gameOver) return null
  if (report.outcome === 'won' && world.time.phase !== 'aftermath' && !world.gameOver) return null
  const loot = report.loot.filter((item) => item.count > 0).map((item) => `${item.label}+${item.count}`).join('  ')
  return {
    title: report.outcome === 'lost' ? `第 ${report.day} 夜 · 防守失败` : `第 ${report.day} 夜 · 防守成功`,
    reason: report.reason,
    stats: `击杀 ${report.kills}/${report.spawned} · 倒地 ${report.downed} · 墙损 ${report.wallsLost}`,
    loot: loot || '没有搜到残骸',
    lost: report.outcome === 'lost',
  }
}

function renderReport(model: HudModel): string {
  if (!model.report) return ''
  const action = model.report.lost
    ? '<button type="button" class="hud-reset" data-action="restart">重新开始</button>'
    : '<button type="button" class="hud-reset" data-action="ack-night">继续建设</button>'
  return `<div class="night-report${model.report.lost ? ' is-lost' : ''}">
    <strong>${escapeHtml(model.report.title)}</strong>
    <span>${escapeHtml(model.report.reason)}</span>
    <span>${escapeHtml(model.report.stats)}</span>
    <span>${escapeHtml(model.report.loot)}</span>
    ${action}
  </div>`
}

function cooldownRatio(survivor: SurvivorState): number {
  if (survivor.fireCooldownMax <= 0) return 0
  return Math.max(0, Math.min(1, survivor.fireCooldown / survivor.fireCooldownMax))
}

function renderWeaponHud(weapon: HudModel['weapon']): string {
  if (!weapon) return ''
  const empty = !INFINITE_AMMO && weapon.ammo <= 0 ? ' is-empty' : ''
  const cooling = weapon.cooldown > 0.02 ? ' is-cd' : ''
  return `<div class="hud-weapon${empty}${cooling}">
    <span class="hud-cd" style="--t:${weapon.cooldown.toFixed(3)}" aria-hidden="true"></span>
    <div>
      <strong>${escapeHtml(weapon.name)}</strong>
      <em>${INFINITE_AMMO ? '∞' : `${weapon.ammo}/${weapon.ammoMax}`}</em>
    </div>
  </div>`
}

function statusLabel(world: WorldState, survivor: SurvivorState): string {
  return activityCaption(world, survivor)
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

export function survivorPortrait(survivor: SurvivorState): string {
  const skin = survivor.professionId === 'fisher' ? '#c9a07a' : survivor.professionId === 'scavenger' ? '#b38864' : '#d4aa84'
  const hair = survivor.professionId === 'builder' ? '#5a4634' : survivor.professionId === 'hauler' ? '#2b241c' : '#1d1813'
  const cloth =
    survivor.professionId === 'hunter' ? '#4a5a38'
    : survivor.professionId === 'fisher' ? '#355468'
    : survivor.professionId === 'scavenger' ? '#6a4e34'
    : survivor.professionId === 'hauler' ? '#5a5348'
    : '#7a5a3a'
  const mark =
    survivor.professionId === 'hunter' ? `<path d="M10 18h10l-2 5H12z" fill="#2c2418"/><rect x="18" y="16" width="10" height="2" rx="1" fill="#6b6254"/>`
    : survivor.professionId === 'fisher' ? `<path d="M8 40c4-6 16-6 20 0" stroke="#8ec0d0" stroke-width="1.4" fill="none"/>`
    : survivor.professionId === 'scavenger' ? `<rect x="12" y="20" width="16" height="4" rx="2" fill="#2a241c" opacity=".7"/>`
    : survivor.professionId === 'hauler' ? `<path d="M11 34h18l-2 8H13z" fill="#3d3428"/>`
    : `<path d="M14 18h12v3H14z" fill="#c4a46a"/>`
  return `<svg viewBox="0 0 40 48" width="48" height="56">
    <rect width="40" height="48" fill="#221c16"/>
    <circle cx="20" cy="16" r="8" fill="${skin}"/>
    <path d="M12 14c1-6 15-6 16 0v3H12z" fill="${hair}"/>
    <path d="M11 28c2-6 16-6 18 0v16H11z" fill="${cloth}"/>
    ${mark}
    <circle cx="17" cy="16" r="1" fill="#2a2018"/>
    <circle cx="23" cy="16" r="1" fill="#2a2018"/>
  </svg>`
}
