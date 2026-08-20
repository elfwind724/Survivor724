import { activityCaption } from '@/survivors/Activity'
import { buildQueue, type QueueEntry } from '@/base/BuildQueue'
import { bagFill, HUD_STOCK_IDS } from '@/inventory/Cargo'
import { inspectHtml, inspectItem } from '@/inventory/ItemInspect'
import { countItem, usedSlots } from '@/inventory/Inventory'
import { PICK_LABEL, TUTORIAL_LINES, type DungeonPickId } from '@/data/dungeon'
import { listSlots, type SaveSlotId, type SaveSlotView } from '@/save/SaveSchema'
import { gunshotHordeExtra, loudestGunshotSector } from '@/data/enemies'
import { itemLabel } from '@/data/items'
import { gearLabel, isGearId, nearbyLootName } from '@/data/loot'
import { isInDungeon, nearDungeonEntrance } from '@/dungeon/Dungeon'
import { assignmentLabel } from '@/jobs/Roster'
import { equippedWeapon, INFINITE_AMMO, magazineSize, readMag } from '@/data/weapons'
import { findContainer } from '@/simulation/EntityRegistry'
import { duskStatus, duskWarningLevel, duskWarningText, hudTimeCaption, phaseLabel, secondsUntilDusk } from '@/simulation/TimeSystem'
import { insideBase } from '@/survivors/Living'
import { distanceXZ, type ItemRarity, type SurvivorState, type WorldState } from '@/simulation/types'
import { clampVital } from '@/survivors/Vitals'
import { HOTBAR_SIZE, hotbarOf, type HotbarEntry } from '@/survivors/Equipment'
import type { PackClick, PackCursor } from '@/inventory/Pack'

export interface HudPick {
  id: string
  kind: 'select' | 'possess' | 'rescue'
}

export type HudCommand =
  | 'reset-view'
  | 'toggle-interiors'
  | 'restart'
  | 'ack-night'
  | 'open-sheet'
  | 'open-bag'
  | 'close-bag'
  | 'save'
  | 'load'
  | 'close-saves'
  | 'dungeon-advance'
  | 'dungeon-evacuate'

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
  dusk: string
}

export interface HudModel {
  day: number
  phase: string
  caption: string
  timeScale: number
  notice: string
  warning: string
  sites: number
  queue: QueueEntry[]
  interiors: boolean
  stocks: HudStock[]
  extras: HudStock[]
  lootHint: string
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
  hotbar: Array<{
    index: number
    itemId: string
    label: string
    line: string
    equipped: boolean
    rarity: ItemRarity | null
    count: number
    picked: boolean
    tip: string
  } | null>
  pack: {
    open: boolean
    owner: string
    used: number
    capacity: number
    pick: string
    slots: Array<{ itemId: string; label: string; count: number; picked: boolean; tip: string } | null>
  }
  report: {
    title: string
    reason: string
    stats: string
    loot: string
    lost: boolean
  } | null
  tutorial: string
  dungeon: {
    room: number
    total: number
    picks: Array<{ id: DungeonPickId; label: string }>
    canAdvance: boolean
    canEvacuate: boolean
  } | null
  dungeonHint: string
  saves: {
    mode: 'save' | 'load' | null
    slots: SaveSlotView[]
  }
}

const PROFESSION_LABEL: Record<string, string> = {
  hunter: '猎手',
  fisher: '渔手',
  scavenger: '搜刮',
  hauler: '搬运',
  builder: '工匠',
}

export function buildHudModel(
  world: WorldState,
  notice = '',
  pack?: { open: boolean; cursor: PackCursor | null },
  saves?: { mode: 'save' | 'load' | null; slots: SaveSlotView[] },
): HudModel {
  const warehouse = world.inventories['inv-warehouse']
  const hero = world.survivors.find((entry) => entry.id === world.player.heroId) ?? world.survivors[0]
  const bagInv = hero ? world.inventories[hero.inventoryId] : undefined
  const fill = bagInv ? bagFill(bagInv) : { used: 0, capacity: 0, full: false }
  const tracked = new Set<string>(HUD_STOCK_IDS)
  const queue = buildQueue(world)
  return {
    day: world.time.dayIndex,
    phase: phaseLabel(world.time.phase),
    caption: hudTimeCaption(world),
    timeScale: world.time.timeScale,
    notice,
    warning: dungeonWarning(world) || duskWarningText(duskWarningLevel(world)) || raidNightWarning(world) || huntNoiseWarning(world),
    sites: queue.length,
    queue,
    interiors: world.showInteriors,
    stocks: HUD_STOCK_IDS.map((id) => ({
      id,
      label: itemLabel(id),
      count: warehouse ? countItem(warehouse, id) : 0,
    })),
    extras: warehouse
      ? warehouse.items
        .filter((item) => !tracked.has(item.itemId) && !isGearId(item.itemId) && item.count > 0)
        .map((item) => ({
          id: item.itemId,
          label: itemLabel(item.itemId),
          count: item.count,
        }))
      : [],
    lootHint: lootHintFor(world, hero),
    dungeonHint: dungeonHintFor(world, hero),
    warehouseUsed: warehouse ? usedSlots(warehouse) : 0,
    warehouseCap: warehouse?.capacity ?? 0,
    bag: {
      name: hero?.name ?? '背包',
      used: fill.used,
      capacity: fill.capacity,
      full: fill.full,
      items: (bagInv?.items ?? [])
        .filter((item) => item.count > 0)
        .map((item) => ({ id: item.itemId, label: gearLabel(world, item.itemId), count: item.count })),
    },
    cards: world.survivors.map((survivor) => cardModel(world, survivor)),
    weapon: focusWeapon(world),
    hotbar: hotbarModel(world, pack?.cursor ?? null),
    pack: packModel(world, pack?.open === true, pack?.cursor ?? null),
    report: reportModel(world),
    tutorial: tutorialLine(world),
    dungeon: dungeonModel(world),
    saves: {
      mode: saves?.mode ?? null,
      slots: saves?.slots ?? [],
    },
  }
}

export function hudModelKey(model: HudModel): string {
  const stocks = model.stocks.map((item) => `${item.id}:${item.count}`).join(',')
  const extras = model.extras.map((item) => `${item.id}:${item.count}`).join(',')
  const bag = `${model.bag.used}/${model.bag.capacity}:${model.bag.items.map((item) => `${item.id}:${item.count}`).join(',')}`
  const cards = model.cards
    .map((card) => `${card.id}:${card.live ? 1 : 0}${card.selected ? 1 : 0}:${Math.round(card.bars[0]?.value ?? 0)}:${Math.round(card.bars[1]?.value ?? 0)}:${Math.round(card.bars[2]?.value ?? 0)}:${card.job}:${card.status}:${card.ammo ?? '-'}:${card.cooldown.toFixed(2)}:${card.bagUsed}/${card.bagCap}:${card.dusk}`)
    .join('|')
  const weapon = model.weapon ? `${model.weapon.name}:${model.weapon.ammo}/${model.weapon.ammoMax}:${model.weapon.cooldown.toFixed(2)}` : '-'
  const hotbar = model.hotbar.map((slot) => slot ? `${slot.itemId}:${slot.count}:${slot.equipped ? 1 : 0}:${slot.picked ? 1 : 0}` : '-').join(',')
  const pack = `${model.pack.open ? 1 : 0}:${model.pack.pick}:${model.pack.slots.map((slot) => slot ? `${slot.itemId}:${slot.count}` : '-').join(',')}`
  const report = model.report ? `${model.report.lost ? 'L' : 'W'}:${model.report.stats}:${model.report.loot}` : '-'
  const dungeon = model.dungeon
    ? `${model.dungeon.room}/${model.dungeon.total}:${model.dungeon.picks.map((pick) => pick.id).join(',')}:${model.dungeon.canAdvance ? 1 : 0}:${model.dungeon.canEvacuate ? 1 : 0}`
    : '-'
  const queue = model.queue.map((row) => `${row.id}:${row.progress}:${row.detail}`).join('|')
  const saves = `${model.saves.mode ?? '-'}:${model.saves.slots.map((slot) => `${slot.id}:${slot.empty ? 0 : 1}:${slot.meta?.name ?? ''}`).join(',')}`
  return `${model.day}:${model.phase}:${model.caption}:${model.timeScale}:${model.sites}:${queue}:${model.interiors ? 1 : 0}:${model.warning}:${model.notice}:${model.lootHint}:${model.dungeonHint}:${model.tutorial}:${dungeon}:${model.warehouseUsed}/${model.warehouseCap}:${stocks}:${extras}:${bag}:${cards}:${weapon}:${hotbar}:${pack}:${report}:${saves}`
}

export function renderHudHtml(model: HudModel): string {
  const scale = model.timeScale !== 1 ? `<span class="hud-chip">${model.timeScale}×</span>` : ''
  const sites = model.sites > 0 ? `<span class="hud-chip hud-chip-work">施工 ${model.sites}</span>` : ''
  const stocks = model.stocks
    .map((item) => `<span class="hud-stock${item.count <= 0 ? ' is-empty' : ''}" data-stock="${item.id}">${escapeHtml(item.label)} ${item.count}</span>`)
    .join('')
  const extras = model.extras
    .map((item) => {
      const rare = item.id.startsWith('g-') ? ' is-loot' : ''
      return `<span class="hud-stock${rare}" data-stock="${item.id}">${escapeHtml(item.label)} ${item.count}</span>`
    })
    .join('')
  const portraits = model.cards.map(renderPortrait).join('')
  const toast = model.notice ? `<p class="hud-toast">${escapeHtml(model.notice)}</p>` : ''
  const loot = model.lootHint ? `<p class="hud-toast hud-loot">${escapeHtml(model.lootHint)}</p>` : ''
  return `
    <div class="hud-stocks">
      <span class="hud-stock-cap">仓库 ${model.warehouseUsed}/${model.warehouseCap}</span>
      ${stocks}
      ${extras}
    </div>
    <div class="hud-left">
      <div class="hud-clock">
        <strong>第 ${model.day} 天</strong>
        <span class="hud-phase">${model.phase}</span>
        <span class="hud-caption">${model.caption}</span>
        ${scale}${sites}${model.warning ? `<span class="hud-chip hud-chip-warn">${model.warning}</span>` : ''}
        ${model.dungeon ? `<span class="hud-chip">房间 ${model.dungeon.room}/${model.dungeon.total}</span>` : ''}
        <span class="hud-tools">
          <button type="button" class="hud-reset" data-action="reset-view">复位镜头</button>
          <button type="button" class="hud-reset" data-action="toggle-interiors">${model.interiors ? '显示整栋' : '显示内部'}</button>
          <button type="button" class="hud-reset" data-action="open-sheet">C 装备</button>
          <button type="button" class="hud-reset" data-action="open-bag">N 背包</button>
          <button type="button" class="hud-reset" data-action="save">保存</button>
          <button type="button" class="hud-reset" data-action="load">读取</button>
        </span>
      </div>
      ${renderQueue(model.queue)}
      <div class="hud-colonists">
        <div class="hud-portraits">${portraits}</div>
        ${renderInspect(model)}
      </div>
    </div>
    ${renderPack(model)}
    <div class="hud-dock">
      ${renderWeaponHud(model.weapon)}
      ${renderHotbar(model.hotbar)}
    </div>
    ${toast}
    ${loot}
    ${model.dungeonHint ? `<p class="hud-toast hud-loot">${escapeHtml(model.dungeonHint)}</p>` : ''}
    ${renderDungeon(model)}
    ${renderReport(model)}
    ${renderSaves(model)}
  `
}

export class GameHud {
  private lastKey = ''
  private lastClickAt = 0
  private lastClickId: string | null = null
  private bagOpen = false
  private cursor: PackCursor | null = null
  private saveMode: 'save' | 'load' | null = null

  constructor(
    private readonly root: HTMLElement,
    private readonly onPick: (pick: HudPick) => void,
    private readonly onCommand: (command: HudCommand) => void,
    private readonly onPack: (click: PackClick) => void = () => undefined,
    private readonly onDungeonPick: (pickId: DungeonPickId) => void = () => undefined,
    private readonly onSlot: (action: 'save' | 'load', id: SaveSlotId) => void = () => undefined,
  ) {
    this.root.classList.add('game-hud')
    this.root.addEventListener('pointerdown', this.onPointerDown)
    this.root.addEventListener('contextmenu', this.onContextMenu)
  }

  isBagOpen(): boolean {
    return this.bagOpen
  }

  toggleBag(): void {
    this.bagOpen = !this.bagOpen
    if (!this.bagOpen) this.cursor = null
    this.lastKey = ''
  }

  closeBag(): void {
    this.bagOpen = false
    this.cursor = null
    this.lastKey = ''
  }

  isSavesOpen(): boolean {
    return this.saveMode !== null
  }

  openSaves(mode: 'save' | 'load'): void {
    this.saveMode = this.saveMode === mode ? null : mode
    this.lastKey = ''
  }

  closeSaves(): void {
    this.saveMode = null
    this.lastKey = ''
  }

  setCursor(cursor: PackCursor | null): void {
    this.cursor = cursor
    this.lastKey = ''
  }

  render(world: WorldState, notice = ''): void {
    const model = buildHudModel(world, notice, { open: this.bagOpen, cursor: this.cursor }, {
      mode: this.saveMode,
      slots: this.saveMode ? listSlots() : [],
    })
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
    if (
      action === 'reset-view'
      || action === 'toggle-interiors'
      || action === 'restart'
      || action === 'ack-night'
      || action === 'open-sheet'
      || action === 'open-bag'
      || action === 'close-bag'
      || action === 'save'
      || action === 'load'
      || action === 'close-saves'
      || action === 'dungeon-advance'
      || action === 'dungeon-evacuate'
    ) {
      event.stopPropagation()
      if (action === 'save' || action === 'load') {
        this.openSaves(action)
        return
      }
      if (action === 'close-saves') {
        this.closeSaves()
        return
      }
      this.onCommand(action)
      return
    }
    const slot = target.closest<HTMLButtonElement>('[data-save-slot]')
    if (slot?.dataset.saveSlot && this.saveMode) {
      event.stopPropagation()
      const id = slot.dataset.saveSlot as SaveSlotId
      if (id === 'auto' || id === '1' || id === '2' || id === '3') this.onSlot(this.saveMode, id)
      return
    }
    const pick = target.closest<HTMLButtonElement>('[data-dungeon-pick]')
    if (pick?.dataset.dungeonPick) {
      event.stopPropagation()
      this.onDungeonPick(pick.dataset.dungeonPick as DungeonPickId)
      return
    }
    const hot = target.closest<HTMLButtonElement>('[data-hot-index]')
    if (hot?.dataset.hotIndex !== undefined) {
      event.stopPropagation()
      const index = Number(hot.dataset.hotIndex)
      this.onPack(event.button === 2 ? { place: 'hot-drop', index } : { place: 'hot', index })
      return
    }
    const empty = target.closest<HTMLButtonElement>('[data-bag-empty]')
    if (empty) {
      event.stopPropagation()
      this.onPack({ place: 'bag-empty' })
      return
    }
    const bag = target.closest<HTMLButtonElement>('[data-bag-item]')
    if (bag?.dataset.bagItem) {
      event.stopPropagation()
      this.onPack(event.button === 2 ? { place: 'bag-drop', itemId: bag.dataset.bagItem } : { place: 'bag', itemId: bag.dataset.bagItem })
      return
    }
    const button = target.closest<HTMLButtonElement>('[data-survivor]')
    if (!button?.dataset.survivor) return
    event.stopPropagation()
    const id = button.dataset.survivor
    if (button.dataset.downed === '1') {
      this.lastClickAt = 0
      this.lastClickId = id
      this.onPick({ id, kind: 'rescue' })
      return
    }
    const now = performance.now()
    const kind = this.lastClickId === id && now - this.lastClickAt < 320 ? 'possess' : 'select'
    this.lastClickAt = now
    this.lastClickId = id
    this.onPick({ id, kind })
  }

  private readonly onContextMenu = (event: MouseEvent): void => {
    const target = event.target
    if (!(target instanceof Element)) return
    if (target.closest('[data-hot-index], [data-bag-item], [data-bag-empty]')) {
      event.preventDefault()
      event.stopPropagation()
    }
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
    dusk: duskReturnHint(world, survivor),
    bars: [
      { key: 'hp', label: '血', value: clampVital(survivor.health) },
      { key: 'hunger', label: '饥', value: clampVital(survivor.hunger) },
      { key: 'thirst', label: '渴', value: clampVital(survivor.thirst) },
    ],
  }
}

function renderPortrait(card: HudCard): string {
  const flags = [
    card.live ? 'is-live' : '',
    card.selected ? 'is-selected' : '',
    card.downed ? 'is-downed' : '',
  ].filter(Boolean).join(' ')
  const hp = Math.round(card.bars.find((bar) => bar.key === 'hp')?.value ?? 0)
  const hunger = card.bars.find((bar) => bar.key === 'hunger')?.value ?? 100
  const thirst = card.bars.find((bar) => bar.key === 'thirst')?.value ?? 100
  const pips = [
    hunger < 40 ? '<b class="hud-pip hud-pip-hunger" title="饿"></b>' : '',
    thirst < 40 ? '<b class="hud-pip hud-pip-thirst" title="渴"></b>' : '',
  ].join('')
  return `<button type="button" class="hud-portrait ${flags}" data-survivor="${card.id}" data-downed="${card.downed ? '1' : '0'}" title="${escapeHtml(card.name)} · ${escapeHtml(card.job)} · ${escapeHtml(card.status)}">
    <span class="hud-face" aria-hidden="true">${card.portrait}</span>
    <i class="hud-hp" aria-hidden="true"><b style="width:${Math.max(4, hp)}%"></b></i>
    ${pips}
    <em>${escapeHtml(shortName(card.name))}</em>
  </button>`
}

function renderInspect(model: HudModel): string {
  const card = model.cards.find((entry) => entry.selected) ?? model.cards[0]
  if (!card) return ''
  const bars = card.bars
    .map((bar) => {
      const width = Math.max(4, Math.round(bar.value))
      return `<div class="hud-bar hud-bar-${bar.key}" title="${bar.label} ${Math.round(bar.value)}">
        <span>${bar.label}</span>
        <i><b style="width:${width}%"></b></i>
      </div>`
    })
    .join('')
  const gun = card.weapon
    ? `<p class="hud-inspect-gun">${escapeHtml(card.weapon)} <em>${INFINITE_AMMO ? '∞' : `${card.ammo ?? 0}/${card.ammoMax}`}</em></p>`
    : ''
  return `<aside class="hud-inspect${card.downed ? ' is-downed' : ''}">
    <header>
      <strong>${escapeHtml(card.name)}</strong>
      <span>${escapeHtml(card.job)}</span>
    </header>
    <p>${escapeHtml(card.status)} · 袋${card.bagUsed}/${card.bagCap}${card.dusk ? ` · ${escapeHtml(card.dusk)}` : ''}</p>
    ${bars}
    ${gun}
    <small>${card.downed ? '点头像派人救援' : 'C 装备 · 双击接管'}</small>
  </aside>`
}

function shortName(name: string): string {
  return name.slice(0, 2)
}

function duskReturnHint(world: WorldState, survivor: SurvivorState): string {
  if (insideBase(survivor.position)) return ''
  if (world.time.phase !== 'dawn' && world.time.phase !== 'day' && world.time.phase !== 'dusk') return ''
  const warehouse = findContainer(world, 'warehouse')
  if (!warehouse) return ''
  const eta = distanceXZ(survivor.position, warehouse.position) / Math.max(0.5, survivor.moveSpeed)
  const remain = world.time.phase === 'dusk' ? 0 : secondsUntilDusk(world)
  const status = duskStatus(eta, remain)
  if (status === 'green') return '能赶回'
  if (status === 'yellow') return '可能迟到'
  return '赶不回 · H召回'
}

function hotbarModel(world: WorldState, cursor: PackCursor | null): HudModel['hotbar'] {
  const focus = focusSurvivor(world)
  if (!focus) return Array.from({ length: HOTBAR_SIZE }, () => null)
  return hotbarOf(world, focus).map((entry, index) => entryToHud(world, focus, entry, index, cursor))
}

function entryToHud(
  world: WorldState,
  survivor: SurvivorState,
  entry: HotbarEntry | null,
  index: number,
  cursor: PackCursor | null,
): HudModel['hotbar'][number] {
  const picked = cursor?.place === 'hot' && cursor.index === index
  if (!entry) {
    return { index, itemId: '', label: '', line: '', equipped: false, rarity: null, count: 0, picked, tip: '' }
  }
  return {
    index,
    itemId: entry.itemId,
    label: entry.label,
    line: entry.line,
    equipped: entry.equipped,
    rarity: entry.rarity,
    count: entry.count,
    picked,
    tip: inspectHtml(inspectItem(world, survivor, entry.itemId)),
  }
}

function packModel(world: WorldState, open: boolean, cursor: PackCursor | null): HudModel['pack'] {
  const focus = focusSurvivor(world)
  const bag = focus ? world.inventories[focus.inventoryId] : undefined
  const fill = bag ? bagFill(bag) : { used: 0, capacity: 0, full: false }
  const stacks = (bag?.items ?? []).filter((item) => item.count > 0)
  const slots: HudModel['pack']['slots'] = stacks.map((item) => ({
    itemId: item.itemId,
    label: gearLabel(world, item.itemId),
    count: item.count,
    picked: cursor?.place === 'bag' && cursor.itemId === item.itemId,
    tip: focus ? inspectHtml(inspectItem(world, focus, item.itemId)) : '',
  }))
  const empties = Math.max(0, (bag?.capacity ?? 8) - stacks.length)
  for (let i = 0; i < empties; i += 1) slots.push(null)
  return {
    open,
    owner: focus?.name ?? '背包',
    used: fill.used,
    capacity: fill.capacity,
    pick: cursor ? `${cursor.place}:${cursor.place === 'bag' ? cursor.itemId : cursor.index}` : '',
    slots,
  }
}

function renderQueue(queue: QueueEntry[]): string {
  if (queue.length <= 0) return ''
  const rows = queue
    .map((row) => {
      const stuck = row.stuck ? ' is-stuck' : ''
      return `<div class="hud-queue-row${stuck}">
        <strong>${escapeHtml(row.action)}</strong>
        <span>${escapeHtml(row.name)}</span>
        <em>${escapeHtml(row.detail)}</em>
        <b>${row.progress}%</b>
      </div>`
    })
    .join('')
  return `<div class="hud-queue"><strong>施工队列</strong>${rows}</div>`
}

function renderPack(model: HudModel): string {
  if (!model.pack.open) return ''
  const cells = model.pack.slots
    .map((slot) => {
      if (!slot) return '<button type="button" class="pack-slot is-empty" data-bag-empty>空</button>'
      const on = slot.picked ? ' is-pick' : ''
      return `<button type="button" class="pack-slot${on}" data-bag-item="${escapeHtml(slot.itemId)}">
        <strong>${escapeHtml(shortHotName(slot.label))}</strong>
        <small>×${slot.count}</small>
        ${slot.tip}
      </button>`
    })
    .join('')
  return `<div class="pack">
    <header>
      <strong>${escapeHtml(model.pack.owner)}的背包 ${model.pack.used}/${model.pack.capacity}</strong>
      <span>E 使用 · 右键丢弃 · F 拆解</span>
      <button type="button" data-action="close-bag">关闭</button>
    </header>
    <div class="pack-grid">${cells}</div>
  </div>`
}

function renderHotbar(slots: HudModel['hotbar']): string {
  const cells = slots
    .map((slot, index) => {
      const picked = slot?.picked ? ' is-pick' : ''
      if (!slot || !slot.itemId) {
        return `<button type="button" class="hud-hot is-empty${picked}" data-hot-index="${index}"><em>${index + 1}</em></button>`
      }
      const rare = slot.rarity ? ` rarity-${slot.rarity}` : ''
      const on = slot.equipped ? ' is-on' : ''
      return `<button type="button" class="hud-hot${on}${picked}${rare}" data-hot-index="${index}">
        <em>${index + 1}</em>
        <strong>${escapeHtml(shortHotName(slot.label))}</strong>
        <small>${escapeHtml(slot.line)}</small>
        ${slot.tip}
      </button>`
    })
    .join('')
  return `<div class="hud-hotbar" data-hotbar-bar>${cells}</div>`
}

function shortHotName(label: string): string {
  return label.length > 8 ? `${label.slice(0, 7)}…` : label
}

function focusSurvivor(world: WorldState): SurvivorState | undefined {
  const id = world.player.controlledId ?? world.player.selectedId ?? world.player.heroId
  return world.survivors.find((entry) => entry.id === id)
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

function renderSaves(model: HudModel): string {
  if (!model.saves.mode) return ''
  const writing = model.saves.mode === 'save'
  const title = writing ? '保存到档位' : '读取档位'
  const hint = writing ? '点档位写入。自动档会在天亮、天黑和关页时自己写。' : '点有字的档位读回来。图鉴、日子、仓库都会回来。'
  const rows = model.saves.slots
    .map((slot) => {
      const empty = slot.empty || !slot.meta
      const disabled = !writing && empty ? ' disabled' : ''
      const klass = empty ? ' is-empty' : ''
      const body = empty
        ? '<span>空档</span><em>—</em>'
        : `<span>${escapeHtml(slot.meta?.name ?? '')} · ${slot.meta?.people ?? 0}人 · 大厅${slot.meta?.hall ?? 1}级</span><em>${formatSavedAt(slot.meta?.savedAt ?? 0)}</em>`
      return `<button type="button" class="save-slot${klass}" data-save-slot="${slot.id}"${disabled}>
        <strong>${escapeHtml(slot.label)}</strong>
        ${body}
      </button>`
    })
    .join('')
  return `<div class="save-panel">
    <strong>${title}</strong>
    <span>${hint}</span>
    ${rows}
    <button type="button" class="hud-reset" data-action="close-saves">关闭</button>
  </div>`
}

function formatSavedAt(stamp: number): string {
  if (stamp <= 0) return '旧档'
  const at = new Date(stamp)
  const month = at.getMonth() + 1
  const day = at.getDate()
  const hours = String(at.getHours()).padStart(2, '0')
  const minutes = String(at.getMinutes()).padStart(2, '0')
  return `${month}/${day} ${hours}:${minutes}`
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

function lootHintFor(world: WorldState, hero: SurvivorState | undefined): string {
  if (world.groundLoot.length <= 0) return ''
  if (!hero) return `地上有 ${world.groundLoot.length} 件装备，走近发光盒捡起`
  const name = nearbyLootName(world, hero.position.x, hero.position.z, 10)
  if (!name) return `地上还有 ${world.groundLoot.length} 件装备，去发光盒旁捡`
  const bag = world.inventories[hero.inventoryId]
  const full = bag ? usedSlots(bag) >= bag.capacity : false
  if (full) return `地上 ${name} · 背包满了，先按 G 卸资源再捡`
  return `地上 ${name}，走近发光盒捡起`
}

function dungeonHintFor(world: WorldState, hero: SurvivorState | undefined): string {
  if (!hero || isInDungeon(world)) return ''
  if (!nearDungeonEntrance(world, hero)) return ''
  return '山洞入口 · 按 E 进本'
}

function raidNightWarning(world: WorldState): string {
  if (world.time.phase !== 'night' && world.time.phase !== 'dusk') return ''
  if (!world.raidEntered) return ''
  if (world.raidBestRarity === 'legendary') return '带回传奇枪，今夜好打些'
  if (world.raidBestRarity === 'rare') return ''
  if (world.raidBestRarity === 'magic') return '只带回蓝枪，今夜稍难'
  return '空手回营，今夜尸潮更凶'
}

function huntNoiseWarning(world: WorldState): string {
  if (world.time.phase !== 'night' && world.time.phase !== 'dusk') return ''
  const extra = gunshotHordeExtra(world.dayGunshots)
  if (extra.wanderers + extra.runners <= 0) return ''
  const dir = loudestGunshotSector(world.dayNoise)
  const side = dir === 'north' ? '北面' : dir === 'east' ? '东面' : dir === 'west' ? '西面' : dir === 'south' ? '南面' : '四周'
  return `白天打了 ${world.dayGunshots} 枪，今夜${side}更危险`
}

function dungeonWarning(world: WorldState): string {
  if (!isInDungeon(world)) return ''
  if (world.time.phase === 'dusk' || world.time.phase === 'night') return '天黑了，赶紧撤离'
  return ''
}

function tutorialLine(world: WorldState): string {
  if (TUTORIAL_LINES.length <= 0) return ''
  const index = Math.floor(world.time.daySeconds / 12) % TUTORIAL_LINES.length
  return TUTORIAL_LINES[index] ?? TUTORIAL_LINES[0] ?? ''
}

function dungeonModel(world: WorldState): HudModel['dungeon'] {
  const run = world.dungeonRun
  if (!run || run.evacuated) return null
  const last = run.nodes.length - 1
  const atExit = run.index >= last || run.nodes[run.index]?.kind === 'exit'
  return {
    room: run.index + 1,
    total: run.nodes.length,
    picks: (run.picks ?? []).map((id) => ({ id, label: PICK_LABEL[id] })),
    canAdvance: run.roomCleared && !atExit,
    canEvacuate: true,
  }
}

function renderDungeon(model: HudModel): string {
  if (!model.dungeon) return ''
  const picks = model.dungeon.picks
    .map((pick) => `<button type="button" class="hud-reset" data-dungeon-pick="${pick.id}">${escapeHtml(pick.label)}</button>`)
    .join('')
  const advance = model.dungeon.canAdvance
    ? '<button type="button" class="hud-reset" data-action="dungeon-advance">走向下一间</button>'
    : ''
  const leave = model.dungeon.canEvacuate
    ? '<button type="button" class="hud-reset" data-action="dungeon-evacuate">撤离</button>'
    : ''
  return `<div class="hud-dungeon">
    <strong>房间 ${model.dungeon.room}/${model.dungeon.total}</strong>
    ${picks}
    ${advance}
    ${leave}
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
