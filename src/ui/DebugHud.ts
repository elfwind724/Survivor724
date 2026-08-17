import { usedSlots } from '@/inventory/Inventory'
import type { WorldState } from '@/simulation/types'

export class DebugHud {
  constructor(private readonly root: HTMLElement) {}

  render(world: WorldState): void {
    const warehouse = world.inventories['inv-warehouse']
    const stock = warehouse
      ? warehouse.items.map((item) => `${item.itemId}:${item.count}`).join(' ')
      : 'empty'

    const lines = world.survivors.map((survivor) => {
      const bag = world.inventories[survivor.inventoryId]
      const bagText = bag ? `${usedSlots(bag)}/${bag.capacity}` : '0/0'
      const tools = survivor.carriedTools.join(',') || 'none'
      const blocked = survivor.blockedReason ? ` · ${survivor.blockedReason}` : ''
      return `${survivor.name} · ${survivor.workerState} · bag ${bagText} · tools ${tools}${blocked}`
    })

    this.root.innerHTML = `
      <strong>Dawn Bastion M0 work loop</strong><br />
      Day ${world.time.dayIndex} · ${world.time.phase} · ${world.time.daySeconds.toFixed(1)}s<br />
      Warehouse ${stock || 'empty'}<br />
      ${lines.join('<br />')}
    `
  }
}
