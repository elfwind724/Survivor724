import type { WorldState } from '@/simulation/types'

export interface MinimapActor {
  id: string
  x: number
  z: number
  yaw: number
  role: 'player' | 'selected' | 'npc'
}

export function minimapActors(world: WorldState): MinimapActor[] {
  const playerId = world.player.controlledId ?? world.player.heroId
  const selectedId = world.player.selectedId
  return world.survivors.map((survivor) => ({
    id: survivor.id,
    x: survivor.position.x,
    z: survivor.position.z,
    yaw: survivor.facingYaw,
    role: survivor.id === playerId ? 'player' : survivor.id === selectedId ? 'selected' : 'npc',
  }))
}

export function minimapProject(
  nav: WorldState['nav'],
  x: number,
  z: number,
  width: number,
  height: number,
): { x: number; y: number } {
  const sx = width / (nav.width * nav.cellSize)
  const sz = height / (nav.height * nav.cellSize)
  return {
    x: (x - nav.originX) * sx,
    y: (z - nav.originZ) * sz,
  }
}

export class Minimap {
  constructor(private readonly canvas: HTMLCanvasElement) {}

  render(world: WorldState): void {
    const ctx = this.canvas.getContext('2d')
    if (!ctx) return
    const { width, height } = this.canvas
    const nav = world.nav
    ctx.fillStyle = '#1a211c'
    ctx.fillRect(0, 0, width, height)

    const sx = width / (nav.width * nav.cellSize)
    const sz = height / (nav.height * nav.cellSize)
    const toX = (x: number) => minimapProject(nav, x, 0, width, height).x
    const toY = (z: number) => minimapProject(nav, 0, z, width, height).y

    ctx.fillStyle = '#2c3330'
    for (let z = 0; z < nav.height; z += 1) {
      for (let x = 0; x < nav.width; x += 1) {
        if (nav.blocked[z * nav.width + x] !== 1) continue
        ctx.fillRect(x * nav.cellSize * sx, z * nav.cellSize * sz, nav.cellSize * sx, nav.cellSize * sz)
      }
    }

    for (const zone of world.workZones) {
      ctx.fillStyle = zone.jobDefinitionId === 'hunt' ? 'rgba(80,140,70,0.25)' : zone.jobDefinitionId === 'fish' ? 'rgba(70,120,150,0.25)' : 'rgba(150,110,70,0.25)'
      const zy0 = Math.min(toY(zone.minZ), toY(zone.maxZ))
      const zy1 = Math.max(toY(zone.minZ), toY(zone.maxZ))
      ctx.fillRect(toX(zone.minX), zy0, toX(zone.maxX) - toX(zone.minX), zy1 - zy0)
    }

    for (const structure of world.structures) {
      const first = structure.cells[0]
      if (!first) continue
      ctx.fillStyle = structure.stage === 'complete'
        ? structure.kind === 'gate' && structure.open ? '#8a6a3a' : '#5a5a5a'
        : '#3d7ea6'
      for (const cell of structure.cells) {
        ctx.fillRect(cell.x * nav.cellSize * sx, cell.z * nav.cellSize * sz, nav.cellSize * sx + 0.5, nav.cellSize * sz + 0.5)
      }
    }

    for (const node of world.nodes) {
      ctx.fillStyle = '#d7c27a'
      ctx.beginPath()
      ctx.arc(toX(node.position.x), toY(node.position.z), 3, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.fillStyle = '#c47a3a'
    ctx.beginPath()
    ctx.arc(toX(40), toY(55), 4, 0, Math.PI * 2)
    ctx.fill()
    if (world.dungeonRun && !world.dungeonRun.evacuated) {
      ctx.fillStyle = '#5a4030'
      const run = world.dungeonRun
      for (let i = 0; i < run.nodes.length; i += 1) {
        const col = i % 4
        const row = Math.floor(i / 4)
        ctx.fillRect(toX(34 + col * 12) - 2, toY(50 + row * 12) - 2, 8, 8)
      }
    }

    const actors = minimapActors(world)
    for (const actor of actors) {
      if (actor.role === 'player') continue
      ctx.fillStyle = actor.role === 'selected' ? '#e8d4a4' : '#9a9488'
      ctx.fillRect(toX(actor.x) - 2, toY(actor.z) - 2, 4, 4)
    }
    const player = actors.find((actor) => actor.role === 'player')
    if (player) drawPlayerMark(ctx, toX(player.x), toY(player.z), player.yaw)
  }

  worldFromEvent(world: WorldState, event: MouseEvent): { x: number; z: number } {
    const rect = this.canvas.getBoundingClientRect()
    const u = (event.clientX - rect.left) / rect.width
    const v = (event.clientY - rect.top) / rect.height
    return {
      x: world.nav.originX + u * world.nav.width * world.nav.cellSize,
      z: world.nav.originZ + v * world.nav.height * world.nav.cellSize,
    }
  }
}

function drawPlayerMark(ctx: CanvasRenderingContext2D, x: number, y: number, yaw: number): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(Math.PI - yaw)
  ctx.beginPath()
  ctx.moveTo(0, -7)
  ctx.lineTo(5, 6)
  ctx.lineTo(0, 3)
  ctx.lineTo(-5, 6)
  ctx.closePath()
  ctx.fillStyle = '#f0d27a'
  ctx.strokeStyle = '#1a140c'
  ctx.lineWidth = 1.4
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}
