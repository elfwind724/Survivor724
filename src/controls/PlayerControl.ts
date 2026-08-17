import { firstPersonWish, turnYaw } from '@/controls/CameraWish'
import { isBlocked, worldToCell } from '@/navigation/NavGrid'
import { findSurvivor } from '@/simulation/EntityRegistry'
import type { SurvivorState, WorldState } from '@/simulation/types'

export interface ControlIntent {
  wishX: number
  wishZ: number
  faceX: number | null
  faceZ: number | null
  yawDelta: number
}

export function controlledSurvivor(world: WorldState): SurvivorState | undefined {
  return world.player.controlledId ? findSurvivor(world, world.player.controlledId) : undefined
}

export function selectedSurvivor(world: WorldState): SurvivorState | undefined {
  return world.player.selectedId ? findSurvivor(world, world.player.selectedId) : undefined
}

export function possessSurvivor(world: WorldState, id: string): boolean {
  const survivor = findSurvivor(world, id)
  if (!survivor) return false
  world.player.selectedId = id
  world.player.controlledId = id
  survivor.path = []
  survivor.destination = null
  survivor.pathTarget = null
  return true
}

export function releaseControl(world: WorldState): void {
  const survivor = controlledSurvivor(world)
  world.player.controlledId = null
  world.player.view = 'topdown'
  if (!survivor) return
  survivor.path = []
  survivor.destination = null
  survivor.pathTarget = null
  if (survivor.workerState === 'TravelToTarget' || survivor.workerState === 'AcquireEquipment' || survivor.workerState === 'ReturnToBase' || survivor.workerState === 'ReturnEquipment') {
    survivor.workerState = 'RestOrNextJob'
  }
}

export function cycleControlled(world: WorldState): void {
  if (world.survivors.length === 0) return
  const currentId = world.player.controlledId ?? world.player.selectedId
  const index = world.survivors.findIndex((survivor) => survivor.id === currentId)
  const next = world.survivors[(index + 1) % world.survivors.length]
  if (!next) return
  if (world.player.controlledId) possessSurvivor(world, next.id)
  else world.player.selectedId = next.id
}

export function stepPlayerControl(world: WorldState, dt: number, intent: ControlIntent): void {
  const survivor = controlledSurvivor(world)
  if (!survivor) return

  if (world.player.view === 'firstperson') {
    survivor.facingYaw = turnYaw(survivor.facingYaw, intent.yawDelta)
    const wish = firstPersonWish(intent.wishX, intent.wishZ, survivor.facingYaw)
    moveWithCollision(world, survivor, wish.x, wish.z, dt)
    return
  }

  moveWithCollision(world, survivor, intent.wishX, intent.wishZ, dt)
  if (intent.faceX !== null && intent.faceZ !== null) {
    const dx = intent.faceX - survivor.position.x
    const dz = intent.faceZ - survivor.position.z
    if (Math.hypot(dx, dz) > 0.05) survivor.facingYaw = Math.atan2(dx, dz)
  } else if (intent.wishX !== 0 || intent.wishZ !== 0) {
    survivor.facingYaw = Math.atan2(intent.wishX, intent.wishZ)
  }
}

function moveWithCollision(world: WorldState, survivor: SurvivorState, wishX: number, wishZ: number, dt: number): void {
  const length = Math.hypot(wishX, wishZ)
  if (length < 1e-6) return
  const step = survivor.moveSpeed * dt
  const dx = (wishX / length) * step
  const dz = (wishZ / length) * step
  tryAxis(world, survivor, dx, 0)
  tryAxis(world, survivor, 0, dz)
}

function tryAxis(world: WorldState, survivor: SurvivorState, dx: number, dz: number): void {
  const next = { x: survivor.position.x + dx, y: 0, z: survivor.position.z + dz }
  if (isBlocked(world.nav, worldToCell(world.nav, next))) return
  survivor.position.x = next.x
  survivor.position.z = next.z
}
