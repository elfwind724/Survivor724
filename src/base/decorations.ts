import { assetById } from '@/data/assetIndex'
import { suggestedScale } from '@/render/ModelFit'
import type { DecorationState, WorldState } from '@/simulation/types'

const STORAGE_KEY = 'dawn-bastion-decorations'
const SNAP = 0.5

export function snapDecor(value: number): number {
  return Math.round(value / SNAP) * SNAP
}

export function placeDecoration(
  world: WorldState,
  assetId: string,
  x: number,
  z: number,
  yaw = 0,
  scale?: number,
): DecorationState | null {
  const entry = assetById(assetId)
  if (!entry || entry.category === 'people') return null
  const decoration: DecorationState = {
    id: `decor-${world.decorations.length + 1}-${entry.id.replaceAll('/', '-')}`,
    assetId,
    x: snapDecor(x),
    z: snapDecor(z),
    yaw,
    scale: scale ?? suggestedScale(entry),
  }
  world.decorations.push(decoration)
  persistDecorations(world)
  return decoration
}

export function removeDecoration(world: WorldState, id: string): boolean {
  const index = world.decorations.findIndex((entry) => entry.id === id)
  if (index < 0) return false
  world.decorations.splice(index, 1)
  persistDecorations(world)
  return true
}

export function decorationNear(world: WorldState, x: number, z: number, radius = 3): DecorationState | undefined {
  let best: DecorationState | undefined
  let bestDist = radius
  for (const decoration of world.decorations) {
    const distance = Math.hypot(decoration.x - x, decoration.z - z)
    if (distance < bestDist) {
      best = decoration
      bestDist = distance
    }
  }
  return best
}

export function loadDecorations(): DecorationState[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as DecorationState[]
    if (!Array.isArray(parsed)) return []
    const cleaned = parsed.filter(
      (entry) =>
        typeof entry?.id === 'string' &&
        typeof entry.assetId === 'string' &&
        !entry.assetId.startsWith('people/') &&
        Number.isFinite(entry.x) &&
        Number.isFinite(entry.z) &&
        Number.isFinite(entry.yaw) &&
        Number.isFinite(entry.scale),
    )
    if (cleaned.length !== parsed.length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned))
    }
    return cleaned
  } catch {
    return []
  }
}

export function persistDecorations(world: WorldState): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(world.decorations))
}

export function clearDecorations(world: WorldState): void {
  world.decorations = []
  persistDecorations(world)
}
