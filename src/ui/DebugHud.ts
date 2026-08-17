import { usedSlots } from '@/inventory/Inventory'
import type { WorldState } from '@/simulation/types'

export class DebugHud {
  constructor(private readonly root: HTMLElement) {}

  render(world: WorldState): void {
    const lines = world.survivors.map((survivor) => {
      const bag = world.inventories[survivor.inventoryId]
      const bagText = bag ? `${usedSlots(bag)}/${bag.capacity}` : '0/0'
      return `${survivor.name} · ${survivor.workerState} · bag ${bagText}`
    })

    this.root.innerHTML = `
      <strong>Dawn Bastion M0 skeleton</strong><br />
      Day ${world.time.dayIndex} · ${world.time.phase} · ${world.time.daySeconds.toFixed(1)}s<br />
      ${lines.join('<br />')}
    `
  }
}
