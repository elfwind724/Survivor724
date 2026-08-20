import * as THREE from 'three'
import { demolishTarget, findStructure, interactGate, markDemolishAt, persistCreativeStructures, placeBlueprint, placeCreativeAsset, placeWallLine, previewCreativePlacement, previewPlacement, previewWallLine } from '@/base/construction'
import { decorationNear, removeDecoration, snapDecor } from '@/base/decorations'
import { buildProgress, durabilityPercent, facilityPreviewHeight, structureLabel } from '@/data/facilities'
import { canUpgrade, facilityCap, hallLevel, markUpgrade, structureLevel, upgradeCost, upgradeProgress } from '@/base/upgrade'
import { unlocksAtHall } from '@/data/hallPool'
import { PICK_LABEL, type DungeonPickId } from '@/data/dungeon'
import { itemLabel } from '@/data/items'
import { rebuildNightPosts } from '@/combat/Night'
import {
  advanceDungeon,
  chooseDungeonPick,
  dungeonRoomCenter,
  enterDungeon,
  evacuateDungeon,
  isInDungeon,
  nearDungeonEntrance,
} from '@/dungeon/Dungeon'
import { loadFromBrowser, saveToBrowser } from '@/save/SaveSchema'
import { cellCenter } from '@/navigation/NavGrid'
import { reloadWeapon, tryShoot } from '@/combat/Combat'
import { depositIfNearWarehouse } from '@/inventory/Cargo'
import { equippedWeapon, fireProfile } from '@/data/weapons'
import { setWorkZone } from '@/base/workZones'
import { cameraRelativeWish } from '@/controls/CameraWish'
import { Input } from '@/controls/Input'
import { cycleControlled, possessSurvivor } from '@/controls/PlayerControl'
import { toggleFollow } from '@/jobs/Follow'
import { beginTravel } from '@/navigation/Travel'
import { worldToCell } from '@/navigation/NavGrid'
import { DebugRenderer } from '@/render/DebugRenderer'
import { findSurvivor } from '@/simulation/EntityRegistry'
import { skipSeconds, stepWorld } from '@/simulation/SimStep'
import { createInitialWorld } from '@/simulation/WorldState'
import type { GridCell, WorldState } from '@/simulation/types'
import { reinforceSector } from '@/combat/Defense'
import { postForTower } from '@/combat/Night'
import { isSleeping } from '@/base/FacilityLife'
import { assignWatch } from '@/jobs/Roster'
import { activityLines } from '@/survivors/Activity'
import { recallFieldWorkers } from '@/jobs/DayWorker'
import { BuildMenu } from '@/ui/BuildMenu'
import { CharacterSheet } from '@/ui/CharacterSheet'
import { handlePackClick, salvageSelected, selectHotbarSlot, useSelected, type PackClick, type PackCursor } from '@/inventory/Pack'
import { CreativeEditor } from '@/ui/CreativeEditor'
import { GameHud } from '@/ui/GameHud'
import { RosterPanel } from '@/ui/RosterPanel'
import { DefenseBar } from '@/ui/DefenseBar'
import { SandboxPanel } from '@/ui/SandboxPanel'
import { Minimap } from '@/ui/Minimap'
import { nearestLivingWildlife, persistCreativeWildlife, removeCreativeAnimal, WILDLIFE_LABEL } from '@/world/Wildlife'
import { GameLoop } from './GameLoop'

export class GameApp {
  private world: WorldState
  private readonly renderer: DebugRenderer
  private readonly hud: GameHud
  private readonly sheet: CharacterSheet
  private readonly minimap: Minimap
  private readonly buildMenu: BuildMenu
  private readonly roster: RosterPanel
  private readonly editor: CreativeEditor
  private readonly defenseBar: DefenseBar
  private readonly sandbox: SandboxPanel
  private readonly input = new Input()
  private readonly loop: GameLoop
  private readonly tip: HTMLDivElement
  private readonly labels: HTMLDivElement
  private readonly towerPanel: HTMLDivElement
  private towerPostId: string | null = null
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
  private notice = ''
  private packCursor: PackCursor | null = null

  constructor(
    canvas: HTMLCanvasElement,
    hudRoot: HTMLElement,
    sheetRoot: HTMLElement,
    minimapCanvas: HTMLCanvasElement,
    buildMenuRoot: HTMLElement,
    rosterRoot: HTMLElement,
    editorRoot: HTMLElement,
    defenseRoot: HTMLElement,
    sandboxRoot: HTMLElement,
  ) {
    this.world = createInitialWorld()
    this.renderer = new DebugRenderer(canvas)
    this.hud = new GameHud(hudRoot, ({ id, kind }) => {
      this.world.player.selectedId = id
      this.renderer.recenter()
      if (kind === 'possess') this.handleDirect(id)
    }, (command) => {
      if (command === 'reset-view') this.resetView()
      if (command === 'toggle-interiors') {
        this.world.showInteriors = !this.world.showInteriors
        this.notice = this.world.showInteriors ? '已切换到房屋内部' : '已显示房屋整体'
      }
      if (command === 'restart') this.restartRun()
      if (command === 'ack-night') {
        this.world.nightReport = null
        this.notice = '新的一天，继续干活、修墙、备战下一夜'
      }
      if (command === 'open-sheet') {
        const id = this.world.player.selectedId ?? this.world.player.heroId
        this.sheet.open(id, 'gear')
        this.notice = ''
      }
      if (command === 'open-bag') {
        this.hud.toggleBag()
        this.packCursor = null
        this.hud.setCursor(null)
        this.notice = ''
      }
      if (command === 'close-bag') {
        this.hud.closeBag()
        this.packCursor = null
        this.notice = '已关闭背包'
      }
      if (command === 'save') this.saveRun()
      if (command === 'load') this.loadRun()
      if (command === 'dungeon-advance') this.advanceRun()
      if (command === 'dungeon-evacuate') this.leaveDungeon()
    }, (click) => {
      this.applyPackClick(click)
    }, (pickId) => {
      this.pickDungeon(pickId)
    })
    this.sheet = new CharacterSheet(sheetRoot)
    this.minimap = new Minimap(minimapCanvas)
    this.roster = new RosterPanel(rosterRoot, (notice) => {
      this.notice = notice
    })
    this.buildMenu = new BuildMenu(buildMenuRoot, (selected) => {
      this.wallAnchor = null
      if (selected) this.editor.clearBrush()
      this.notice = selected === 'demolish'
        ? '拆除：点建筑打上拆除标记，工匠会过来拆'
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
        this.notice = '左键放置 · 右键拆除 · R 旋转 · -/= 缩放 · I 打开创造栏'
      }
    })
    this.defenseBar = new DefenseBar(defenseRoot, (sector) => {
      this.notice = `增援${sector}，守夜的人会往那边靠` 
    })
    this.sandbox = new SandboxPanel(sandboxRoot, (notice) => {
      this.notice = notice
    })
    this.tip = document.createElement('div')
    this.tip.className = 'world-tip'
    this.labels = document.createElement('div')
    this.labels.className = 'world-labels'
    this.towerPanel = document.createElement('div')
    this.towerPanel.className = 'tower-panel'
    this.towerPanel.addEventListener('pointerdown', (event) => event.stopPropagation())
    document.querySelector('#app')?.append(this.tip, this.labels, this.towerPanel)
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
    if (this.world.gameOver || this.world.paused) return
    stepWorld(this.world, dt, this.controlIntent())
  }

  private readonly draw = (_alpha: number): void => {
    this.updateBuildPreview()
    this.renderer.sync(this.world)
    this.renderer.draw()
    this.refreshHud()
    this.minimap.render(this.world)
    this.defenseBar.render(this.world)
    this.roster.render(this.world)
    this.sandbox.render(this.world)
    this.editor.tickThumbs()
    this.updateWorldChrome()
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
      const name = findSurvivor(this.world, this.world.player.selectedId ?? '')?.name ?? '无人'
      this.notice = `已选队员 ${name}，双击或回车让他跟随`
    }
    if (event.code === 'Enter') {
      const id = this.world.player.selectedId
      if (id) this.handleDirect(id)
    }
    if (event.code === 'Escape') {
      if (this.hud.isBagOpen()) {
        this.hud.closeBag()
        this.packCursor = null
        this.notice = '已关闭背包'
        return
      }
      if (this.sheet.isOpen()) {
        this.sheet.close()
        this.notice = '已关闭人物面板'
        return
      }
      if (this.sandbox.isOpen()) {
        this.sandbox.close()
        this.notice = '已关闭沙盘'
        return
      }
      if (this.roster.isOpen()) {
        this.roster.close()
        this.notice = '已关闭岗位面板'
        return
      }
      if (this.towerPostId) {
        this.towerPostId = null
        this.towerPanel.innerHTML = ''
        this.notice = '已关闭瞭望塔任命'
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
      possessSurvivor(this.world, this.world.player.heroId)
      this.notice = '继续操控冯老师'
    }
    if (event.code === 'KeyG') {
      const self = this.world.survivors.find((entry) => entry.id === this.world.player.heroId)
      if (!self) return
      const moved = depositIfNearWarehouse(this.world, self)
      this.notice = moved > 0 ? `已卸货 ${moved} 件进仓库` : '走近仓库门口再按 G 卸货'
      return
    }
    if (event.code === 'KeyN') {
      this.hud.toggleBag()
      this.packCursor = null
      this.hud.setCursor(null)
      this.notice = this.hud.isBagOpen() ? '背包 · E 使用 · 右键丢弃 · F 拆解' : ''
      return
    }
    if (event.code === 'KeyC') {
      const id = this.world.player.selectedId ?? this.world.player.heroId
      if (this.sheet.isOpen()) {
        this.sheet.close()
        this.notice = '已关闭人物面板'
      } else {
        this.sheet.open(id, 'gear')
        this.notice = ''
      }
      return
    }
    if (event.code === 'KeyX') {
      const id = this.world.player.selectedId
      if (id && id !== this.world.player.heroId) {
        const result = toggleFollow(this.world, id)
        const name = findSurvivor(this.world, id)?.name ?? id
        this.notice = result === 'follow' ? `${name} 开始跟随` : `${name} 停止跟随`
      }
    }
    if (event.code === 'KeyF') {
      if (this.packCursor) {
        const actor = this.focusActor()
        if (!actor) {
          this.notice = '先选中或接管一个人'
          return
        }
        this.notice = salvageSelected(this.world, actor, this.packCursor)
        this.packCursor = null
        this.hud.setCursor(null)
        return
      }
      if (this.world.player.controlledId) {
        this.world.player.view = this.world.player.view === 'firstperson' ? 'topdown' : 'firstperson'
      }
    }
    if (event.code === 'KeyB') this.buildMenu.toggle()
    if (event.code === 'KeyJ') {
      this.roster.toggle()
      this.notice = this.roster.isOpen() ? '安排白天岗位，或按策略一键上岗' : '已关闭岗位面板'
    }
    if (event.code === 'KeyY') {
      this.sandbox.toggle()
      this.notice = this.sandbox.isOpen() ? '沙盘：改尸潮和防线，立刻开打' : '已关闭沙盘'
    }
    if (event.code === 'KeyI') this.editor.toggle()
    if ((event.code === 'KeyR' || event.code === 'KeyQ') && this.editor.getBrush()) {
      event.preventDefault()
      this.editor.rotate(event.shiftKey || event.code === 'KeyQ' ? -Math.PI / 2 : Math.PI / 2)
      this.notice = `已旋转手中素材 ${Math.round((this.editor.getBrush()?.yaw ?? 0) * 180 / Math.PI)}°`
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
    if (this.editor.getBrush() && isScaleUpKey(event)) {
      event.preventDefault()
      this.editor.nudgeScale(1.15)
      this.notice = `放大 ${this.editor.getBrush()?.scale.toFixed(2)}`
      return
    }
    if (this.editor.getBrush() && isScaleDownKey(event)) {
      event.preventDefault()
      this.editor.nudgeScale(1 / 1.15)
      this.notice = `缩小 ${this.editor.getBrush()?.scale.toFixed(2)}`
      return
    }
    if (event.code === 'KeyE') {
      const actor = this.focusActor()
      if (!actor) {
        this.notice = '先选中或接管一个人，再到门边按 E'
        return
      }
      const used = useSelected(this.world, actor, this.packCursor)
      if (used) {
        this.notice = used
        if (this.packCursor?.place === 'hot') {
          const left = actor.hotbar[this.packCursor.index]
          if (!left) {
            this.packCursor = null
            this.hud.setCursor(null)
          }
        }
        return
      }
      if (nearDungeonEntrance(this.world, actor) && enterDungeon(this.world, actor)) {
        this.renderer.recenter()
        this.notice = '进入山洞。清完房间再选奖励，天黑前撤离'
        return
      }
      if (isInDungeon(this.world) && evacuateDungeon(this.world, actor)) {
        this.renderer.recenter()
        this.notice = '已撤离山洞，东西在背包里'
        return
      }
      const gate = interactGate(this.world, actor.position)
      this.notice = gate ? (gate.open ? '门开了' : '门关上了') : '旁边没有门'
    }
    if (event.code === 'F5') {
      event.preventDefault()
      this.saveRun()
      return
    }
    if (event.code === 'F9') {
      event.preventDefault()
      this.loadRun()
      return
    }
    if (event.code.startsWith('Digit')) {
      const index = Number(event.code.slice(5)) - 1
      if (event.shiftKey) {
        if (index === 0) {
          if (this.world.time.phase === 'night') reinforceSector(this.world, 'north')
          else this.zoneJob = 'hunt'
        } else if (index === 1) {
          if (this.world.time.phase === 'night') reinforceSector(this.world, 'east')
          else this.zoneJob = 'fish'
        } else if (index === 2) {
          if (this.world.time.phase === 'night') reinforceSector(this.world, 'south')
          else this.zoneJob = 'scavenge'
        } else if (index === 3 && this.world.time.phase === 'night') reinforceSector(this.world, 'west')
        return
      }
      if (index >= 0 && index <= 8) {
        const actor = this.focusActor()
        if (!actor) {
          this.notice = '先选中或接管一个人'
          return
        }
        const result = selectHotbarSlot(this.world, actor, index)
        this.packCursor = result.cursor
        this.hud.setCursor(result.cursor)
        this.notice = result.notice
        return
      }
    }
    if (event.code === 'KeyH') {
      const count = recallFieldWorkers(this.world)
      this.notice = count > 0 ? `召回 ${count} 名外勤立刻回营` : '没有人在野外'
      return
    }
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
    if (this.editor.getBrush()) {
      this.editor.nudgeScale(event.deltaY > 0 ? 1 / 1.12 : 1.12)
      this.notice = `缩放 ${this.editor.getBrush()?.scale.toFixed(2)}`
      return
    }
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
    if (traveled > 6 && this.pointer.button === 2) this.pointer.dragging = true
    this.pointer.lastX = event.clientX
    this.pointer.lastY = event.clientY
    if (!this.pointer.dragging) return
    if (this.pointer.button === 2) {
      this.renderer.rotateBy(-dx * 0.007)
      this.renderer.pullSideBy(dy)
    }
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
        const placed = placeCreativeAsset(this.world, brush.assetId, hit.x, hit.z, brush.yaw, brush.scale)
        this.renderer.enqueueAsset(brush.assetId)
        if (placed?.kind === 'structure') {
          if (placed.structure.definitionId === 'watchtower') rebuildNightPosts(this.world)
          this.notice = `已当场放下 ${structureLabel(placed.structure)}`
          return
        }
        if (placed?.kind === 'wildlife') {
          persistCreativeWildlife(this.world)
          this.notice = `已放下会走动的${WILDLIFE_LABEL[placed.animal.kind]}`
          return
        }
        this.notice = placed ? `已放下 ${placed.decoration.assetId.split('/').pop()}` : '无法放置这个素材'
        return
      }
      if (button === 2) {
        const marked = markDemolishAt(this.world, { x: hit.x, y: 0, z: hit.z })
        if (marked) {
          persistCreativeStructures(this.world)
          const name = structureLabel(marked.structure)
          this.notice = marked.result === 'cancelled'
            ? `已取消拆除 ${name}`
            : `已标记拆除 ${name}，工匠会过来拆`
          return
        }
        const animal = nearestLivingWildlife(this.world, hit, 2.6)
        if (animal && removeCreativeAnimal(this.world, animal.id)) {
          this.notice = `已收回${WILDLIFE_LABEL[animal.kind]}`
          return
        }
        const target = decorationNear(this.world, hit.x, hit.z)
        if (!target) {
          this.notice = '附近没有可拆的东西'
          return
        }
        removeDecoration(this.world, target.id)
        this.notice = '已拆除装饰'
        return
      }
      return
    }

    const buildMode = this.buildMenu.getSelected()
    if (button === 0 && buildMode === 'upgrade') {
      const id = this.renderer.pickStructure(this.world, event.clientX, event.clientY)
      const structure = id ? this.world.structures.find((entry) => entry.id === id) : undefined
      if (!structure) {
        this.notice = '点要升级的建筑。先把市政大厅升上去，才能抬其他设施上限'
        return
      }
      if (structure.upgrading) {
        this.notice = `${structureLabel(structure)} 正在升级 ${upgradeProgress(structure)}%`
        return
      }
      if (structure.definitionId !== 'hall' && structureLevel(structure) >= facilityCap(this.world)) {
        this.notice = `大厅还是 ${hallLevel(this.world)} 级，先升级市政大厅`
        return
      }
      if (!canUpgrade(this.world, structure)) {
        this.notice = `${structureLabel(structure)} 已到等级上限`
        return
      }
      if (!markUpgrade(this.world, structure)) {
        this.notice = '现在不能升级这座'
        return
      }
      const cost = upgradeCost(structure).map((item) => `${item.count}${itemLabel(item.itemId)}`).join(' ')
      const nextLevel = structure.level + 1
      const extra = structure.definitionId === 'hall'
        ? hallUpgradeHint(nextLevel)
        : ''
      this.notice = `已点升级 ${structureLabel(structure)} 到 ${nextLevel} 级，需 ${cost}。左上角施工队列会显示谁来了、卡在哪${extra}`
      return
    }

    if (button === 0 && buildMode === 'demolish') {
      const hit = this.renderer.pickGround(event.clientX, event.clientY)
      if (!hit) return
      const marked = markDemolishAt(this.world, { x: hit.x, y: 0, z: hit.z })
      if (marked) {
        const name = structureLabel(marked.structure)
        this.notice = marked.result === 'cancelled'
          ? `已取消拆除 ${name}`
          : `已标记拆除 ${name}，工匠会过来拆`
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
      const towerId = this.renderer.pickStructure(this.world, event.clientX, event.clientY)
      const tower = towerId ? findStructure(this.world, towerId) : undefined
      if (tower?.definitionId === 'watchtower') {
        const post = postForTower(this.world, tower)
        if (post) {
          this.towerPostId = post.id
          this.renderTowerPanel()
          this.notice = '点选一个人派上这座瞭望塔'
          return
        }
      }
      const id = this.renderer.pickSurvivor(this.world, event.clientX, event.clientY)
      if (!id) {
        this.towerPostId = null
        this.towerPanel.innerHTML = ''
        this.fireIfPossessed()
        return
      }
      const now = performance.now()
      const doubleClick = this.lastClickId === id && now - this.lastClickAt < 320
      this.lastClickAt = now
      this.lastClickId = id
      this.world.player.selectedId = id
      if (id === this.world.player.heroId) this.renderer.recenter()
      if (doubleClick) this.handleDirect(id)
      return
    }

    if (button === 2 && this.world.player.selectedId && this.world.player.selectedId !== this.world.player.heroId) {
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
      if (!hover) {
        this.renderer.clearBuildPreview()
        this.renderer.setDecorationPreview(null)
        return
      }
      const preview = previewCreativePlacement(this.world, brush.assetId, hover.x, hover.z)
      if (preview) {
        this.renderer.setBuildPreview(
          this.world,
          preview.cells,
          preview.valid,
          facilityPreviewHeight(preview.definitionId),
        )
        const mid = preview.cells[0]
          ? cellCenter(this.world.nav, {
              x: preview.cells.reduce((sum, cell) => sum + cell.x, 0) / preview.cells.length,
              z: preview.cells.reduce((sum, cell) => sum + cell.z, 0) / preview.cells.length,
            })
          : { x: hover.x, z: hover.z }
        this.renderer.setDecorationPreview({
          assetId: brush.assetId,
          x: mid.x,
          z: mid.z,
          yaw: brush.yaw,
          scale: brush.scale,
        })
        return
      }
      this.renderer.clearBuildPreview()
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
    if (!selected || this.world.player.view === 'firstperson') {
      this.renderer.clearBuildPreview()
      return
    }
    const hit = this.renderer.pickGround(this.input.mouseX, this.input.mouseY)
    if (!hit) {
      this.renderer.clearBuildPreview()
      return
    }
    if (selected === 'demolish') {
      const target = demolishTarget(this.world, { x: hit.x, y: 0, z: hit.z })
      if (!target) {
        this.renderer.clearBuildPreview()
        return
      }
      this.renderer.setBuildPreview(
        this.world,
        target.cells,
        false,
        facilityPreviewHeight(target.structure.definitionId),
      )
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

  private updateWorldChrome(): void {
    const id = this.renderer.pickStructure(this.world, this.input.mouseX, this.input.mouseY)
    const structure = id ? this.world.structures.find((entry) => entry.id === id) : undefined
    if (structure) {
      const name = structureLabel(structure)
      const demolishMode = this.buildMenu.getSelected() === 'demolish'
      const upgradeMode = this.buildMenu.getSelected() === 'upgrade'
      const hp = structure.kind === 'wall' || structure.kind === 'gate' ? ` · 耐久 ${durabilityPercent(structure)}%` : ''
      const level = structure.stage === 'complete' ? ` · ${structureLevel(structure)}级` : ''
      const progress = structure.stage === 'complete'
        ? `${level}${hp}${structure.upgrading ? ` · 升级 ${upgradeProgress(structure)}%` : ''}${upgradeMode ? ' · 点击升级' : ''}${demolishMode ? ' · 点击标记拆除' : ''}`
        : structure.stage === 'demolishing'
          ? ` · 拆除 ${buildProgress(structure)}%`
          : ` · ${structure.stage === 'blueprint' || structure.stage === 'hauling' ? '蓝图' : '建造中'} ${buildProgress(structure)}%`
      this.tip.textContent = `${name}${progress}`
      this.tip.style.left = `${this.input.mouseX + 14}px`
      this.tip.style.top = `${this.input.mouseY + 16}px`
      this.tip.classList.add('is-on')
    } else {
      this.tip.classList.remove('is-on')
    }

    const bits: string[] = []
    for (const entry of this.world.structures) {
      if (!entry.cells[0]) continue
      const showBuild = entry.stage !== 'complete'
      const showHp = entry.stage === 'complete' && (entry.kind === 'wall' || entry.kind === 'gate') && entry.hp < entry.maxHp
      const showUp = entry.stage === 'complete' && (entry.upgrading || entry.level > 1 || entry.definitionId === 'hall')
      if (!showBuild && !showHp && !showUp) continue
      const mid = cellCenter(this.world.nav, {
        x: entry.cells.reduce((sum, cell) => sum + cell.x, 0) / entry.cells.length,
        z: entry.cells.reduce((sum, cell) => sum + cell.z, 0) / entry.cells.length,
      })
      const screen = this.renderer.worldToScreen(mid.x, 2.4, mid.z)
      if (!screen) continue
      const text = entry.stage === 'demolishing'
        ? `拆除 ${structureLabel(entry)} ${buildProgress(entry)}%`
        : showBuild
          ? `${structureLabel(entry)} ${buildProgress(entry)}%`
          : entry.upgrading
            ? `${structureLabel(entry)} 升级 ${upgradeProgress(entry)}%`
            : showHp
              ? `耐久 ${durabilityPercent(entry)}%`
              : `${structureLabel(entry)} ${structureLevel(entry)}级`
      const klass = entry.stage === 'demolishing' ? 'build-tag is-wreck' : entry.upgrading ? 'build-tag' : showHp ? 'build-tag is-hp' : 'build-tag'
      bits.push(`<span class="${klass}" style="left:${screen.x}px;top:${screen.y}px">${text}</span>`)
    }
    for (const survivor of this.world.survivors) {
      const y = isSleeping(this.world, survivor) ? 1.55 : 3.15
      const screen = this.renderer.worldToScreen(survivor.position.x, y, survivor.position.z)
      if (!screen) continue
      const lines = activityLines(this.world, survivor)
      const hero = survivor.id === this.world.player.heroId ? ' is-hero' : ''
      const body = lines.map((line, index) => {
        if (index === 0) return `<em>${escapeChrome(line)}</em>`
        if (line.startsWith('+')) return `<i>${escapeChrome(line)}</i>`
        return `<small>${escapeChrome(line)}</small>`
      }).join('')
      bits.push(`<span class="actor-tag${hero}" style="left:${screen.x}px;top:${screen.y}px"><b>${escapeChrome(survivor.name)}</b>${body}</span>`)
    }
    this.labels.innerHTML = bits.join('')
  }

  private renderTowerPanel(): void {
    const post = this.world.nightPosts.find((entry) => entry.id === this.towerPostId)
    if (!post) {
      this.towerPanel.innerHTML = ''
      return
    }
    const people = this.world.survivors
      .filter((survivor) => survivor.id !== this.world.player.heroId)
      .map((survivor) => {
        const on = survivor.watchPostId === post.id ? ' is-on' : ''
        return `<button type="button" class="tower-pick${on}" data-watch="${survivor.id}">${survivor.name}${survivor.watchPostId === post.id ? ' · 在岗' : ''}</button>`
      })
      .join('')
    this.towerPanel.innerHTML = `<div class="tower-card"><strong>瞭望塔站岗</strong><span>点名字派上去，到了会自动锁敌</span>${people}<button type="button" data-watch-close>关闭</button></div>`
    this.towerPanel.querySelectorAll<HTMLButtonElement>('[data-watch]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.watch
        if (!id || !this.towerPostId) return
        if (assignWatch(this.world, this.towerPostId, id)) {
          const name = this.world.survivors.find((entry) => entry.id === id)?.name ?? id
          this.notice = `已派 ${name} 上塔站岗`
          this.renderTowerPanel()
        }
      })
    })
    this.towerPanel.querySelector('[data-watch-close]')?.addEventListener('click', () => {
      this.towerPostId = null
      this.towerPanel.innerHTML = ''
    })
  }

  private applyPackClick(click: PackClick): void {
    const actor = this.focusActor()
    if (!actor) {
      this.notice = '先选中或接管一个人'
      return
    }
    const result = handlePackClick(this.world, actor, this.packCursor, click, this.hud.isBagOpen())
    this.packCursor = result.cursor
    this.hud.setCursor(result.cursor)
    this.notice = result.notice
  }

  private focusActor() {
    if (this.world.player.controlledId) return findSurvivor(this.world, this.world.player.controlledId)
    if (this.world.player.selectedId) return findSurvivor(this.world, this.world.player.selectedId)
    return findSurvivor(this.world, this.world.player.heroId)
  }

  private handleDirect(id: string): void {
    if (id === this.world.player.heroId) {
      possessSurvivor(this.world, id)
      this.renderer.recenter()
      this.notice = '操控冯老师'
      return
    }
    const result = toggleFollow(this.world, id)
    const name = findSurvivor(this.world, id)?.name ?? id
    this.notice = result === 'follow' ? `${name} 开始跟随你` : result === 'idle' ? `${name} 停止跟随` : `无法指挥 ${name}`
  }

  private resetView(): void {
    this.world.player.view = 'topdown'
    this.renderer.resetView()
    this.notice = '镜头已复位'
  }

  private restartRun(): void {
    this.world = createInitialWorld()
    this.towerPostId = null
    this.towerPanel.innerHTML = ''
    this.wallAnchor = null
    this.renderer.resetView()
    this.notice = '新的据点。白天干活建设，夜里守住才能活下去'
  }

  private saveRun(): void {
    this.notice = saveToBrowser(this.world) ? '已保存到本地' : '无法保存'
  }

  private loadRun(): void {
    const loaded = loadFromBrowser()
    if (!loaded) {
      this.notice = '没有存档'
      return
    }
    this.world = loaded
    this.towerPostId = null
    this.towerPanel.innerHTML = ''
    this.wallAnchor = null
    this.packCursor = null
    this.renderer.resetView()
    this.notice = '已读取存档'
  }

  private pickDungeon(pickId: DungeonPickId): void {
    const actor = this.focusActor()
    if (!actor) {
      this.notice = '先选中或接管一个人'
      return
    }
    this.notice = chooseDungeonPick(this.world, actor, pickId)
      ? `选了${PICK_LABEL[pickId]}`
      : '还不能选奖励，先清完这间'
  }

  private advanceRun(): void {
    const actor = this.focusActor()
    if (!actor) {
      this.notice = '先选中或接管一个人'
      return
    }
    if (!advanceDungeon(this.world, actor)) {
      this.notice = '还不能前进'
      return
    }
    const run = this.world.dungeonRun
    if (run) beginTravel(this.world, actor, dungeonRoomCenter(run, run.index + 1))
    this.notice = '走廊开了，走进下一间'
  }

  private leaveDungeon(): void {
    const actor = this.focusActor()
    if (!actor) {
      this.notice = '先选中或接管一个人'
      return
    }
    if (!evacuateDungeon(this.world, actor)) {
      this.notice = '现在不能撤离'
      return
    }
    this.renderer.recenter()
    this.notice = '已撤离山洞，东西在背包里'
  }

  private refreshHud(): void {
    this.hud.render(this.world, this.notice)
    this.sheet.render(this.world)
  }
}

function isScaleUpKey(event: KeyboardEvent): boolean {
  return event.code === 'Equal' || event.code === 'NumpadAdd' || event.key === '=' || event.key === '+'
}

function isScaleDownKey(event: KeyboardEvent): boolean {
  return event.code === 'Minus' || event.code === 'NumpadSubtract' || event.key === '-' || event.key === '_'
}

function hallUpgradeHint(nextLevel: number): string {
  const unlocked = unlocksAtHall(nextLevel)
  const names = [...unlocked.affixes, ...unlocked.procs]
  if (names.length <= 0) return ''
  return `。完成后掉落解锁 ${names.join('、')}`
}

function escapeChrome(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    if (char === '&') return '&amp;'
    if (char === '<') return '&lt;'
    if (char === '>') return '&gt;'
    if (char === '"') return '&quot;'
    return '&#39;'
  })
}
