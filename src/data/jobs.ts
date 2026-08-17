export interface JobDefinition {
  id: string
  category: 'field' | 'base' | 'defense'
  requiredTools: string[]
  outputItemId: string
}

export const JOB_DEFINITIONS: readonly JobDefinition[] = [
  { id: 'hunt', category: 'field', requiredTools: ['rifle', 'hunting_knife'], outputItemId: 'raw_meat' },
  { id: 'fish', category: 'field', requiredTools: ['rod'], outputItemId: 'raw_fish' },
  { id: 'scavenge', category: 'field', requiredTools: ['crowbar'], outputItemId: 'scrap' },
  { id: 'haul', category: 'base', requiredTools: [], outputItemId: '' },
  { id: 'build', category: 'base', requiredTools: ['hammer'], outputItemId: '' },
  { id: 'cook', category: 'base', requiredTools: [], outputItemId: 'meal' },
]

export const WORK_SECONDS = 4

export function jobDefinition(id: string): JobDefinition | undefined {
  return JOB_DEFINITIONS.find((entry) => entry.id === id)
}
