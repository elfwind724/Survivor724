import type { WorldState } from '@/simulation/types'

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
    const toX = (x: number) => (x - nav.originX) * sx
    const toY = (z: number) => height - (z - nav.originZ) * sz

    ctx.fillStyle = '#2c3330'
    for (let z = 0; z < nav.height; z += 1) {
      for (let x = 0; x < nav.width; x += 1) {
        if (nav.blocked[z * nav.width + x] !== 1) continue
        ctx.fillRect(x * nav.cellSize * sx, height - (z + 1) * nav.cellSize * sz, nav.cellSize * sx, nav.cellSize * sz)
      }
    }

    for (const zone of world.workZones) {
      ctx.fillStyle = zone.jobDefinitionId === 'hunt' ? 'rgba(80,140,70,0.25)' : zone.jobDefinitionId === 'fish' ? 'rgba(70,120,150,0.25)' : 'rgba(150,110,70,0.25)'
      ctx.fillRect(toX(zone.minX), toY(zone.maxZ), toX(zone.maxX) - toX(zone.minX), toY(zone.minZ) - toY(zone.maxZ))
    }

    for (const structure of world.structures) {
      const first = structure.cells[0]
      if (!first) continue
      ctx.fillStyle = structure.stage === 'complete'
        ? structure.kind === 'gate' && structure.open ? '#8a6a3a' : '#5a5a5a'
        : '#3d7ea6'
      for (const cell of structure.cells) {
        ctx.fillRect(cell.x * nav.cellSize * sx, height - (cell.z + 1) * nav.cellSize * sz, nav.cellSize * sx + 0.5, nav.cellSize * sz + 0.5)
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

    for (const survivor of world.survivors) {
      ctx.fillStyle = '#f2efe6'
      ctx.fillRect(toX(survivor.position.x) - 2, toY(survivor.position.z) - 2, 4, 4)
    }
  }

  worldFromEvent(world: WorldState, event: MouseEvent): { x: number; z: number } {
    const rect = this.canvas.getBoundingClientRect()
    const u = (event.clientX - rect.left) / rect.width
    const v = (event.clientY - rect.top) / rect.height
    return {
      x: world.nav.originX + u * world.nav.width * world.nav.cellSize,
      z: world.nav.originZ + (1 - v) * world.nav.height * world.nav.cellSize,
    }
  }
}
