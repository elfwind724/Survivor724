import { countItem } from '@/inventory/Inventory'
import { hudTimeCaption, phaseLabel } from '@/simulation/TimeSystem'
import type { SurvivorState, WorldState } from '@/simulation/types'
import { clampVital } from '@/survivors/Vitals'

export interface HudPick {
  id: string
  kind: 'select' | 'possess'
}

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
  portrait: string
  bars: HudBar[]
}

export interface HudModel {
  day: number
  phase: string
  caption: string
  timeScale: number
  notice: string
  sites: number
  stocks: HudStock[]
  cards: HudCard[]
}

const JOB_LABEL: Record<string, string> = {
  hunter: '猎手',
  fisher: '渔手',
  scavenger: '搜刮',
  hauler: '搬运',
  builder: '工匠',
}

export function buildHudModel(world: WorldState, notice = ''): HudModel {
  const warehouse = world.inventories['inv-warehouse']
  return {
    day: world.time.dayIndex,
    phase: phaseLabel(world.time.phase),
    caption: hudTimeCaption(world),
    timeScale: world.time.timeScale,
    notice,
    sites: world.structures.filter((structure) => structure.stage !== 'complete').length,
    stocks: [
      { id: 'wood', label: '木', count: warehouse ? countItem(warehouse, 'wood') : 0 },
      { id: 'scrap', label: '铁', count: warehouse ? countItem(warehouse, 'scrap') : 0 },
      { id: 'ammo', label: '弹', count: warehouse ? countItem(warehouse, 'ammo') : 0 },
      { id: 'food', label: '食', count: warehouse ? countItem(warehouse, 'raw_meat') + countItem(warehouse, 'raw_fish') : 0 },
    ],
    cards: world.survivors.map((survivor) => cardModel(world, survivor)),
  }
}

export function hudModelKey(model: HudModel): string {
  const stocks = model.stocks.map((item) => `${item.id}:${item.count}`).join(',')
  const cards = model.cards
    .map((card) => `${card.id}:${card.live ? 1 : 0}${card.selected ? 1 : 0}:${Math.round(card.bars[0]?.value ?? 0)}:${Math.round(card.bars[1]?.value ?? 0)}:${Math.round(card.bars[2]?.value ?? 0)}:${card.status}:${card.ammo ?? '-'}`)
    .join('|')
  return `${model.day}:${model.phase}:${model.caption}:${model.timeScale}:${model.sites}:${model.notice}:${stocks}:${cards}`
}

export function renderHudHtml(model: HudModel): string {
  const scale = model.timeScale !== 1 ? `<span class="hud-chip">${model.timeScale}×</span>` : ''
  const sites = model.sites > 0 ? `<span class="hud-chip hud-chip-work">施工 ${model.sites}</span>` : ''
  const stocks = model.stocks
    .map((item) => `<span class="hud-stock" data-stock="${item.id}"><i></i>${item.label} ${item.count}</span>`)
    .join('')
  const cards = model.cards.map(renderCard).join('')
  const toast = model.notice ? `<p class="hud-toast">${escapeHtml(model.notice)}</p>` : ''
  return `
    <div class="hud-top">
      <div class="hud-clock">
        <strong>第 ${model.day} 天</strong>
        <span class="hud-phase">${model.phase}</span>
        <span class="hud-caption">${model.caption}</span>
        ${scale}${sites}
      </div>
      <div class="hud-stocks">${stocks}</div>
    </div>
    <div class="hud-roster">${cards}</div>
    ${toast}
  `
}

export class GameHud {
  private lastKey = ''
  private lastClickAt = 0
  private lastClickId: string | null = null

  constructor(
    private readonly root: HTMLElement,
    private readonly onPick: (pick: HudPick) => void,
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
  return {
    id: survivor.id,
    name: survivor.name,
    job: JOB_LABEL[survivor.professionId] ?? survivor.professionId,
    status: statusLabel(world, survivor),
    selected: world.player.selectedId === survivor.id,
    live: world.player.controlledId === survivor.id,
    downed: survivor.downed,
    ammo: world.player.controlledId === survivor.id ? survivor.ammo : null,
    portrait: survivorPortrait(survivor),
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
  const ammo = card.ammo !== null ? `<em class="hud-ammo">${card.ammo}发</em>` : ''
  return `<button type="button" class="hud-card ${flags}" data-survivor="${card.id}">
    <span class="hud-face" aria-hidden="true">${card.portrait}</span>
    <span class="hud-meta">
      <strong>${escapeHtml(card.name)}${ammo}</strong>
      <small>${escapeHtml(card.job)} · ${escapeHtml(card.status)}</small>
      ${bars}
    </span>
  </button>`
}

function statusLabel(world: WorldState, survivor: SurvivorState): string {
  if (survivor.downed) return '倒地'
  if (world.time.phase === 'night' || world.time.phase === 'aftermath') return '守夜'
  switch (survivor.workerState) {
    case 'AcquireEquipment':
      return '取工具'
    case 'TravelToTarget':
      return '赶路'
    case 'Work':
      return '工作'
    case 'CollectOutput':
      return '收货'
    case 'ReturnToBase':
      return '返程'
    case 'DepositItems':
      return '卸货'
    case 'ReturnEquipment':
      return '还工具'
    default:
      return '待命'
  }
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
