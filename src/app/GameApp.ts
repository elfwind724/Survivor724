import * as THREE from 'three'
import { demolishStructure, placeBlueprint, structureAt, toggleGates } from '@/base/construction'
import { setWorkZone } from '@/base/workZones'
import { cameraRelativeWish } from '@/controls/CameraWish'
import { Input } from '@/controls/Input'
import { cycleControlled, possessSurvivor, releaseControl } from '@/controls/PlayerControl'
import { beginTravel } from '@/navigation/Travel'
import { worldToCell } from '@/navigation/NavGrid'
import { DebugRenderer } from '@/render/DebugRenderer'
import { findSurvivor } from '@/simulation/EntityRegistry'
import { stepWorld } from '@/simulation/SimStep'
import { createInitialWorld } from '@/simulation/WorldState'
import type { WorldState } from '@/simulation/types'
import { DebugHud } from '@/ui/DebugHud'
import { Minimap } from '@/ui/Minimap'
import { GameLoop } from './GameLoop'

type BuildMode = 'none' | 'wall' | 'gate' | 'kitchen' | 'demolish'

export class GameApp {
  private readonly world: WorldState
  private readonly renderer: DebugRenderer
  private readonly hud: DebugHud
  private readonly minimap: Minimap
  private readonly input = new Input()
  private readonly loop: GameLoop
  private buildMode: BuildMode = 'none'
  private zoneJob = 'hunt'
  private zoneStart: { x: number; z: number } | null = null
  private lastClickAt = 0
  private lastClickId: string | null = null
  private notice = '滚轮缩放 · Q/E 转镜头 · B墙 N门 K厨房 R拆除 · WASD 移动 · 双击接管'

  constructor(canvas: HTMLCanvasElement, hudRoot: HTMLElement, minimapCanvas: HTMLCanvasElement) {
    this.world = createInitialWorld()
    this.renderer = new DebugRenderer(canvas)
    this.hud = new DebugHud(hudRoot)
    this.minimap = new Minimap(minimapCanvas)
    this.loop = new GameLoop(this.step, this.draw)
    possessSurvivor(this.world, 'hunter')
    this.renderer.sync(this.world)
    this.refreshHud()
    this.minimap.render(this.world)
    canvas.addEventListener('pointerdown', this.onWorldClick)
    canvas.addEventListener('wheel', this.onWheel, { passive: false })
    canvas.addEventListener('contextmenu', (event) => event.preventDefault())
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
    this.input.dispose()
    window.removeEventListener('keydown', this.onKey)
  }

  private readonly step = (dt: number): void => {
    if (this.world.player.view === 'topdown') {
      if (this.input.isDown('KeyQ')) this.renderer.rotateBy(-dt * 1.35)
      if (this.input.isDown('KeyE')) this.renderer.rotateBy(dt * 1.35)
    }
    stepWorld(this.world, dt, this.controlIntent())
  }

  private readonly draw = (_alpha: number): void => {
    this.renderer.sync(this.world)
    this.renderer.draw()
    this.refreshHud()
    this.minimap.render(this.world)
  }

  private controlIntent() {
    const right = this.input.axis('KeyD', 'KeyA')
    const forward = this.input.axis('KeyW', 'KeyS')
    const look = this.renderer.pickGround(this.input.mouseX, this.input.mouseY)
    if (this.world.player.view === 'firstperson') {
      return {
        wishX: right,
        wishZ: forward,
        faceX: null,
        faceZ: null,
        yawDelta: this.input.consumeMouseDeltaX(),
      }
    }

    const worldForward = this.renderer.camera.getWorldDirection(new THREE.Vector3())
    const wish = cameraRelativeWish(right, forward, worldForward.x, worldForward.z)
    return {
      wishX: wish.x,
      wishZ: wish.z,
      faceX: look?.x ?? null,
      faceZ: look?.z ?? null,
      yawDelta: 0,
    }
  }

  private readonly onKey = (event: KeyboardEvent): void => {
    if (event.code === 'Tab') {
      event.preventDefault()
      cycleControlled(this.world)
      this.notice = `当前：${this.world.player.controlledId ?? this.world.player.selectedId ?? '无人'}`
    }
    if (event.code === 'Enter') {
      const id = this.world.player.selectedId
      if (id) possessSurvivor(this.world, id)
    }
    if (event.code === 'KeyX' || event.code === 'Escape') {
      releaseControl(this.world)
      this.notice = '已交还该幸存者，AI 继续工作'
    }
    if (event.code === 'KeyF' && this.world.player.controlledId) {
      this.world.player.view = this.world.player.view === 'firstperson' ? 'topdown' : 'firstperson'
    }
    if (event.code === 'KeyB') this.buildMode = this.buildMode === 'wall' ? 'none' : 'wall'
    if (event.code === 'KeyN') this.buildMode = this.buildMode === 'gate' ? 'none' : 'gate'
    if (event.code === 'KeyK') this.buildMode = this.buildMode === 'kitchen' ? 'none' : 'kitchen'
    if (event.code === 'KeyR') this.buildMode = this.buildMode === 'demolish' ? 'none' : 'demolish'
    if (event.code === 'KeyG') {
      toggleGates(this.world)
      this.notice = '已切换大门开闭'
    }
    if (event.code === 'Digit1') this.zoneJob = 'hunt'
    if (event.code === 'Digit2') this.zoneJob = 'fish'
    if (event.code === 'Digit3') this.zoneJob = 'scavenge'
  }

  private readonly onWheel = (event: WheelEvent): void => {
    if (this.world.player.view === 'firstperson') return
    event.preventDefault()
    this.renderer.zoomBy(event.deltaY)
  }

  private readonly onWorldClick = (event: PointerEvent): void => {
    if (this.buildMode === 'demolish' && event.button === 0) {
      const hit = this.renderer.pickGround(event.clientX, event.clientY)
      if (!hit) return
      const structure = structureAt(this.world, { x: hit.x, y: 0, z: hit.z })
      if (!structure) {
        this.notice = '没有点到可拆除的建筑'
        return
      }
      demolishStructure(this.world, structure.id)
      this.notice = `已拆除 ${structure.definitionId}`
      return
    }

    if (this.buildMode !== 'none' && event.button === 0) {
      const hit = this.renderer.pickGround(event.clientX, event.clientY)
      if (!hit) return
      const cell = worldToCell(this.world.nav, { x: hit.x, y: 0, z: hit.z })
      const result = placeBlueprint(this.world, this.buildMode, cell.x, cell.z)
      this.notice = result.ok ? `已放置${this.buildMode}蓝图` : `无法放置：${result.reason}`
      return
    }

    if (event.button === 0) {
      const id = this.renderer.pickSurvivor(this.world, event.clientX, event.clientY)
      if (!id) return
      const now = performance.now()
      const doubleClick = this.lastClickId === id && now - this.lastClickAt < 320
      this.lastClickAt = now
      this.lastClickId = id
      this.world.player.selectedId = id
      if (doubleClick) {
        possessSurvivor(this.world, id)
        this.notice = `接管 ${findSurvivor(this.world, id)?.name ?? id}`
      }
      return
    }

    if (event.button === 2 && !this.world.player.controlledId && this.world.player.selectedId) {
      const hit = this.renderer.pickGround(event.clientX, event.clientY)
      const survivor = findSurvivor(this.world, this.world.player.selectedId)
      if (!hit || !survivor) return
      beginTravel(this.world, survivor, { x: hit.x, y: 0, z: hit.z })
      survivor.workerState = 'TravelToTarget'
      this.notice = `命令 ${survivor.name} 移动`
    }
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

  private refreshHud(): void {
    this.hud.render(this.world, this.notice, this.buildMode, this.zoneJob)
  }
}
