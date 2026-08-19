import type { DungeonNodeDef, DungeonPickId } from '@/data/dungeon'

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
  | 'Eat'
  | 'Rest'
  | 'RestOrNextJob'

export type WorkerBlockedReason = 'missing_tool' | 'warehouse_full' | 'route_blocked' | null

export type StructureKind = 'wall' | 'gate' | 'building'
export type StructureStage = 'blueprint' | 'hauling' | 'building' | 'complete' | 'demolishing'

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
  level: number
  upgrading: boolean
  upgradeRequired: ItemStack[]
  upgradeElapsed: number
  upgradeDuration: number
  visualAssetId?: string
  yaw?: number
  placedBy?: 'creative'
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

export type EquipSlot = 'hat' | 'clothes' | 'gloves' | 'shoes' | 'weapon' | 'tool'

export type ItemRarity = 'common' | 'magic' | 'rare' | 'legendary'

export type WeaponProc =
  | 'double'
  | 'triple'
  | 'scatter'
  | 'split'
  | 'pierce'
  | 'explode'
  | 'lightning'
  | 'burn'
  | 'freeze'
  | 'poison'
  | 'paralyze'

export interface AffixRoll {
  id: 'min_dmg' | 'max_dmg' | 'aspd' | 'crit' | 'crit_dmg' | 'knockback' | 'charm' | 'str' | 'agi' | 'con' | 'int'
  label: string
  value: number
}

export interface GearPiece {
  id: string
  baseId: string
  slot: EquipSlot
  rarity: ItemRarity
  plus: number
  affixes: AffixRoll[]
  procs: WeaponProc[]
  name: string
}

export interface SurvivorAttributes {
  strength: number
  agility: number
  constitution: number
  intelligence: number
}

export type SkillId =
  | 'hunt'
  | 'fish'
  | 'gather'
  | 'cook'
  | 'scavenge'
  | 'build'
  | 'haul'
  | 'marksmanship'
  | 'combat'
  | 'survival'

export interface SkillState {
  level: number
  xp: number
}

export interface EquipmentLoadout {
  hat: string | null
  clothes: string | null
  gloves: string | null
  shoes: string | null
  weapon: string | null
  tool: string | null
}

export type EnhanceLoadout = Record<EquipSlot, number>

export interface SurvivorState {
  id: string
  name: string
  professionId: string
  position: Vec3
  destination: Vec3 | null
  homePosition: Vec3
  moveSpeed: number
  health: number
  hunger: number
  thirst: number
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
  weaponAmmo: Record<string, number>
  fireCooldown: number
  fireCooldownMax: number
  nightPostId: string | null
  watchPostId: string | null
  indoorId: string | null
  downed: boolean
  level: number
  xp: number
  attrPoints: number
  spendOwnPoints: boolean
  attributes: SurvivorAttributes
  equipment: EquipmentLoadout
  enhance: EnhanceLoadout
  hotbar: Array<ItemStack | null>
  lastYieldItem: string | null
  lastYieldCount: number
  lastYieldXp: number
  lastYieldAt: number
  skills: Record<SkillId, SkillState>
}

export type CameraView = 'topdown' | 'firstperson'

export interface PlayerState {
  heroId: string
  selectedId: string | null
  controlledId: string | null
  view: CameraView
}

export interface NightLoot {
  itemId: string
  label: string
  count: number
}

export interface NightReport {
  day: number
  outcome: 'won' | 'lost'
  kills: number
  spawned: number
  downed: number
  wallsLost: number
  loot: NightLoot[]
  reason: string
}

export interface EnemyState {
  id: string
  kind: 'wanderer' | 'runner'
  position: Vec3
  health: number
  moveSpeed: number
  facingYaw: number
  attackCooldown: number
  hitFlash: number
  burn: number
  freeze: number
  poison: number
  paralyze: number
  charm: number
}

export interface ImpactState {
  id: string
  kind: 'muzzle' | 'hit' | 'kill'
  position: Vec3
  life: number
  maxLife: number
}

export type WildlifeKind = 'deer' | 'stag' | 'fox' | 'wolf' | 'cow' | 'bull' | 'horse' | 'alpaca' | 'donkey'
export type WildlifeHabitat = 'forest' | 'grass' | 'river'
export type WildlifeMood = 'graze' | 'wander' | 'flee'

export interface WildlifeState {
  id: string
  kind: WildlifeKind
  habitat: WildlifeHabitat
  herdId: string
  position: Vec3
  home: Vec3
  destination: Vec3 | null
  facingYaw: number
  health: number
  maxHealth: number
  alive: boolean
  mood: WildlifeMood
  fleeTimer: number
  harvested: boolean
  respawnIn: number
  butcherElapsed: number
}

export interface ProjectileState {
  id: string
  ownerId: string
  weaponId: string
  position: Vec3
  velocity: Vec3
  damage: number
  remaining: number
  range: number
  pierce: number
  explode: number
  split: boolean
  lightning: boolean
  knockback: number
  charm: number
  status: 'burn' | 'freeze' | 'poison' | 'paralyze' | null
  crit: boolean
  hitIds: string[]
}

export type DefenseSectorId = 'north' | 'east' | 'west' | 'south'

export interface NightPost {
  id: string
  sector: DefenseSectorId
  position: Vec3
  facingYaw: number
  occupantId: string | null
  rangeBonus: number
}

export interface DefenseSector {
  id: DefenseSectorId
  order: 'hold' | 'reinforce' | 'fallback'
}

export interface ResourceNodeState {
  id: string
  kind: 'hunt' | 'fish' | 'scavenge' | 'wood' | 'berry' | 'water'
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

export interface DecorationState {
  id: string
  assetId: string
  x: number
  z: number
  yaw: number
  scale: number
}

export interface GroundLoot {
  id: string
  gearId: string
  x: number
  z: number
}

export interface DungeonRun {
  dayIndex: number
  seed: string
  nodes: DungeonNodeDef[]
  index: number
  roomCleared: boolean
  picks: DungeonPickId[] | null
  evacuated: boolean
  spawnedRooms: number[]
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
  gear: Record<string, GearPiece>
  groundLoot: GroundLoot[]
  nightPosts: NightPost[]
  lastPhase: DayPhase
  nightSpawnedDay: number
  defenseSectors: DefenseSector[]
  decorations: DecorationState[]
  scenery: DecorationState[]
  projectiles: ProjectileState[]
  impacts: ImpactState[]
  rosterStrategy: string | null
  showInteriors: boolean
  nightKills: number
  nightSpawned: number
  nightWalls: number
  nightReport: NightReport | null
  gameOver: boolean
  paused: boolean
  worldSeed: string
  dungeonRun: DungeonRun | null
  debugInfiniteAmmo?: boolean
  raidEntered: boolean
  raidBestRarity: ItemRarity | null
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
