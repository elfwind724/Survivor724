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

export type WorkerBlockedReason = 'missing_tool' | 'warehouse_full' | 'route_blocked' | null

export type StructureKind = 'wall' | 'gate' | 'building'
export type StructureStage = 'blueprint' | 'hauling' | 'building' | 'complete'

export interface GridCell {
  x: number
  z: number
}

export interface NavGridState {
  originX: number
  originZ: number
  cellSize: number
  width: number
  height: number
  blocked: number[]
  version: number
}

export interface StructureState {
  id: string
  definitionId: string
  kind: StructureKind
  cells: GridCell[]
  stage: StructureStage
  inventoryId: string
  required: ItemStack[]
  buildElapsed: number
  buildDuration: number
  open: boolean
  hp: number
  maxHp: number
}

export interface WorkZoneState {
  id: string
  jobDefinitionId: string
  minX: number
  minZ: number
  maxX: number
  maxZ: number
}

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
  path: Vec3[]
  pathTarget: Vec3 | null
  pathVersion: number
  facingYaw: number
  ammo: number
  fireCooldown: number
  nightPostId: string | null
  downed: boolean
}

export type CameraView = 'topdown' | 'firstperson'

export interface PlayerState {
  selectedId: string | null
  controlledId: string | null
  view: CameraView
}

export interface EnemyState {
  id: string
  kind: 'wanderer' | 'runner'
  position: Vec3
  health: number
  moveSpeed: number
  facingYaw: number
  attackCooldown: number
}

export interface WildlifeState {
  id: string
  kind: 'deer'
  position: Vec3
  health: number
  alive: boolean
}

export type DefenseSectorId = 'north' | 'east' | 'west' | 'south'

export interface NightPost {
  id: string
  sector: DefenseSectorId
  position: Vec3
  facingYaw: number
  occupantId: string | null
}

export interface DefenseSector {
  id: DefenseSectorId
  order: 'hold' | 'reinforce' | 'fallback'
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
  nav: NavGridState
  navDirty: boolean
  structures: StructureState[]
  workZones: WorkZoneState[]
  player: PlayerState
  enemies: EnemyState[]
  wildlife: WildlifeState[]
  nightPosts: NightPost[]
  lastPhase: DayPhase
  nightSpawnedDay: number
  defenseSectors: DefenseSector[]
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
