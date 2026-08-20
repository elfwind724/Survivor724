import { buildProgress, structureLabel } from '@/data/facilities'
import { itemLabel } from '@/data/items'
import { countItem } from '@/inventory/Inventory'
import { findSurvivor } from '@/simulation/EntityRegistry'
import type { StructureState, WorldState } from '@/simulation/types'
import { structureLevel, upgradeProgress, warehouseHasUpgradeMats } from './upgrade'

export interface QueueEntry {
  id: string
  name: string
  action: string
  progress: number
  detail: string
  stuck: boolean
}

export function buildQueue(world: WorldState): QueueEntry[] {
  const rows: QueueEntry[] = []
  for (const structure of world.structures) {
    const row = queueRow(world, structure)
    if (row) rows.push(row)
  }
  const rank = (row: QueueEntry) => {
    if (row.action === '升级') return 0
    if (row.action === '拆除') return 1
    if (row.action === '建造') return 2
    if (row.action === '搬运') return 3
    return 4
  }
  return rows.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'zh'))
}

function queueRow(world: WorldState, structure: StructureState): QueueEntry | null {
  const name = structureLabel(structure)
  if (structure.upgrading) {
    const worker = workerOn(world, structure.id, 'upgrade')
    const missing = missingUpgradeMats(world, structure)
    const progress = upgradeProgress(structure)
    let detail = worker ? `${worker}施工中` : '等工匠'
    let stuck = !worker
    if (missing) {
      detail = missing
      stuck = true
    } else if (worker && progress <= 0) {
      detail = `${worker}正在赶来`
      stuck = false
    }
    return {
      id: structure.id,
      name: `${name} ${structureLevel(structure)}→${structureLevel(structure) + 1}`,
      action: '升级',
      progress,
      detail,
      stuck,
    }
  }
  if (structure.stage === 'demolishing') {
    const worker = workerOn(world, structure.id, 'demolish')
    return {
      id: structure.id,
      name,
      action: '拆除',
      progress: buildProgress(structure),
      detail: worker ? `${worker}拆除中` : '等工匠来拆',
      stuck: !worker,
    }
  }
  if (structure.stage === 'complete') return null
  if (structure.stage === 'building') {
    const worker = workerOn(world, structure.id, 'build')
    return {
      id: structure.id,
      name,
      action: '建造',
      progress: buildProgress(structure),
      detail: worker ? `${worker}施工中` : '材料齐了，等工匠',
      stuck: !worker,
    }
  }
  const worker = workerOn(world, structure.id, 'haul')
  return {
    id: structure.id,
    name,
    action: '搬运',
    progress: buildProgress(structure),
    detail: worker ? `${worker}送料中` : '等搬运把材料送到工地',
    stuck: !worker,
  }
}

function workerOn(world: WorldState, structureId: string, definitionId: string): string | null {
  const job = world.jobs.find((entry) => entry.definitionId === definitionId && entry.targetId === structureId && entry.assigneeId)
  if (!job?.assigneeId) return null
  return findSurvivor(world, job.assigneeId)?.name ?? null
}

function missingUpgradeMats(world: WorldState, structure: StructureState): string | null {
  if (warehouseHasUpgradeMats(world, structure)) return null
  const stock = world.inventories['inv-warehouse']
  if (!stock) return '没有仓库'
  const bits = structure.upgradeRequired
    .map((item) => {
      const have = countItem(stock, item.itemId)
      const need = item.count - have
      return need > 0 ? `${itemLabel(item.itemId)}${need}` : null
    })
    .filter((entry): entry is string => !!entry)
  return bits.length > 0 ? `仓库缺 ${bits.join(' ')}` : '仓库缺材料'
}
