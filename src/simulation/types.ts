export interface Vec3 {
  x: number
  y: number
  z: number
}

export type DayPhase = 'dawn' | 'day' | 'dusk' | 'night' | 'aftermath'

export type DayWorkerState =
  | 'Idle'
  | 'AcquireEquipment'
  | 'TravelToTarget'
  | 'Work'
  | 'CollectOutput'
  | 'ReturnToBase'
  | 'DepositItems'
  | 'ReturnEquipment'
  | 'RestOrNextJob'

export type WorkerBlockedReason = 'missing_tool' | 'warehouse_full' | null

export interface TimeState {
  dayIndex: number
  daySeconds: number
  dayLengthSeconds: number
  timeScale: number
  phase: DayPhase
}

export interface ItemStack {
  itemId: string
  count: number
}

export interface InventoryState {
  id: string
  capacity: number
  items: ItemStack[]
}

export interface SurvivorState {
  id: string
  name: string
  professionId: string
  position: Vec3
  destination: Vec3 | null
  homePosition: Vec3
  moveSpeed: number
  health: number
  fatigue: number
  morale: number
  inventoryId: string
  dayAssignment: string | null
  currentJobId: string | null
  workerState: DayWorkerState
  workElapsed: number
  carriedTools: string[]
  returnFill: number
  blockedReason: WorkerBlockedReason
}

export interface ResourceNodeState {
  id: string
  kind: 'hunt' | 'fish' | 'scavenge' | 'wood'
  position: Vec3
  reserve: number
  requiredToolId: string | null
}

export interface ContainerState {
  id: string
  kind: 'warehouse' | 'backpack' | 'ground' | 'tool_locker'
  position: Vec3
  inventoryId: string
}

export interface JobRecord {
  id: string
  definitionId: string
  targetId: string
  assigneeId: string | null
}

export interface WorldState {
  time: TimeState
  survivors: SurvivorState[]
  inventories: Record<string, InventoryState>
  nodes: ResourceNodeState[]
  containers: ContainerState[]
  jobs: JobRecord[]
}

export function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z }
}

export function cloneVec3(value: Vec3): Vec3 {
  return { x: value.x, y: value.y, z: value.z }
}

export function distanceXZ(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}
