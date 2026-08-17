import { assetById } from '@/data/assetIndex'
import { STRUCTURE_ASSETS } from '@/data/worldDressing'
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
  inBuildMenu?: boolean
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
  {
    id: 'shelter',
    label: '房屋',
    kind: 'building',
    width: 6,
    depth: 6,
    required: [
      { itemId: 'wood', count: 12 },
      { itemId: 'scrap', count: 2 },
    ],
    buildDuration: 3.2,
    blocksNav: false,
    inBuildMenu: false,
  },
]

export function facilityDefinition(id: string): FacilityDefinition | undefined {
  return FACILITY_DEFINITIONS.find((entry) => entry.id === id)
}

export function facilityLabel(id: string): string {
  return facilityDefinition(id)?.label ?? id
}

export function structureLabel(structure: { definitionId: string; visualAssetId?: string }): string {
  if (structure.visualAssetId) {
    const mapped = facilityFromAsset(structure.visualAssetId)
    if (mapped && mapped !== 'shelter') return facilityLabel(mapped)
    return creativeAssetLabel(structure.visualAssetId)
  }
  return facilityLabel(structure.definitionId)
}

const ASSET_TO_FACILITY: Record<string, string> = Object.fromEntries(
  Object.entries(STRUCTURE_ASSETS).map(([definitionId, assetId]) => [assetId, definitionId]),
)

const SCENERY_ASSET = /mountain|tree|rock|log|crop|gold|pine/

export function facilityFromAsset(assetId: string): string | undefined {
  const entry = assetById(assetId)
  if (!entry || (entry.category !== 'fort' && entry.category !== 'survival')) return undefined
  const slug = assetId.split('/')[1] ?? ''
  if (SCENERY_ASSET.test(slug)) return undefined
  const exact = ASSET_TO_FACILITY[assetId]
  if (exact && exact !== 'locker') return exact
  if (/gate/.test(slug)) return 'gate'
  if (/wall/.test(slug) && !/tower-house|watch-tower|archery-tower|stone-tower/.test(slug)) return 'wall'
  if (/watch-tower|watchtower|stone-tower|archery-tower|tower-house/.test(slug)) return 'watchtower'
  if (slug === 'bonfire') return 'bonfire'
  if (/torch/.test(slug)) return 'brazier'
  if (isCreativeBuildingSlug(slug)) return 'shelter'
  return undefined
}

export function creativeFootprint(assetId: string, definitionId: string): { width: number; depth: number } {
  const definition = facilityDefinition(definitionId)
  if (!definition) return { width: 6, depth: 6 }
  if (definitionId !== 'shelter') return { width: definition.width, depth: definition.depth }
  const slug = assetId.split('/')[1] ?? ''
  if (/castle|fortress|wonder/.test(slug)) return { width: 10, depth: 10 }
  if (/farm|windmill|market|temple|barrack|town/.test(slug)) return { width: 8, depth: 8 }
  if (/tent/.test(slug)) return { width: 3, depth: 3 }
  return { width: 6, depth: 6 }
}

function isCreativeBuildingSlug(slug: string): boolean {
  return /house|hut|barrack|castle|fortress|temple|farm|windmill|dock|port|market|mine|encampment|monument|wonder|business|archery|town-center|shack|storage|shed|tent|hall/.test(slug)
}

function creativeAssetLabel(assetId: string): string {
  const slug = assetId.split('/')[1] ?? assetId
  if (/castle/.test(slug)) return '城堡'
  if (/fortress/.test(slug)) return '要塞'
  if (/farm/.test(slug)) return '农场'
  if (/temple/.test(slug)) return '神殿'
  if (/windmill/.test(slug)) return '风车'
  if (/barrack/.test(slug)) return '营房'
  if (/market/.test(slug)) return '市集'
  if (/dock|port/.test(slug)) return '码头'
  if (/house|hut/.test(slug)) return '房屋'
  if (/tent/.test(slug)) return '帐篷'
  if (/mine/.test(slug)) return '矿坑'
  if (/shack|shed|storage/.test(slug)) return '工棚'
  if (/temple|wonder|monument/.test(slug)) return '神殿'
  return assetById(assetId)?.name ?? '房屋'
}

export function buildProgress(structure: { stage: string; buildElapsed: number; buildDuration: number }): number {
  if (structure.stage === 'complete') return 100
  if (structure.buildDuration <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((structure.buildElapsed / structure.buildDuration) * 100)))
}

export function demolishDuration(cellCount: number): number {
  return 2.2 + Math.min(4, Math.max(1, cellCount) * 0.18)
}

export function durabilityPercent(structure: { hp: number; maxHp: number }): number {
  if (structure.maxHp <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((structure.hp / structure.maxHp) * 100)))
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
