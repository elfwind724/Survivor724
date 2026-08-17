import { usedSlots } from '@/inventory/Inventory'
import type { WorldState } from '@/simulation/types'

export class DebugHud {
  constructor(private readonly root: HTMLElement) {}

  render(world: WorldState, notice = '', buildMode = 'none', zoneJob = 'hunt'): void {
    const warehouse = world.inventories['inv-warehouse']
    const stock = warehouse
      ? warehouse.items.map((item) => `${item.itemId}:${item.count}`).join(' ')
      : 'empty'

    const sites = world.structures
      .filter((structure) => structure.stage !== 'complete')
      .map((structure) => `${structure.definitionId}:${structure.stage}`)
      .join(' ')

    const lines = world.survivors.map((survivor) => {
      const bag = world.inventories[survivor.inventoryId]
      const bagText = bag ? `${usedSlots(bag)}/${bag.capacity}` : '0/0'
      const tools = survivor.carriedTools.join(',') || 'none'
      const blocked = survivor.blockedReason ? ` · ${survivor.blockedReason}` : ''
      const mark = survivor.id === world.player.controlledId ? '▶ ' : survivor.id === world.player.selectedId ? '· ' : '  '
      return `${mark}${survivor.name} · ${survivor.workerState} · bag ${bagText} · tools ${tools}${blocked}`
    })

    const controlled = world.survivors.find((survivor) => survivor.id === world.player.controlledId)

    this.root.innerHTML = `
      <strong>Dawn Bastion</strong><br />
      操控 ${controlled?.name ?? '（观察中）'} · ${world.player.view}<br />
      Day ${world.time.dayIndex} · ${world.time.phase} · ${world.time.daySeconds.toFixed(1)}s<br />
      Build ${buildMode} · Zone ${zoneJob}<br />
      Warehouse ${stock || 'empty'}<br />
      Sites ${sites || 'none'}<br />
      ${lines.join('<br />')}<br />
      <span>${notice}</span>
    `
  }
}
