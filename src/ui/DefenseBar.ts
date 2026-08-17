import { reinforceSector, sectorPressure } from '@/combat/Defense'
import type { DefenseSectorId, WorldState } from '@/simulation/types'

const SECTORS: Array<{ id: DefenseSectorId; label: string }> = [
  { id: 'north', label: '北墙' },
  { id: 'east', label: '东墙' },
  { id: 'south', label: '南口' },
  { id: 'west', label: '西墙' },
]

export class DefenseBar {
  private lastKey = ''

  constructor(
    private readonly root: HTMLElement,
    private readonly onReinforce: (sector: DefenseSectorId) => void,
  ) {
    this.root.addEventListener('pointerdown', (event) => event.stopPropagation())
  }

  render(world: WorldState): void {
    const key = `${world.time.phase}:${world.enemies.length}:${world.defenseSectors.map((entry) => entry.order).join(',')}`
    if (key === this.lastKey) return
    this.lastKey = key
    const buttons = SECTORS.map((sector) => {
      const order = world.defenseSectors.find((entry) => entry.id === sector.id)?.order ?? 'hold'
      const pressure = sectorPressure(world, sector.id)
      const active = order === 'reinforce' ? ' is-active' : ''
      return `<button type="button" class="defense-card${active}" data-sector="${sector.id}">
        <strong>${sector.label}</strong>
        <span>压力 ${pressure}</span>
        <span>${order === 'reinforce' ? '增援中' : '坚守'}</span>
      </button>`
    }).join('')
    this.root.innerHTML = `<div class="defense-label">夜间防区</div><div class="defense-row">${buttons}</div>`
    this.root.querySelectorAll<HTMLButtonElement>('[data-sector]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.sector as DefenseSectorId | undefined
        if (id) {
          reinforceSector(world, id)
          this.onReinforce(id)
        }
      })
    })
  }
}
