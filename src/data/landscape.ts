import { BASE } from '@/simulation/baseLayout'

export const RIVER_SPINE: Array<[number, number]> = [
  [-40, 10],
  [-52, 24],
  [-64, 36],
  [-78, 50],
  [-94, 66],
  [-112, 84],
]

export const RIVER_WIDTH = 15

export interface GroundStrip {
  x: number
  z: number
  yaw: number
  length: number
  width: number
}

export function riverStrips(): GroundStrip[] {
  return stripsAlong(RIVER_SPINE, RIVER_WIDTH)
}

export function roadStrips(): GroundStrip[] {
  return [
    ...stripsAlong([[BASE.east + 1, 0], [48, -8], [62, -18]], 5.5),
    ...stripsAlong([[BASE.west - 1, 0], [-40, 12], [-50, 24]], 5.5),
    ...stripsAlong([[0, BASE.north + 1], [12, 42], [28, 50]], 5.2),
    ...stripsAlong([[0, BASE.south - 1], [6, -42], [10, -58]], 5.2),
  ]
}

export function pointNearRiver(x: number, z: number, pad = 0): boolean {
  return distToRiver(x, z) <= (RIVER_WIDTH + pad) / 2
}

export function distToRiver(x: number, z: number): number {
  let best = Number.POSITIVE_INFINITY
  for (let i = 0; i < RIVER_SPINE.length - 1; i += 1) {
    const a = RIVER_SPINE[i]
    const b = RIVER_SPINE[i + 1]
    if (!a || !b) continue
    best = Math.min(best, distToSegment(x, z, a[0], a[1], b[0], b[1]))
  }
  return best
}

/**
 * Authored map: settlement in a bowl, river valley west,
 * wooded rise east, broken ground northeast, hills on the rim.
 */
export function terrainHeight(x: number, z: number): number {
  const d = Math.hypot(x, z)
  const dip = (1 - smoothstep(0, 11, distToRiver(x, z))) * 1.35
  const woods = smoothstep(40, 82, x) * (1 - smoothstep(58, 118, Math.abs(z + 16))) * 1.15
  const ruins = smoothstep(26, 72, x) * smoothstep(36, 88, z) * 0.75
  const rim = smoothstep(126, 172, d)
  const rimH = rim * rim * (7 + valueNoise(x * 0.028, z * 0.028) * 4)
  const roll = (valueNoise(x * 0.05, z * 0.05) - 0.5) * (0.18 + rim * 1.2)
  let h = -dip + woods + ruins + rimH + roll
  if (d < 50) h *= smoothstep(40, 50, d)
  if (d > 172) h -= (d - 172) * 2.6
  return h
}

export function terrainTint(x: number, z: number): [number, number, number] {
  const d = Math.hypot(x, z)
  const wet = 1 - smoothstep(0, 14, distToRiver(x, z))
  const woods = smoothstep(42, 88, x) * (1 - smoothstep(50, 115, Math.abs(z + 16)))
  const ruins = smoothstep(24, 78, x) * smoothstep(34, 92, z)
  const rock = smoothstep(128, 165, d)
  const dirt = 1 - smoothstep(36, 58, d)
  const patch = (valueNoise(x * 0.22, z * 0.22) - 0.5) * 0.09
  const blades = (valueNoise(x * 0.9, z * 0.9) - 0.5) * 0.05
  const g = [
    0.2 + woods * -0.05 + wet * -0.02 + ruins * 0.08 + rock * 0.16 + dirt * 0.04 + patch + blades,
    0.34 + woods * -0.06 + wet * -0.07 + ruins * -0.1 + rock * -0.12 + dirt * 0.02 + patch * 0.55 + blades,
    0.13 + woods * -0.03 + wet * 0.05 + ruins * -0.03 + rock * 0.05 + dirt * -0.02 + patch * 0.25,
  ] as [number, number, number]
  return [
    clamp01(g[0]),
    clamp01(g[1]),
    clamp01(g[2]),
  ]
}

export function terrainBlocksWalk(x: number, z: number): boolean {
  if (Math.abs(x) < BASE.east + 4 && Math.abs(z) < BASE.north + 4) return false
  if (pointNearRiver(x, z, -6)) return true
  const d = Math.hypot(x, z)
  if (d < 128) return false
  return terrainHeight(x, z) > 3.8
}

function stripsAlong(points: Array<[number, number]>, width: number): GroundStrip[] {
  const out: GroundStrip[] = []
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]
    const b = points[i + 1]
    if (!a || !b) continue
    const dx = b[0] - a[0]
    const dz = b[1] - a[1]
    const length = Math.hypot(dx, dz)
    if (length < 0.4) continue
    out.push({
      x: (a[0] + b[0]) / 2,
      z: (a[1] + b[1]) / 2,
      yaw: Math.atan2(dx, dz),
      length: length + 1.2,
      width,
    })
  }
  return out
}

function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax
  const dz = bz - az
  const span = dx * dx + dz * dz
  const t = span <= 0.0001 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / span))
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t))
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / Math.max(0.0001, edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function valueNoise(x: number, z: number): number {
  const x0 = Math.floor(x)
  const z0 = Math.floor(z)
  const tx = x - x0
  const tz = z - z0
  const a = hash01(`${x0}:${z0}`)
  const b = hash01(`${x0 + 1}:${z0}`)
  const c = hash01(`${x0}:${z0 + 1}`)
  const d = hash01(`${x0 + 1}:${z0 + 1}`)
  const u = tx * tx * (3 - 2 * tx)
  const v = tz * tz * (3 - 2 * tz)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

function hash01(seed: string): number {
  let hash = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return ((hash >>> 0) % 10_000) / 10_000
}
