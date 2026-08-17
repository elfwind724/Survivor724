import * as THREE from 'three'
import { demolishAt, interactGate, placeBlueprint, placeWallLine, previewPlacement, previewWallLine, structureAt } from '@/base/construction'
import { decorationNear, placeDecoration, removeDecoration, snapDecor } from '@/base/decorations'
import { facilityPreviewHeight } from '@/data/facilities'
import { reloadWeapon, tryShoot } from '@/combat/Combat'
import { equippedWeapon, fireProfile } from '@/data/weapons'
import { setWorkZone } from '@/base/workZones'
import { cameraRelativeWish } from '@/controls/CameraWish'
import { Input } from '@/controls/Input'
import { cycleControlled, possessSurvivor, releaseControl } from '@/controls/PlayerControl'
import { beginTravel } from '@/navigation/Travel'
import { worldToCell } from '@/navigation/NavGrid'
import { DebugRenderer } from '@/render/DebugRenderer'
import { findSurvivor } from '@/simulation/EntityRegistry'
import { skipSeconds, stepWorld } from '@/simulation/SimStep'
import { createInitialWorld } from '@/simulation/WorldState'
import type { GridCell, WorldState } from '@/simulation/types'
import { reinforceSector } from '@/combat/Defense'
import { BuildMenu } from '@/ui/BuildMenu'
import { CharacterSheet } from '@/ui/CharacterSheet'
import { CreativeEditor } from '@/ui/CreativeEditor'
import { GameHud } from '@/ui/GameHud'
import { DefenseBar } from '@/ui/DefenseBar'
import { Minimap } from '@/ui/Minimap'
import { GameLoop } from './GameLoop'

export class GameApp {
  private readonly world: WorldState
  private readonly renderer: DebugRenderer
  private readonly hud: GameHud
  private readonly sheet: CharacterSheet
  private readonly minimap: Minimap
  private readonly buildMenu: BuildMenu
  private readonly editor: CreativeEditor
  private readonly defenseBar: DefenseBar
  private readonly input = new Input()
  private readonly loop: GameLoop
  private zoneJob = 'hunt'
  private zoneStart: { x: number; z: number } | null = null
  private lastClickAt = 0
  private lastClickId: string | null = null
  private wallAnchor: GridCell | null = null
  private pointer: {
    button: number
    startX: number
    startY: number
    lastX: number
    lastY: number
    dragging: boolean
  } | null = null
  private notice = '点头像选人，双击接管 · 左键拖移 · 右键转镜头'

  constructor(
    canvas: HTMLCanvasElement,
    hudRoot: HTMLElement,
    sheetRoot: HTMLElement,
    minimapCanvas: HTMLCanvasElement,
    buildMenuRoot: HTMLElement,
    editorRoot: HTMLElement,
    defenseRoot: HTMLElement,
  ) {
    this.world = createInitialWorld()
    this.renderer = new DebugRenderer(canvas)
    this.hud = new GameHud(hudRoot, ({ id, kind }) => {
      this.world.player.selectedId = id
      this.renderer.recenter()
      this.sheet.open(id)
      if (kind === 'possess') {
        possessSurvivor(this.world, id)
        this.notice = `接管 ${findSurvivor(this.world, id)?.name ?? id}`
      }
    })
    this.sheet = new CharacterSheet(sheetRoot)
    this.minimap = new Minimap(minimapCanvas)
    this.buildMenu = new BuildMenu(buildMenuRoot, (selected) => {
      this.wallAnchor = null
      if (selected) this.editor.clearBrush()
      this.notice = selected === 'demolish'
        ? '拆除：单击建筑'
        : selected === 'wall'
          ? '围墙：先点起点，再点终点，中间自动连成一条'
          : selected
            ? '已选择，移动鼠标看边框，再单击放置'
            : '已取消建造'
    })
    this.editor = new CreativeEditor(editorRoot, () => {
      const brush = this.editor.getBrush()
      if (brush) {
        this.buildMenu.clear()
        this.renderer.enqueueAsset(brush.assetId)
        this.notice = '左键放置 · 右键拆除装饰 · R 旋转 · -/= 缩放 · I 打开创造栏'
      }
    })
    this.defenseBar = new DefenseBar(defenseRoot, (sector) => {
      this.notice = `增援${sector}，守夜的人会往那边靠` 
    })
    this.loop = new GameLoop(this.step, this.draw)
    possessSurvivor(this.world, 'hunter')
    this.renderer.sync(this.world)
    this.refreshHud()
    this.minimap.render(this.world)
    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointermove', this.onPointerMove)
    canvas.addEventListener('pointerup', this.onPointerUp)
    canvas.addEventListener('pointercancel', this.onPointerUp)
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
    }
    stepWorld(this.world, dt, this.controlIntent())
  }

  private readonly draw = (_alpha: number): void => {
    this.updateBuildPreview()
    this.renderer.sync(this.world)
    this.renderer.draw()
    this.refreshHud()
    this.minimap.render(this.world)
    this.defenseBar.render(this.world)
  }

  private controlIntent() {
    const move = this.input.moveAxis()
    const right = move.x
    const forward = move.z
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
    if (event.code === 'Escape') {
      if (this.sheet.isOpen()) {
        this.sheet.close()
        this.notice = '已关闭人物面板'
        return
      }
      if (this.editor.isOpen()) {
        this.editor.close()
        this.notice = '已关闭创造栏'
        return
      }
      if (this.editor.getBrush()) {
        this.editor.clearBrush()
        this.notice = '已放下手中素材'
        return
      }
      if (this.buildMenu.getSelected() || this.buildMenu.isOpen()) {
        this.wallAnchor = null
        this.buildMenu.clear()
        this.buildMenu.close()
        this.notice = '已关闭建造'
        return
      }
      releaseControl(this.world)
      this.notice = '已交还该幸存者，AI 继续工作'
    }
    if (event.code === 'KeyX') {
      releaseControl(this.world)
      this.notice = '已交还该幸存者，AI 继续工作'
    }
    if (event.code === 'KeyF' && this.world.player.controlledId) {
      this.world.player.view = this.world.player.view === 'firstperson' ? 'topdown' : 'firstperson'
    }
    if (event.code === 'KeyB') this.buildMenu.toggle()
    if (event.code === 'KeyI') this.editor.toggle()
    if (event.code === 'KeyR' && this.editor.getBrush()) {
      this.editor.rotate(event.shiftKey ? -Math.PI / 2 : Math.PI / 2)
      this.notice = '已旋转手中素材'
      return
    }
    if (event.code === 'KeyR') {
      const actor = this.world.player.controlledId
        ? findSurvivor(this.world, this.world.player.controlledId)
        : this.world.player.selectedId
          ? findSurvivor(this.world, this.world.player.selectedId)
          : undefined
      if (!actor) {
        this.notice = '先选中或接管一个人再按 R 装弹'
        return
      }
      const result = reloadWeapon(this.world, actor)
      if (result === 'ok') this.notice = `已装填 ${actor.ammo}发`
      else if (result === 'full') this.notice = '弹匣是满的'
      else if (result === 'no_gun') this.notice = '没有装备枪械'
      else this.notice = '仓库没有备用弹药'
    }
    if ((event.code === 'Equal' || event.code === 'NumpadAdd') && this.editor.getBrush()) {
      this.editor.nudgeScale(1.15)
      this.notice = '放大装饰'
    }
    if ((event.code === 'Minus' || event.code === 'NumpadSubtract') && this.editor.getBrush()) {
      this.editor.nudgeScale(1 / 1.15)
      this.notice = '缩小装饰'
    }
    if (event.code.startsWith('Digit') && (this.editor.isOpen() || this.editor.getBrush())) {
      const index = Number(event.code.slice(5)) - 1
      if (index >= 0 && index <= 8) {
        this.editor.pickHotbar(index)
        return
      }
    }
    if (event.code === 'KeyC') {
      this.renderer.recenter()
      this.notice = '镜头回到当前角色'
    }
    if (event.code === 'KeyE') {
      const actor = this.world.player.controlledId
        ? findSurvivor(this.world, this.world.player.controlledId)
        : this.world.player.selectedId
          ? findSurvivor(this.world, this.world.player.selectedId)
          : undefined
      if (!actor) {
        this.notice = '先选中或接管一个人，再到门边按 E'
        return
      }
      const gate = interactGate(this.world, actor.position)
      this.notice = gate ? (gate.open ? '门开了' : '门关上了') : '旁边没有门'
    }
    if (event.code === 'Digit1') {
      if (this.world.time.phase === 'night') reinforceSector(this.world, 'north')
      else this.zoneJob = 'hunt'
    }
    if (event.code === 'Digit2') {
      if (this.world.time.phase === 'night') reinforceSector(this.world, 'east')
      else this.zoneJob = 'fish'
    }
    if (event.code === 'Digit3') {
      if (this.world.time.phase === 'night') reinforceSector(this.world, 'south')
      else this.zoneJob = 'scavenge'
    }
    if (event.code === 'Digit4' && this.world.time.phase === 'night') reinforceSector(this.world, 'west')
    if (event.code === 'KeyT') {
      this.world.time.timeScale = this.world.time.timeScale === 1 ? 2 : 1
      this.notice = `时间倍率 ${this.world.time.timeScale}×`
    }
    if (event.code === 'BracketRight') {
      skipSeconds(this.world, 60)
      this.notice = '时间推进 60 秒'
    }
  }

  private readonly onWheel = (event: WheelEvent): void => {
    if (this.world.player.view === 'firstperson') return
    event.preventDefault()
    this.renderer.zoomBy(event.deltaY)
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (this.world.player.view === 'firstperson') {
      if (event.button === 0) this.fireIfPossessed()
      return
    }
    this.pointer = {
      button: event.button,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      dragging: false,
    }
    event.currentTarget instanceof HTMLElement && event.currentTarget.setPointerCapture(event.pointerId)
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.pointer || this.world.player.view === 'firstperson') return
    const dx = event.clientX - this.pointer.lastX
    const dy = event.clientY - this.pointer.lastY
    const traveled = Math.hypot(event.clientX - this.pointer.startX, event.clientY - this.pointer.startY)
    if (traveled > 6) this.pointer.dragging = true
    this.pointer.lastX = event.clientX
    this.pointer.lastY = event.clientY
    if (!this.pointer.dragging) return
    if (this.pointer.button === 2) {
      this.renderer.rotateBy(dx * 0.007)
      this.renderer.pullSideBy(dy)
    }
    if (this.pointer.button === 0 && !this.editor.getBrush()) this.renderer.panBy(-dx, -dy)
  }

  private readonly onPointerUp = (event: PointerEvent): void => {
    const pointer = this.pointer
    this.pointer = null
    if (!pointer) return
    if (pointer.dragging && !(this.editor.getBrush() && pointer.button === 0)) return
    this.handleClick(event, pointer.button)
  }

  private handleClick(event: PointerEvent, button: number): void {
    if (this.editor.isOpen()) return
    const brush = this.editor.getBrush()
    if (brush) {
      const hit = this.renderer.pickGround(event.clientX, event.clientY)
      if (!hit) return
      if (button === 0) {
        const placed = placeDecoration(this.world, brush.assetId, hit.x, hit.z, brush.yaw, brush.scale)
        this.renderer.enqueueAsset(brush.assetId)
        this.notice = placed ? `已放下 ${placed.assetId.split('/').pop()}` : '无法放置这个素材'
        return
      }
      if (button === 2) {
        const target = decorationNear(this.world, hit.x, hit.z)
        if (!target) {
          this.notice = '附近没有装饰'
          return
        }
        removeDecoration(this.world, target.id)
        this.notice = '已拆除装饰'
        return
      }
      return
    }

    const buildMode = this.buildMenu.getSelected()
    if (button === 0 && buildMode === 'demolish') {
      const hit = this.renderer.pickGround(event.clientX, event.clientY)
      if (!hit) return
      const structure = structureAt(this.world, { x: hit.x, y: 0, z: hit.z })
      if (structure) {
        const result = demolishAt(this.world, { x: hit.x, y: 0, z: hit.z })
        this.notice = result?.removed === 'cell' ? '已拆除这一格墙' : `已拆除 ${structure.definitionId}`
        return
      }
      const decor = decorationNear(this.world, hit.x, hit.z, 2.4)
      if (decor) {
        removeDecoration(this.world, decor.id)
        this.notice = '已拆除装饰'
        return
      }
      this.notice = '没有点到可拆除的建筑'
      return
    }

    if (button === 2 && this.wallAnchor) {
      this.wallAnchor = null
      this.notice = '已取消墙起点，再点一次重新拉线'
      return
    }

    if (button === 0 && buildMode && buildMode !== 'demolish') {
      const hit = this.renderer.pickGround(event.clientX, event.clientY)
      if (!hit) return
      const cell = worldToCell(this.world.nav, { x: hit.x, y: 0, z: hit.z })
      if (buildMode === 'wall') {
        if (!this.wallAnchor) {
          this.wallAnchor = cell
          this.notice = '再点终点，中间会连成一条墙'
          return
        }
        const result = placeWallLine(this.world, this.wallAnchor, cell)
        this.notice = result.ok ? `已放下 ${result.structure?.cells.length ?? 0} 格墙蓝图，搬山一次运完` : `无法连墙：${result.reason}`
        this.wallAnchor = result.ok ? cell : this.wallAnchor
        return
      }
      const result = placeBlueprint(this.world, buildMode, cell.x, cell.z)
      this.notice = result.ok ? `已放置蓝图，搬山会来运材料` : `无法放置：${result.reason}`
      return
    }

    if (button === 0) {
      const id = this.renderer.pickSurvivor(this.world, event.clientX, event.clientY)
      if (!id) {
        this.fireIfPossessed()
        return
      }
      const now = performance.now()
      const doubleClick = this.lastClickId === id && now - this.lastClickAt < 320
      this.lastClickAt = now
      this.lastClickId = id
      this.world.player.selectedId = id
      this.renderer.recenter()
      if (doubleClick) {
        possessSurvivor(this.world, id)
        this.notice = `接管 ${findSurvivor(this.world, id)?.name ?? id}`
      }
      return
    }

    if (button === 2 && !this.world.player.controlledId && this.world.player.selectedId) {
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

  private updateBuildPreview(): void {
    const brush = this.editor.getBrush()
    if (brush && this.world.player.view !== 'firstperson' && !this.editor.isOpen()) {
      const hover = this.renderer.pickGround(this.input.mouseX, this.input.mouseY)
      this.renderer.clearBuildPreview()
      if (!hover) {
        this.renderer.setDecorationPreview(null)
        return
      }
      this.renderer.setDecorationPreview({
        assetId: brush.assetId,
        x: snapDecor(hover.x),
        z: snapDecor(hover.z),
        yaw: brush.yaw,
        scale: brush.scale,
      })
      return
    }
    this.renderer.setDecorationPreview(null)

    const selected = this.buildMenu.getSelected()
    if (!selected || selected === 'demolish' || this.world.player.view === 'firstperson') {
      this.renderer.clearBuildPreview()
      return
    }
    const hit = this.renderer.pickGround(this.input.mouseX, this.input.mouseY)
    if (!hit) {
      this.renderer.clearBuildPreview()
      return
    }
    const cell = worldToCell(this.world.nav, { x: hit.x, y: 0, z: hit.z })
    const preview = selected === 'wall' && this.wallAnchor
      ? previewWallLine(this.world, this.wallAnchor, cell)
      : previewPlacement(this.world, selected, cell.x, cell.z)
    this.renderer.setBuildPreview(
      this.world,
      preview.cells,
      preview.valid,
      facilityPreviewHeight(selected),
      selected === 'wall' ? this.wallAnchor : null,
    )
  }

  private fireIfPossessed(): void {
    if (this.buildMenu.getSelected() || this.editor.getBrush()) return
    const self = this.world.player.controlledId ? findSurvivor(this.world, this.world.player.controlledId) : undefined
    if (!self) return
    if (tryShoot(this.world, self)) {
      const gun = fireProfile(self).weapon
      this.notice = `射击 · ${gun?.label ?? '枪'}`
      return
    }
    if (!equippedWeapon(self)) this.notice = '没有装备枪械'
  }

  private refreshHud(): void {
    this.hud.render(this.world, this.notice)
    this.sheet.render(this.world)
  }
}
