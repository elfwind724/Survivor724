import { derivedStats, EQUIP_SLOTS, equipmentById } from '@/data/equipment'
import { availableForSlot, equipItem, unequipSlot } from '@/survivors/Equipment'
import { findSurvivor } from '@/simulation/EntityRegistry'
import type { EquipSlot, SurvivorState, WorldState } from '@/simulation/types'
import { survivorPortrait } from './GameHud'

const JOB_LABEL: Record<string, string> = {
  hunter: '猎手',
  fisher: '渔手',
  scavenger: '搜刮',
  hauler: '搬运',
  builder: '工匠',
}

export class CharacterSheet {
  private openId: string | null = null
  private pickSlot: EquipSlot | null = null
  private lastKey = ''

  constructor(private readonly root: HTMLElement) {
    this.root.classList.add('sheet-root')
    this.root.addEventListener('pointerdown', (event) => event.stopPropagation())
  }

  isOpen(): boolean {
    return this.openId !== null
  }

  open(id: string): void {
    this.openId = id
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
    const key = sheetKey(world, survivor, this.pickSlot)
    if (key === this.lastKey) return
    this.lastKey = key
    this.root.innerHTML = renderSheet(world, survivor, this.pickSlot)
    this.bind(world, survivor)
  }

  private bind(world: WorldState, survivor: SurvivorState): void {
    this.root.querySelector('[data-close]')?.addEventListener('click', () => this.close())
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
  }
}

function sheetKey(world: WorldState, survivor: SurvivorState, pick: EquipSlot | null): string {
  const stats = derivedStats(survivor.attributes, survivor.equipment)
  return [
    survivor.id,
    pick ?? '-',
    survivor.health,
    survivor.moveSpeed.toFixed(2),
    Object.values(survivor.equipment).join(','),
    `${stats.total.strength}/${stats.total.agility}/${stats.total.constitution}/${stats.total.intelligence}`,
    world.inventories['inv-warehouse']?.items.map((item) => `${item.itemId}:${item.count}`).join(',') ?? '',
  ].join('|')
}

function renderSheet(world: WorldState, survivor: SurvivorState, pick: EquipSlot | null): string {
  const stats = derivedStats(survivor.attributes, survivor.equipment)
  const slots = EQUIP_SLOTS.map((slot) => {
    const worn = survivor.equipment[slot.id]
    const item = worn ? equipmentById(worn) : undefined
    const on = pick === slot.id ? ' is-on' : ''
    return `<button type="button" class="sheet-slot sheet-slot-${slot.id}${on}" data-slot="${slot.id}">
      <em>${slot.label}</em>
      <span>${item ? item.label : '空'}</span>
    </button>`
  }).join('')
  const attrs = (
    [
      ['力量', stats.total.strength, survivor.attributes.strength, `攻击 ${stats.attackPower}`],
      ['敏捷', stats.total.agility, survivor.attributes.agility, `攻速 ${stats.attackCooldown.toFixed(2)}秒 · 移速 ${stats.moveSpeed.toFixed(1)}`],
      ['体质', stats.total.constitution, survivor.attributes.constitution, `生命 ${Math.ceil(survivor.health)}/${stats.maxHealth} · 防御 ${stats.defense}`],
      ['智力', stats.total.intelligence, survivor.attributes.intelligence, `设施 ${stats.workRate.toFixed(2)}倍`],
    ] as const
  )
    .map(([label, total, base, detail]) => {
      const bonus = total - base
      const width = Math.max(6, Math.min(100, total * 5))
      return `<div class="sheet-stat">
        <div><strong>${label} ${total}</strong><small>${bonus >= 0 ? `+${bonus}` : bonus} 基础${base}</small></div>
        <i><b style="width:${width}%"></b></i>
        <span>${detail}</span>
      </div>`
    })
    .join('')

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

  return `
    <div class="sheet">
      <header class="sheet-head">
        <strong>${survivor.name}</strong>
        <span>${JOB_LABEL[survivor.professionId] ?? survivor.professionId}</span>
        <button type="button" data-close>关闭</button>
      </header>
      <div class="sheet-body">
        <div class="sheet-doll">
          ${slots}
          <div class="sheet-avatar">${survivorPortrait(survivor)}</div>
        </div>
        <div class="sheet-stats">${attrs}</div>
      </div>
      ${picker}
    </div>
  `
}

function attrShort(key: string): string {
  if (key === 'strength') return '力'
  if (key === 'agility') return '敏'
  if (key === 'constitution') return '体'
  return '智'
}
