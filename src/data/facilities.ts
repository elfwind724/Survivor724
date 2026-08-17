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
    required: [{ itemId: 'wood', count: 4 }],
    buildDuration: 6,
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
    buildDuration: 8,
    blocksNav: true,
  },
  {
    id: 'kitchen',
    label: '厨房',
    kind: 'building',
    width: 10,
    depth: 8,
    required: [
      { itemId: 'wood', count: 24 },
      { itemId: 'scrap', count: 8 },
    ],
    buildDuration: 18,
    blocksNav: true,
  },
]

export function facilityDefinition(id: string): FacilityDefinition | undefined {
  return FACILITY_DEFINITIONS.find((entry) => entry.id === id)
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
