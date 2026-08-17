import type { GridCell, ItemStack, StructureKind } from '@/simulation/types'

export interface FacilityDefinition {
  id: string
  label: string
  kind: StructureKind
  width: number
  depth: number
  required: ItemStack[]
  buildDuration: number
  blocksNav: boolean
}

export const FACILITY_DEFINITIONS: readonly FacilityDefinition[] = [
  {
    id: 'wall',
    label: '围墙',
    kind: 'wall',
    width: 1,
    depth: 1,
    required: [{ itemId: 'wood', count: 1 }],
    buildDuration: 0.8,
    blocksNav: true,
  },
  {
    id: 'gate',
    label: '大门',
    kind: 'gate',
    width: 3,
    depth: 1,
    required: [
      { itemId: 'wood', count: 6 },
      { itemId: 'scrap', count: 2 },
    ],
    buildDuration: 2.2,
    blocksNav: true,
  },
  {
    id: 'kitchen',
    label: '厨房',
    kind: 'building',
    width: 6,
    depth: 6,
    required: [
      { itemId: 'wood', count: 16 },
      { itemId: 'scrap', count: 4 },
    ],
    buildDuration: 4,
    blocksNav: false,
  },
  {
    id: 'warehouse',
    label: '仓库',
    kind: 'building',
    width: 6,
    depth: 6,
    required: [
      { itemId: 'wood', count: 18 },
      { itemId: 'scrap', count: 6 },
    ],
    buildDuration: 4,
    blocksNav: false,
  },
  {
    id: 'hall',
    label: '市政大厅',
    kind: 'building',
    width: 6,
    depth: 6,
    required: [
      { itemId: 'wood', count: 20 },
      { itemId: 'scrap', count: 8 },
    ],
    buildDuration: 5,
    blocksNav: false,
  },
  {
    id: 'workshop',
    label: '修理厂',
    kind: 'building',
    width: 6,
    depth: 5,
    required: [
      { itemId: 'wood', count: 14 },
      { itemId: 'scrap', count: 10 },
    ],
    buildDuration: 4,
    blocksNav: false,
  },
  {
    id: 'quarters',
    label: '住房',
    kind: 'building',
    width: 14,
    depth: 8,
    required: [
      { itemId: 'wood', count: 16 },
      { itemId: 'scrap', count: 4 },
    ],
    buildDuration: 4,
    blocksNav: false,
  },
  {
    id: 'watchtower',
    label: '瞭望塔',
    kind: 'building',
    width: 2,
    depth: 2,
    required: [
      { itemId: 'wood', count: 10 },
      { itemId: 'scrap', count: 4 },
    ],
    buildDuration: 3,
    blocksNav: false,
  },
  {
    id: 'bonfire',
    label: '篝火',
    kind: 'building',
    width: 1,
    depth: 1,
    required: [{ itemId: 'wood', count: 4 }],
    buildDuration: 1.2,
    blocksNav: false,
  },
  {
    id: 'brazier',
    label: '火柱',
    kind: 'building',
    width: 1,
    depth: 1,
    required: [
      { itemId: 'wood', count: 3 },
      { itemId: 'scrap', count: 1 },
    ],
    buildDuration: 1.4,
    blocksNav: false,
  },
]

export function facilityDefinition(id: string): FacilityDefinition | undefined {
  return FACILITY_DEFINITIONS.find((entry) => entry.id === id)
}

export function facilityLabel(id: string): string {
  return facilityDefinition(id)?.label ?? id
}

export function buildProgress(structure: { stage: string; buildElapsed: number; buildDuration: number }): number {
  if (structure.stage === 'complete') return 100
  if (structure.buildDuration <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((structure.buildElapsed / structure.buildDuration) * 100)))
}

export function footprintCells(definition: FacilityDefinition, originX: number, originZ: number): GridCell[] {
  const cells: GridCell[] = []
  for (let x = 0; x < definition.width; x += 1) {
    for (let z = 0; z < definition.depth; z += 1) {
      cells.push({ x: originX + x, z: originZ + z })
    }
  }
  return cells
}

export function facilityPreviewHeight(definitionId: string): number {
  if (definitionId === 'bonfire' || definitionId === 'brazier') return 2.2
  return facilityDefinition(definitionId)?.kind === 'building' ? 4.2 : 2.6
}

export function wallLineDuration(cellCount: number): number {
  return 0.45 + Math.max(1, cellCount) * 0.05
}
