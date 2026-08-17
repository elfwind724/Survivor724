import { usedSlots } from '@/inventory/Inventory'
import { duskStatus, secondsUntilDusk } from '@/simulation/TimeSystem'
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

    const remaining = secondsUntilDusk(world)
    const lines = world.survivors.map((survivor) => {
      const bag = world.inventories[survivor.inventoryId]
      const bagText = bag ? `${usedSlots(bag)}/${bag.capacity}` : '0/0'
      const tools = survivor.carriedTools.join(',') || 'none'
      const blocked = survivor.blockedReason ? ` · ${survivor.blockedReason}` : ''
      const mark = survivor.id === world.player.controlledId ? '▶ ' : survivor.id === world.player.selectedId ? '· ' : '  '
      const eta = Math.hypot(survivor.position.x, survivor.position.z) / Math.max(0.5, survivor.moveSpeed)
      const dusk = duskStatus(eta, remaining)
      const down = survivor.downed ? ' · 倒地' : ''
      return `${mark}${survivor.name} · ${survivor.workerState} · ${dusk} · bag ${bagText} · 弹${survivor.ammo}${blocked}${down}`
    })

    const controlled = world.survivors.find((survivor) => survivor.id === world.player.controlledId)

    this.root.innerHTML = `
      <strong>Dawn Bastion</strong><br />
      操控 ${controlled?.name ?? '（观察中）'} · ${world.player.view} · HP ${controlled ? Math.ceil(controlled.health) : '-'} · 弹 ${controlled?.ammo ?? '-'}<br />
      Day ${world.time.dayIndex} · ${world.time.phase} · ${world.time.daySeconds.toFixed(0)}s · ${world.time.timeScale}× · 敌 ${world.enemies.length}<br />
      Build ${buildMode} · Zone ${zoneJob}<br />
      Warehouse ${stock || 'empty'}<br />
      Sites ${sites || 'none'}<br />
      ${lines.join('<br />')}<br />
      <span>${notice}</span>
    `
  }
}
