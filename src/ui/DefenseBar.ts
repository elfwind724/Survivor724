import { reinforceSector, sectorLabel, sectorPressure } from '@/combat/Defense'
import { sectorHasRepairOrder, sectorWallHp } from '@/combat/Night'
import { commandLocked } from '@/dungeon/Dungeon'
import type { DefenseSectorId, WorldState } from '@/simulation/types'

const SECTORS: DefenseSectorId[] = ['north', 'east', 'south', 'west']

export class DefenseBar {
  private lastKey = ''

  constructor(
    private readonly root: HTMLElement,
    private readonly onReinforce: (sector: DefenseSectorId) => void,
    private readonly onRepair: (sector: DefenseSectorId) => void = () => undefined,
  ) {
    this.root.addEventListener('pointerdown', (event) => event.stopPropagation())
  }

  render(world: WorldState): void {
    const hp = SECTORS.map((id) => sectorWallHp(world, id)).join(',')
    const locked = commandLocked(world)
    const key = `${world.time.phase}:${world.enemies.length}:${world.defenseSectors.map((entry) => entry.order).join(',')}:${world.nightRepairIds.join(',')}:${hp}:${locked ? 1 : 0}`
    if (key === this.lastKey) return
    this.lastKey = key
    if (locked) {
      this.root.innerHTML = `<div class="defense-label">夜间防区</div><p class="defense-lock">你还在洞里 · 今夜失去实时指挥，基地按岗位自主守夜</p>`
      return
    }
    const cards = SECTORS.map((id) => {
      const order = world.defenseSectors.find((entry) => entry.id === id)?.order ?? 'hold'
      const pressure = sectorPressure(world, id)
      const wall = sectorWallHp(world, id)
      const active = order === 'reinforce' ? ' is-active' : ''
      const patch = sectorHasRepairOrder(world, id) ? ' is-repair' : ''
      return `<div class="defense-card${active}${patch}">
        <strong>${sectorLabel(id)}</strong>
        <span>压力 ${pressure} · 墙 ${wall}%</span>
        <span class="defense-acts">
          <button type="button" data-reinforce="${id}">增援</button>
          <button type="button" data-repair="${id}">抢修</button>
        </span>
      </div>`
    }).join('')
    this.root.innerHTML = `<div class="defense-label">夜间防区 · 点墙也可派人修</div><div class="defense-row">${cards}</div>`
    this.root.querySelectorAll<HTMLButtonElement>('[data-reinforce]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.reinforce as DefenseSectorId | undefined
        if (!id) return
        reinforceSector(world, id)
        this.onReinforce(id)
      })
    })
    this.root.querySelectorAll<HTMLButtonElement>('[data-repair]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.repair as DefenseSectorId | undefined
        if (id) this.onRepair(id)
      })
    })
  }
}
