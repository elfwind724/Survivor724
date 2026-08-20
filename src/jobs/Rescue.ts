import { findContainer } from '@/simulation/EntityRegistry'
import { beginTravel, followTravel } from '@/navigation/Travel'
import { insideBase } from '@/survivors/Living'
import { distanceXZ, type SurvivorState, type WorldState } from '@/simulation/types'

const REACH = 1.6
const DRAG_SPEED = 0.55

export function assignedRescuer(world: WorldState, downed: SurvivorState): SurvivorState | undefined {
  const fallen = world.survivors.filter((entry) => entry.downed).sort((a, b) => a.id.localeCompare(b.id))
  const free = world.survivors.filter((entry) => !entry.downed && entry.id !== world.player.controlledId)
  const used = new Set<string>()
  const map = new Map<string, string>()
  for (const victim of fallen) {
    const rescuer = [...free]
      .filter((entry) => !used.has(entry.id))
      .sort((a, b) => distanceXZ(a.position, victim.position) - distanceXZ(b.position, victim.position))[0]
    if (!rescuer) continue
    used.add(rescuer.id)
    map.set(victim.id, rescuer.id)
  }
  const id = map.get(downed.id)
  return id ? world.survivors.find((entry) => entry.id === id) : undefined
}

export function isRescuing(world: WorldState, survivor: SurvivorState): boolean {
  if (survivor.downed) return false
  return world.survivors.some((entry) => entry.downed && assignedRescuer(world, entry)?.id === survivor.id)
}

export function rescueCaption(world: WorldState, survivor: SurvivorState): string | null {
  if (survivor.downed) {
    const helper = assignedRescuer(world, survivor)
    if (!helper) return '倒地 · 没人来救'
    if (distanceXZ(helper.position, survivor.position) <= REACH + 0.2) {
      return insideBase(survivor.position) ? '倒地 · 急救中' : '倒地 · 拖回中'
    }
    return `倒地 · ${helper.name}赶来`
  }
  if (!isRescuing(world, survivor)) return null
  const victim = world.survivors.find((entry) => entry.downed && assignedRescuer(world, entry)?.id === survivor.id)
  if (!victim) return '救援中'
  if (distanceXZ(survivor.position, victim.position) > REACH + 0.2) return `赶去救${victim.name}`
  return insideBase(victim.position) ? `急救 ${victim.name}` : `拖回 ${victim.name}`
}

export function stepDayRescue(world: WorldState, survivor: SurvivorState, dt: number): boolean {
  if (survivor.downed) return false
  const victim = world.survivors.find((entry) => entry.downed && assignedRescuer(world, entry)?.id === survivor.id)
  if (!victim) return false

  const dist = distanceXZ(survivor.position, victim.position)
  if (dist > REACH) {
    const aim = survivor.pathTarget ?? survivor.destination
    if (!aim || distanceXZ(aim, victim.position) > 2) beginTravel(world, survivor, victim.position)
    followTravel(world, survivor, dt)
    return true
  }

  if (!insideBase(victim.position)) {
    const warehouse = findContainer(world, 'warehouse')
    const home = warehouse?.position ?? survivor.homePosition
    const headingHome = survivor.pathTarget && distanceXZ(survivor.pathTarget, home) < 4
    if (!headingHome) beginTravel(world, survivor, home)
    const saved = survivor.moveSpeed
    survivor.moveSpeed = saved * DRAG_SPEED
    followTravel(world, survivor, dt)
    survivor.moveSpeed = saved
    snapCarried(victim, survivor, dt)
    return true
  }

  survivor.destination = null
  survivor.path = []
  survivor.pathTarget = null
  snapCarried(victim, survivor, dt)
  return true
}

function snapCarried(downed: SurvivorState, rescuer: SurvivorState, dt: number): void {
  downed.destination = null
  downed.path = []
  downed.pathTarget = null
  const tx = rescuer.position.x - Math.sin(rescuer.facingYaw) * 0.9
  const tz = rescuer.position.z - Math.cos(rescuer.facingYaw) * 0.9
  const dx = tx - downed.position.x
  const dz = tz - downed.position.z
  const dist = Math.hypot(dx, dz)
  const maxStep = downed.moveSpeed * dt
  if (dist <= maxStep || dist < 0.001) {
    downed.position.x = tx
    downed.position.z = tz
  } else {
    downed.position.x += (dx / dist) * maxStep
    downed.position.z += (dz / dist) * maxStep
  }
  downed.position.y = 0
}
