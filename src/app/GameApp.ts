import { placeBlueprint, toggleGates } from '@/base/construction'
import { setWorkZone } from '@/base/workZones'
import { worldToCell } from '@/navigation/NavGrid'
import { DebugRenderer } from '@/render/DebugRenderer'
import { stepWorld } from '@/simulation/SimStep'
import { createInitialWorld } from '@/simulation/WorldState'
import type { WorldState } from '@/simulation/types'
import { DebugHud } from '@/ui/DebugHud'
import { Minimap } from '@/ui/Minimap'
import { GameLoop } from './GameLoop'

type BuildMode = 'none' | 'wall' | 'gate'

export class GameApp {
  private readonly world: WorldState
  private readonly renderer: DebugRenderer
  private readonly hud: DebugHud
  private readonly minimap: Minimap
  private readonly loop: GameLoop
  private buildMode: BuildMode = 'none'
  private zoneJob = 'hunt'
  private zoneStart: { x: number; z: number } | null = null
  private notice = 'B 墙 / N 门 / 单击地面放置 · G 开关大门 · 小地图拖拽绘制工作区 · 1猎 2渔 3搜'

  constructor(canvas: HTMLCanvasElement, hudRoot: HTMLElement, minimapCanvas: HTMLCanvasElement) {
    this.world = createInitialWorld()
    this.renderer = new DebugRenderer(canvas)
    this.hud = new DebugHud(hudRoot)
    this.minimap = new Minimap(minimapCanvas)
    this.loop = new GameLoop(this.step, this.draw)
    this.renderer.sync(this.world)
    this.hud.render(this.world, this.notice, this.buildMode, this.zoneJob)
    this.minimap.render(this.world)
    canvas.addEventListener('pointerdown', this.onWorldClick)
    minimapCanvas.addEventListener('pointerdown', this.onMinimapDown)
    minimapCanvas.addEventListener('pointerup', this.onMinimapUp)
    window.addEventListener('keydown', this.onKey)
  }

  start(): void {
    this.loop.start()
  }

  stop(): void {
    this.loop.stop()
    this.renderer.dispose()
    window.removeEventListener('keydown', this.onKey)
  }

  private readonly step = (dt: number): void => {
    stepWorld(this.world, dt)
  }

  private readonly draw = (_alpha: number): void => {
    this.renderer.sync(this.world)
    this.renderer.draw()
    this.hud.render(this.world, this.notice, this.buildMode, this.zoneJob)
    this.minimap.render(this.world)
  }

  private readonly onKey = (event: KeyboardEvent): void => {
    if (event.code === 'KeyB') this.buildMode = this.buildMode === 'wall' ? 'none' : 'wall'
    if (event.code === 'KeyN') this.buildMode = this.buildMode === 'gate' ? 'none' : 'gate'
    if (event.code === 'KeyG') {
      toggleGates(this.world)
      this.notice = '已切换大门开闭'
    }
    if (event.code === 'Digit1') this.zoneJob = 'hunt'
    if (event.code === 'Digit2') this.zoneJob = 'fish'
    if (event.code === 'Digit3') this.zoneJob = 'scavenge'
  }

  private readonly onWorldClick = (event: PointerEvent): void => {
    if (this.buildMode === 'none') return
    const hit = this.renderer.pickGround(event.clientX, event.clientY)
    if (!hit) return
    const cell = worldToCell(this.world.nav, { x: hit.x, y: 0, z: hit.z })
    const result = placeBlueprint(this.world, this.buildMode, cell.x, cell.z)
    this.notice = result.ok ? `已放置${this.buildMode}蓝图` : `无法放置：${result.reason}`
  }

  private readonly onMinimapDown = (event: PointerEvent): void => {
    this.zoneStart = this.minimap.worldFromEvent(this.world, event)
  }

  private readonly onMinimapUp = (event: PointerEvent): void => {
    if (!this.zoneStart) return
    const end = this.minimap.worldFromEvent(this.world, event)
    setWorkZone(this.world, this.zoneJob, this.zoneStart.x, this.zoneStart.z, end.x, end.z)
    this.notice = `已更新 ${this.zoneJob} 工作区`
    this.zoneStart = null
  }
}
