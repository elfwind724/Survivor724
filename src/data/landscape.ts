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
  const width = (RIVER_WIDTH + pad) / 2
  const spine = RIVER_SPINE
  for (let i = 0; i < spine.length - 1; i += 1) {
    const a = spine[i]
    const b = spine[i + 1]
    if (!a || !b) continue
    if (distToSegment(x, z, a[0], a[1], b[0], b[1]) <= width) return true
  }
  return false
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
