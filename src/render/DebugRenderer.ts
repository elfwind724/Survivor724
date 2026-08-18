import * as THREE from 'three'
import { structureNear } from '@/base/construction'
import { bedSpot, interiorProps, isCooking, isEating, isSleeping, isWorkingInPlace, sleeperEuler, sleeperWorld } from '@/base/FacilityLife'
import { nearestLivingEnemy } from '@/combat/Combat'
import { isLifeBuilding, TOWER_STAND_HEIGHT } from '@/data/outdoorScenery'
import { assetById } from '@/data/assetIndex'
import { equippedWeapon, WEAPONS } from '@/data/weapons'
import { ENEMY_ASSETS, gateOpenAsset, STRUCTURE_ASSETS, SURVIVOR_ASSETS } from '@/data/worldDressing'
import { cellCenter, worldToCell } from '@/navigation/NavGrid'
import { followCameraOffset } from '@/controls/CameraWish'
import { BASE } from '@/simulation/baseLayout'
import type { GridCell, StructureState, SurvivorState, WorldState } from '@/simulation/types'
import { AssetLibrary } from './AssetLibrary'
import { pickArmedPose, pickCharacterClip, type CharacterPose } from './CharacterClips'
import { barrelTipWorld, findHoldBone, prepareHeldGun, snapHeldGun } from './HeldWeapon'
import { fitToHeight, prepareKit, suggestedScale, SURVIVOR_HEIGHT } from './ModelFit'

interface Marker {
  id: string
  mesh: THREE.Object3D
}

interface CharacterRig {
  mixer: THREE.AnimationMixer
  poses: Partial<Record<CharacterPose, THREE.AnimationAction>>
  current: CharacterPose
  lastX: number
  lastZ: number
  displaySpeed: number
}

export class DebugRenderer {
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  readonly renderer: THREE.WebGLRenderer
  orbitYaw = 0
  sidePull = 0
  distance = 42
  lookAtX = 0
  lookAtZ = 0
  followEnabled = true
  private readonly survivors = new Map<string, Marker>()
  private readonly structures = new Map<string, Marker>()
  private readonly extras: THREE.Object3D[] = []
  private readonly enemies = new Map<string, Marker>()
  private readonly wildlife = new Map<string, Marker>()
  private readonly projectiles = new Map<string, Marker>()
  private viewGun: THREE.Object3D | null = null
  private zones: THREE.Object3D[] = []
  private readonly hemi: THREE.HemisphereLight
  private readonly sun: THREE.DirectionalLight
  private preview: THREE.Group | null = null
  private previewKey = ''
  private readonly library = new AssetLibrary()
  private readonly dressingRoot = new THREE.Group()
  private readonly dressingMeshes = new Map<string, THREE.Object3D>()
  private readonly sceneryMeshes = new Map<string, THREE.Object3D>()
  private readonly kitted = new Map<string, string>()
  private decorPreview: THREE.Group | null = null
  private readonly rigs = new Map<string, CharacterRig>()
  private readonly clock = new THREE.Clock()
  private readonly fireLights = new Map<string, THREE.PointLight>()
  private readonly impacts = new Map<string, Marker>()

  constructor(canvas: HTMLCanvasElement) {
    this.scene.background = new THREE.Color(0x1b2124)
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500)
    this.camera.position.set(0, 48, 36)
    this.camera.lookAt(0, 0, 0)

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.15
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    this.hemi = new THREE.HemisphereLight(0xdde6d8, 0x2a2f28, 1.1)
    this.sun = new THREE.DirectionalLight(0xfff1d0, 1.35)
    this.sun.position.set(28, 48, 16)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    this.sun.shadow.camera.left = -90
    this.sun.shadow.camera.right = 90
    this.sun.shadow.camera.top = 90
    this.sun.shadow.camera.bottom = -90
    this.scene.add(this.hemi, this.sun)
    this.scene.fog = new THREE.Fog(0x8fa4c4, 90, 260)

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(360, 360),
      new THREE.MeshLambertMaterial({ color: 0x3a4a36 }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.name = 'ground'
    ground.receiveShadow = true
    this.scene.add(ground)

    const yard = new THREE.Mesh(
      new THREE.PlaneGeometry(BASE.east - BASE.west + 10, BASE.north - BASE.south + 10),
      new THREE.MeshLambertMaterial({ color: 0x5c5342 }),
    )
    yard.rotation.x = -Math.PI / 2
    yard.position.set((BASE.west + BASE.east) / 2, 0.02, (BASE.south + BASE.north) / 2)
    yard.receiveShadow = true
    this.scene.add(yard)
    this.dressingRoot.name = 'dressing'
    this.scene.add(this.dressingRoot)
    this.library.enqueue(this.bootIds())

    window.addEventListener('resize', this.resize)
    this.resize()
  }

  pickGround(clientX: number, clientY: number): THREE.Vector3 | null {
    const rect = this.renderer.domElement.getBoundingClientRect()
    const pointer = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1),
    )
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(pointer, this.camera)
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    const hit = new THREE.Vector3()
    return raycaster.ray.intersectPlane(plane, hit) ? hit : null
  }

  pickStructure(world: WorldState, clientX: number, clientY: number): string | null {
    const hit = this.pickGround(clientX, clientY)
    if (!hit) return null
    return structureNear(world, { x: hit.x, y: 0, z: hit.z }, 4.5)?.id ?? null
  }

  worldToScreen(x: number, y: number, z: number): { x: number; y: number } | null {
    const point = new THREE.Vector3(x, y, z).project(this.camera)
    if (point.z > 1) return null
    return {
      x: (point.x * 0.5 + 0.5) * window.innerWidth,
      y: (-point.y * 0.5 + 0.5) * window.innerHeight,
    }
  }

  pickSurvivor(world: WorldState, clientX: number, clientY: number): string | null {
    const hit = this.pickGround(clientX, clientY)
    if (!hit) return null
    let bestId: string | null = null
    let best = 2.2
    for (const survivor of world.survivors) {
      const distance = Math.hypot(survivor.position.x - hit.x, survivor.position.z - hit.z)
      if (distance < best) {
        best = distance
        bestId = survivor.id
      }
    }
    return bestId
  }

  zoomBy(deltaY: number): void {
    const next = this.distance + Math.sign(deltaY) * 4
    this.distance = Math.min(90, Math.max(16, next))
  }

  rotateBy(delta: number): void {
    this.orbitYaw += delta
  }

  pullSideBy(screenDy: number): void {
    this.sidePull = Math.min(1, Math.max(0, this.sidePull + screenDy * 0.008))
  }

  panBy(screenDx: number, screenDy: number): void {
    this.nudgeLook(screenDx * this.distance * 0.0024, -screenDy * this.distance * 0.0024)
  }

  nudgeLook(right: number, forward: number): void {
    this.followEnabled = false
    const forwardX = -Math.sin(this.orbitYaw)
    const forwardZ = -Math.cos(this.orbitYaw)
    const rightX = -forwardZ
    const rightZ = forwardX
    this.lookAtX += rightX * right + forwardX * forward
    this.lookAtZ += rightZ * right + forwardZ * forward
  }

  recenter(): void {
    this.followEnabled = true
  }

  resetView(): void {
    this.orbitYaw = 0
    this.sidePull = 0
    this.distance = 42
    this.followEnabled = true
  }

  setBuildPreview(
    world: WorldState,
    cells: GridCell[],
    valid: boolean,
    height = 2.6,
    anchor: GridCell | null = null,
  ): void {
    const key = `${valid}:${height}:${anchor ? `${anchor.x},${anchor.z}` : '-'}:${cells.map((cell) => `${cell.x},${cell.z}`).join(';')}`
    if (key === this.previewKey) return
    this.clearBuildPreview()
    this.previewKey = key
    if (cells.length === 0 && !anchor) return

    const group = new THREE.Group()
    group.renderOrder = 20
    const color = valid ? 0x7ad0ff : 0xe15b4a
    const positions: number[] = []
    for (const cell of cells) {
      this.pushCellFrame(world, cell, height, positions)
      const fill = new THREE.Mesh(
        new THREE.PlaneGeometry(world.nav.cellSize * 0.9, world.nav.cellSize * 0.9),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.22,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      )
      const center = cellCenter(world.nav, cell)
      fill.rotation.x = -Math.PI / 2
      fill.position.set(center.x, 0.07, center.z)
      fill.renderOrder = 18
      group.add(fill)
    }
    if (anchor) this.pushCellFrame(world, anchor, height + 0.45, positions)

    if (positions.length > 0) {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      const lines = new THREE.LineSegments(
        geometry,
        new THREE.LineBasicMaterial({ color: valid ? 0xb7e7ff : 0xff8a7a, depthTest: false }),
      )
      lines.renderOrder = 21
      group.add(lines)
    }
    this.preview = group
    this.scene.add(group)
  }

  clearBuildPreview(): void {
    this.previewKey = ''
    if (!this.preview) return
    this.preview.traverse((object) => {
      if (!(object instanceof THREE.Mesh) && !(object instanceof THREE.LineSegments)) return
      object.geometry.dispose()
      const material = object.material
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose())
      else if (material instanceof THREE.Material) material.dispose()
    })
    this.scene.remove(this.preview)
    this.preview = null
  }

  private pushCellFrame(world: WorldState, cell: GridCell, height: number, positions: number[]): void {
    const center = cellCenter(world.nav, cell)
    const s = world.nav.cellSize * 0.48
    const y0 = 0.08
    const y1 = height
    const corners = [
      [center.x - s, y0, center.z - s],
      [center.x + s, y0, center.z - s],
      [center.x + s, y0, center.z + s],
      [center.x - s, y0, center.z + s],
      [center.x - s, y1, center.z - s],
      [center.x + s, y1, center.z - s],
      [center.x + s, y1, center.z + s],
      [center.x - s, y1, center.z + s],
    ]
    const edges: Array<[number, number]> = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7],
    ]
    for (const [a, b] of edges) {
      const from = corners[a]
      const to = corners[b]
      if (!from || !to) continue
      positions.push(from[0]!, from[1]!, from[2]!, to[0]!, to[1]!, to[2]!)
    }
  }

  sync(world: WorldState): void {
    const dt = this.clock.getDelta()
    this.library.tick()
    this.ensureStatic(world)
    this.kitExtras()
    this.syncDressing(world)
    this.syncScenery(world)
    this.syncLighting(world)
    this.syncFireLights(world)
    this.syncZones(world)
    this.syncStructures(world)
    this.syncEnemies(world, dt)
    this.syncActors(world.wildlife, this.wildlife, 1.4, 1.1, 0xb8a078)
    for (const survivor of world.survivors) {
      let marker = this.survivors.get(survivor.id)
      if (!marker) {
        const mesh = this.createSurvivorMarker()
        this.scene.add(mesh)
        marker = { id: survivor.id, mesh }
        this.survivors.set(survivor.id, marker)
      }
      this.kitSurvivor(survivor)
      const kit = marker.mesh.getObjectByName('kit')
      const sleeping = isSleeping(world, survivor)
      const cooking = isCooking(world, survivor)
      const building = isBuildingNow(world, survivor)
      const bob = cooking || building ? 0.05 + Math.sin(world.time.daySeconds * 9) * 0.045 : 0
      if (sleeping) {
        const pose = sleeperEuler()
        const spot = sleeperWorld(bedSpot(world, survivor))
        marker.mesh.position.set(spot.x, spot.y, spot.z)
        marker.mesh.rotation.order = pose.order
        marker.mesh.rotation.set(pose.x, pose.y, pose.z)
      } else {
        const deck = this.watchDeck(world, survivor)
        marker.mesh.position.set(deck.x, deck.y + bob, deck.z)
        const aim = nearestLivingEnemy(world, survivor.position, 42)
        const yaw = aim
          ? Math.atan2(aim.position.x - survivor.position.x, aim.position.z - survivor.position.z)
          : survivor.facingYaw
        let pitch = 0
        if (aim && deck.y > 0.8) {
          const dist = Math.hypot(aim.position.x - survivor.position.x, aim.position.z - survivor.position.z)
          pitch = Math.atan2(0.9 - (deck.y + 1.5), Math.max(1, dist))
        }
        marker.mesh.rotation.order = 'YXZ'
        marker.mesh.rotation.set(pitch, yaw, 0)
      }
      this.driveRig(world, survivor, dt)
      kit?.updateMatrixWorld(true)
      this.syncHeldGun(world, survivor)
      const fallback = marker.mesh.getObjectByName('fallback')
      if (fallback instanceof THREE.Mesh && fallback.material instanceof THREE.MeshLambertMaterial) {
        const controlled = world.player.controlledId === survivor.id
        const selected = world.player.selectedId === survivor.id
        fallback.material.color.set(controlled ? 0xf0d27a : selected ? 0xd8c4a0 : 0xc4b39a)
        fallback.visible = !kit
        fallback.position.y = 0.9
      }
    }
    this.syncProjectiles(world)
    this.syncImpacts(world)
    this.syncViewGun(world)
    this.updateCamera(world)
  }

  private updateCamera(world: WorldState): void {
    const focusId = world.player.controlledId ?? world.player.selectedId
    const focus = world.survivors.find((survivor) => survivor.id === focusId)
    if (!focus) return

    if (world.player.view === 'firstperson' && world.player.controlledId) {
      this.camera.fov = 70
      this.camera.updateProjectionMatrix()
      this.camera.position.set(focus.position.x, 1.65, focus.position.z)
      this.camera.lookAt(
        focus.position.x + Math.sin(focus.facingYaw),
        1.65,
        focus.position.z + Math.cos(focus.facingYaw),
      )
      const marker = this.survivors.get(focus.id)
      if (marker) marker.mesh.visible = false
      return
    }

    for (const marker of this.survivors.values()) marker.mesh.visible = true
    this.camera.fov = 50
    this.camera.updateProjectionMatrix()
    if (this.followEnabled || world.player.controlledId) {
      this.lookAtX = focus.position.x
      this.lookAtZ = focus.position.z
    }
    const target = new THREE.Vector3(this.lookAtX, 0, this.lookAtZ)
    const offset = followCameraOffset(this.orbitYaw, this.distance, this.sidePull)
    const desired = new THREE.Vector3(
      this.lookAtX + offset.x,
      offset.y,
      this.lookAtZ + offset.z,
    )
    this.camera.position.lerp(desired, 0.22)
    this.camera.lookAt(target)
  }

  draw(): void {
    this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    window.removeEventListener('resize', this.resize)
    this.renderer.dispose()
  }

  private syncStructures(world: WorldState): void {
    const seen = new Set<string>()
    for (const structure of world.structures) {
      seen.add(structure.id)
      const cellSig = structure.cells.map((cell) => `${cell.x},${cell.z}`).join(';')
      let marker = this.structures.get(structure.id)
      if (marker && marker.mesh.userData.cellSig !== cellSig) {
        this.disposeObject(marker.mesh)
        this.kitted.delete(structure.id)
        this.structures.delete(structure.id)
        marker = undefined
      }
      if (!marker) {
        const mesh = this.createStructureMesh(world, structure)
        mesh.userData.cellSig = cellSig
        this.scene.add(mesh)
        marker = { id: structure.id, mesh }
        this.structures.set(structure.id, marker)
      }
      this.kitStructure(world, structure, marker.mesh, cellSig)
      this.styleStructure(marker.mesh, structure)
      this.styleFacilityLife(world, structure, marker.mesh)
      this.syncWreckMarker(world, structure, marker.mesh)
    }
    for (const [id, marker] of this.structures) {
      if (seen.has(id)) continue
      this.disposeObject(marker.mesh)
      this.kitted.delete(id)
      this.structures.delete(id)
    }
  }

  private createStructureMesh(world: WorldState, structure: StructureState): THREE.Group {
    const group = new THREE.Group()
    const height = structure.kind === 'building' ? 4.2 : 2.6
    const size = world.nav.cellSize * 0.92
    for (const cell of structure.cells) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(size, height, size),
        new THREE.MeshLambertMaterial({ color: 0x6b6254, transparent: true, opacity: 1 }),
      )
      const center = cellCenter(world.nav, cell)
      mesh.position.set(center.x, height / 2, center.z)
      mesh.userData.baseHeight = height
      group.add(mesh)
    }
    return group
  }

  private styleStructure(root: THREE.Object3D, structure: StructureState): void {
    const hasKit = root.children.some((child) => child.name === 'kit')
    const meshes = root instanceof THREE.Mesh ? [root] : root.children
    for (const mesh of meshes) {
      if (mesh.name === 'kit' || mesh.parent?.name === 'kit' || mesh.name === 'wreck') continue
      if (!(mesh instanceof THREE.Mesh) || !(mesh.material instanceof THREE.MeshLambertMaterial)) continue
      const material = mesh.material
      const baseHeight = typeof mesh.userData.baseHeight === 'number' ? mesh.userData.baseHeight : 2.6
      if (structure.stage === 'demolishing') {
        material.color.set(0xc44a32)
        material.opacity = 0.5
        material.transparent = true
        mesh.scale.y = 0.28
        mesh.position.y = 0.36
        mesh.visible = !hasKit
        continue
      }
      if (structure.stage !== 'complete') {
        material.color.set(0x3d7ea6)
        material.opacity = 0.45
        material.transparent = true
        mesh.scale.y = 0.22
        mesh.position.y = 0.28
        mesh.visible = true
        continue
      }
      material.transparent = false
      material.opacity = 1
      mesh.visible = !hasKit
      if (structure.kind === 'gate') {
        mesh.scale.y = structure.open ? 0.2 : 1
        mesh.position.y = structure.open ? 0.25 : baseHeight / 2
      } else {
        const ratio = structure.maxHp > 0 ? structure.hp / structure.maxHp : 1
        mesh.scale.y = 0.35 + 0.65 * ratio
        mesh.position.y = (baseHeight * mesh.scale.y) / 2
      }
      material.color.set(structure.kind === 'gate' ? 0x8a6a3a : structure.kind === 'building' ? 0x7a5a42 : 0x6b6254)
    }
  }

  private styleFacilityLife(world: WorldState, structure: StructureState, root: THREE.Object3D): void {
    if (structure.kind !== 'building') return
    if (structure.stage === 'demolishing') {
      const hasKit = root.children.some((child) => child.name === 'kit')
      for (const child of root.children) {
        if (child.name === 'interior' || child.name === 'open-shell' || child.name === 'steam') child.visible = false
        else if (child.name === 'kit' || child.name === 'wreck') child.visible = true
        else if (child instanceof THREE.Mesh) child.visible = !hasKit
      }
      return
    }
    if (structure.stage !== 'complete') return
    const open = world.showInteriors && isLifeBuilding(structure.definitionId)
    this.ensureInterior(world, structure, root)
    this.ensureOpenShell(world, structure, root)
    const hasKit = root.children.some((child) => child.name === 'kit')
    for (const child of root.children) {
      if (child.name === 'interior' || child.name === 'steam' || child.name === 'open-shell') child.visible = open
      else if (child.name === 'kit') child.visible = !open
      else if (child instanceof THREE.Mesh) child.visible = !open && !hasKit
    }
    if (structure.definitionId === 'kitchen') this.pulseKitchen(world, root, open)
  }

  private syncWreckMarker(world: WorldState, structure: StructureState, root: THREE.Object3D): void {
    const existing = root.getObjectByName('wreck')
    if (structure.stage !== 'demolishing') {
      if (!existing) return
      existing.removeFromParent()
      this.disposeObject(existing)
      return
    }
    if (existing) {
      existing.visible = true
      return
    }
    root.add(this.createWreckMarker(world, structure))
  }

  private createWreckMarker(world: WorldState, structure: StructureState): THREE.Group {
    const group = new THREE.Group()
    group.name = 'wreck'
    const color = 0xe24a32
    const positions: number[] = []
    const height = structure.kind === 'building' ? 4.6 : 2.8
    for (const cell of structure.cells) {
      this.pushCellFrame(world, cell, height, positions)
      const fill = new THREE.Mesh(
        new THREE.PlaneGeometry(world.nav.cellSize * 0.92, world.nav.cellSize * 0.92),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.28,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      )
      const center = cellCenter(world.nav, cell)
      fill.rotation.x = -Math.PI / 2
      fill.position.set(center.x, 0.09, center.z)
      fill.renderOrder = 19
      group.add(fill)
    }
    const xs = structure.cells.map((cell) => cell.x)
    const zs = structure.cells.map((cell) => cell.z)
    if (xs.length > 0 && zs.length > 0) {
      const mid = cellCenter(world.nav, {
        x: (Math.min(...xs) + Math.max(...xs)) / 2,
        z: (Math.min(...zs) + Math.max(...zs)) / 2,
      })
      const span = Math.max(Math.max(...xs) - Math.min(...xs) + 1, Math.max(...zs) - Math.min(...zs) + 1)
      const arm = Math.max(1.2, Math.min(3.6, span * 0.38))
      const barMat = new THREE.MeshBasicMaterial({ color: 0xff5a3c, depthTest: false })
      const barGeo = new THREE.BoxGeometry(arm * 2, 0.16, 0.22)
      const left = new THREE.Mesh(barGeo, barMat)
      const right = new THREE.Mesh(barGeo, barMat.clone())
      left.position.set(mid.x, height + 0.35, mid.z)
      right.position.set(mid.x, height + 0.35, mid.z)
      left.rotation.y = Math.PI / 4
      right.rotation.y = -Math.PI / 4
      left.renderOrder = 22
      right.renderOrder = 22
      group.add(left, right)
    }
    if (positions.length > 0) {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      const lines = new THREE.LineSegments(
        geometry,
        new THREE.LineBasicMaterial({ color: 0xff8a7a, depthTest: false }),
      )
      lines.renderOrder = 21
      group.add(lines)
    }
    return group
  }

  private ensureInterior(world: WorldState, structure: StructureState, root: THREE.Object3D): void {
    const existing = root.getObjectByName('interior')
    const props = interiorProps(world, structure)
    if (props.length === 0) return
    const layout = props.map((prop) => `${prop.assetId}:${prop.yaw.toFixed(2)}:${prop.scale ?? 1}:${prop.x.toFixed(2)}:${prop.z.toFixed(2)}`).join('|')
    if (existing && existing.userData.layout === layout) return
    if (existing) {
      existing.removeFromParent()
      this.disposeObject(existing)
    }
    const group = new THREE.Group()
    group.name = 'interior'
    group.visible = true
    for (const prop of props) {
      this.enqueueAsset(prop.assetId)
      const kit = this.spawnKit(prop.assetId, prop.scale)
      if (!kit) continue
      kit.position.set(0, 0, 0)
      kit.rotation.y = prop.yaw
      kit.updateMatrixWorld(true)
      const box = new THREE.Box3().setFromObject(kit)
      const center = box.getCenter(new THREE.Vector3())
      kit.position.set(prop.x - center.x, 0.08 - box.min.y, prop.z - center.z)
      group.add(kit)
    }
    if (group.children.length === 0) return
    group.userData.layout = layout
    root.add(group)
  }

  private ensureOpenShell(world: WorldState, structure: StructureState, root: THREE.Object3D): void {
    if (root.getObjectByName('open-shell') || !isLifeBuilding(structure.definitionId)) return
    const xs = structure.cells.map((cell) => cell.x)
    const zs = structure.cells.map((cell) => cell.z)
    if (xs.length === 0 || zs.length === 0) return
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minZ = Math.min(...zs)
    const maxZ = Math.max(...zs)
    const mid = cellCenter(world.nav, { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 })
    const size = world.nav.cellSize
    const width = (maxX - minX + 1) * size
    const depth = (maxZ - minZ + 1) * size
    const group = new THREE.Group()
    group.name = 'open-shell'
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(width - 0.12, depth - 0.12),
      new THREE.MeshLambertMaterial({ color: 0x8b7355, side: THREE.DoubleSide }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.set(mid.x, 0.025, mid.z)
    floor.receiveShadow = true
    group.add(floor)
    const wallH = 0.42
    const wallT = 0.1
    const walls = [
      { w: width, d: wallT, x: mid.x, z: mid.z - depth / 2 + wallT / 2 },
      { w: width, d: wallT, x: mid.x, z: mid.z + depth / 2 - wallT / 2 },
      { w: wallT, d: depth, x: mid.x - width / 2 + wallT / 2, z: mid.z },
      { w: wallT, d: depth, x: mid.x + width / 2 - wallT / 2, z: mid.z },
    ]
    for (const wall of walls) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(wall.w, wallH, wall.d),
        new THREE.MeshLambertMaterial({ color: 0x6b5340 }),
      )
      mesh.position.set(wall.x, wallH / 2, wall.z)
      group.add(mesh)
    }
    root.add(group)
  }

  private pulseKitchen(world: WorldState, root: THREE.Object3D, occupied: boolean): void {
    let steam = root.getObjectByName('steam')
    if (!steam) {
      const geometry = new THREE.BufferGeometry()
      const count = 18
      const positions = new Float32Array(count * 3)
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      const points = new THREE.Points(
        geometry,
        new THREE.PointsMaterial({ color: 0xf0e6d0, size: 0.16, transparent: true, opacity: 0.55, depthWrite: false }),
      )
      points.name = 'steam'
      points.visible = false
      root.add(points)
      steam = points
    }
    steam.visible = occupied
    if (!occupied || !(steam instanceof THREE.Points)) return
    const attr = steam.geometry.getAttribute('position')
    const t = world.time.daySeconds
    for (let i = 0; i < attr.count; i += 1) {
      const rise = ((t * 0.7 + i * 0.17) % 1.6)
      attr.setXYZ(i, Math.sin(t * 1.7 + i) * 0.28, 1.1 + rise, Math.cos(t * 1.3 + i * 0.6) * 0.22)
    }
    attr.needsUpdate = true
  }

  private disposeObject(object: THREE.Object3D): void {
    this.scene.remove(object)
    object.removeFromParent()
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh) && !(child instanceof THREE.LineSegments)) return
      child.geometry.dispose()
      const material = child.material
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose())
      else if (material instanceof THREE.Material) material.dispose()
    })
  }

  private syncZones(world: WorldState): void {
    if (this.zones.length === world.workZones.length) return
    for (const mesh of this.zones) this.scene.remove(mesh)
    this.zones = []
    for (const zone of world.workZones) {
      const w = Math.max(1, zone.maxX - zone.minX)
      const d = Math.max(1, zone.maxZ - zone.minZ)
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(w, d),
        new THREE.MeshBasicMaterial({ color: 0x88aa66, transparent: true, opacity: 0.12, side: THREE.DoubleSide }),
      )
      mesh.rotation.x = -Math.PI / 2
      mesh.position.set((zone.minX + zone.maxX) / 2, 0.05, (zone.minZ + zone.maxZ) / 2)
      this.scene.add(mesh)
      this.zones.push(mesh)
    }
  }

  private ensureStatic(world: WorldState): void {
    if (this.extras.length > 0) return

    const hasWarehouse = world.structures.some((structure) => structure.definitionId === 'warehouse' && structure.stage === 'complete')
    const hasWorkshop = world.structures.some((structure) => structure.definitionId === 'workshop' && structure.stage === 'complete')
    for (const container of world.containers) {
      if (container.kind === 'warehouse' && hasWarehouse) continue
      if (container.kind === 'tool_locker' && hasWorkshop) continue
      const isLocker = container.kind === 'tool_locker'
      const group = new THREE.Group()
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(isLocker ? 4 : 10, isLocker ? 3 : 5, isLocker ? 4 : 8),
        new THREE.MeshLambertMaterial({ color: isLocker ? 0x8a6a3a : 0x6b6254 }),
      )
      mesh.name = 'fallback'
      mesh.position.y = isLocker ? 1.5 : 2.5
      group.position.set(container.position.x, 0, container.position.z)
      group.userData.assetId = isLocker ? STRUCTURE_ASSETS.locker : STRUCTURE_ASSETS.warehouse
      group.add(mesh)
      this.scene.add(group)
      this.extras.push(group)
    }

    for (const node of world.nodes) {
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(1.6, 1.6, 0.4, 10),
        new THREE.MeshLambertMaterial({ color: node.kind === 'hunt' ? 0x4d6b3c : node.kind === 'fish' ? 0x3c5d6b : 0x6b4d3c }),
      )
      mesh.position.set(node.position.x, 0.2, node.position.z)
      this.scene.add(mesh)
      this.extras.push(mesh)
    }

    const stream = new THREE.Mesh(
      new THREE.PlaneGeometry(42, 7),
      new THREE.MeshLambertMaterial({ color: 0x3d7290, transparent: true, opacity: 0.88 }),
    )
    stream.rotation.x = -Math.PI / 2
    stream.rotation.z = 0.45
    stream.position.set(-54, 0.05, 32)
    this.scene.add(stream)
    this.extras.push(stream)
  }

  private syncLighting(world: WorldState): void {
    if (world.time.phase === 'night') {
      this.scene.background = new THREE.Color(0x1a2430)
      if (this.scene.fog instanceof THREE.Fog) {
        this.scene.fog.color.set(0x1a2430)
        this.scene.fog.near = 80
        this.scene.fog.far = 240
      }
      this.hemi.intensity = 0.78
      this.sun.intensity = 0.35
      return
    }
    if (world.time.phase === 'dusk') {
      this.scene.background = new THREE.Color(0x3a261c)
      if (this.scene.fog instanceof THREE.Fog) {
        this.scene.fog.color.set(0x3a261c)
        this.scene.fog.near = 80
        this.scene.fog.far = 240
      }
      this.hemi.intensity = 0.95
      this.sun.intensity = 0.7
      return
    }
    this.scene.background = new THREE.Color(0x8fa4c4)
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.set(0x8fa4c4)
      this.scene.fog.near = 90
      this.scene.fog.far = 260
    }
    this.hemi.intensity = 1.15
    this.sun.intensity = 1.45
  }

  private syncActors(
    actors: Array<{ id: string; position: { x: number; z: number }; facingYaw?: number; alive?: boolean }>,
    store: Map<string, Marker>,
    width: number,
    height: number,
    color: number,
  ): void {
    const seen = new Set<string>()
    for (const actor of actors) {
      seen.add(actor.id)
      let marker = store.get(actor.id)
      if (!marker) {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(width, height, width * 0.7),
          new THREE.MeshLambertMaterial({ color }),
        )
        this.scene.add(mesh)
        marker = { id: actor.id, mesh }
        store.set(actor.id, marker)
      }
      if (marker.mesh instanceof THREE.Mesh && marker.mesh.material instanceof THREE.MeshLambertMaterial) {
        marker.mesh.material.color.set(actor.alive === false ? 0x6a5040 : color)
      }
      marker.mesh.position.set(actor.position.x, height / 2, actor.position.z)
      if (actor.facingYaw !== undefined) marker.mesh.rotation.y = actor.facingYaw
    }
    for (const [id, marker] of store) {
      if (seen.has(id)) continue
      this.scene.remove(marker.mesh)
      store.delete(id)
    }
  }

  private syncEnemies(world: WorldState, dt: number): void {
    const seen = new Set<string>()
    for (const enemy of world.enemies) {
      seen.add(enemy.id)
      let marker = this.enemies.get(enemy.id)
      if (!marker) {
        const mesh = this.createSurvivorMarker()
        this.scene.add(mesh)
        marker = { id: enemy.id, mesh }
        this.enemies.set(enemy.id, marker)
      }
      this.kitEnemy(enemy)
      this.markEnemy(marker.mesh, enemy.hitFlash)
      marker.mesh.position.set(enemy.position.x, 0, enemy.position.z)
      marker.mesh.rotation.y = enemy.facingYaw
      this.driveEnemy(enemy, dt)
      const kit = marker.mesh.getObjectByName('kit')
      const fallback = marker.mesh.getObjectByName('fallback')
      if (fallback) fallback.visible = !kit
      marker.mesh.scale.setScalar(1)
    }
    for (const [id, marker] of this.enemies) {
      if (seen.has(id)) continue
      this.disposeObject(marker.mesh)
      this.rigs.delete(id)
      this.enemies.delete(id)
    }
  }

  private kitEnemy(enemy: { id: string; kind: string; position: { x: number; z: number } }): void {
    const marker = this.enemies.get(enemy.id)
    const assetId = ENEMY_ASSETS[enemy.kind] ?? 'people/zombie'
    this.enqueueAsset(assetId)
    if (!marker || marker.mesh.getObjectByName('kit')) return
    const kit = this.spawnKit(assetId, 1)
    if (!kit) return
    fitToHeight(kit, enemy.kind === 'runner' ? 1.08 : 2.45)
    marker.mesh.add(kit)
    const mixer = new THREE.AnimationMixer(kit)
    const clips = this.library.clips(assetId)
    const poses: CharacterRig['poses'] = {}
    for (const kind of ['idle', 'walk', 'run'] as const) {
      const clip = pickCharacterClip(clips, kind)
      if (clip) poses[kind] = mixer.clipAction(clip)
    }
    poses.idle?.play()
    this.rigs.set(enemy.id, {
      mixer,
      poses,
      current: 'idle',
      lastX: enemy.position.x,
      lastZ: enemy.position.z,
      displaySpeed: 0,
    })
  }

  private driveEnemy(enemy: { id: string; position: { x: number; z: number } }, dt: number): void {
    const rig = this.rigs.get(enemy.id)
    if (!rig) return
    const speed = Math.hypot(enemy.position.x - rig.lastX, enemy.position.z - rig.lastZ) / Math.max(dt, 1 / 120)
    rig.lastX = enemy.position.x
    rig.lastZ = enemy.position.z
    rig.displaySpeed = speed > 0.2 ? speed : rig.displaySpeed * Math.exp(-dt * 12)
    const next = rig.displaySpeed > 2.6 ? 'run' : rig.displaySpeed > 0.35 ? 'walk' : 'idle'
    if (next !== rig.current) {
      rig.poses[rig.current]?.fadeOut(0.12)
      rig.poses[next]?.reset().fadeIn(0.12).play()
      rig.current = next
    }
    rig.mixer.update(dt)
  }

  private bootIds(): string[] {
    const ids = [
      ...Object.values(SURVIVOR_ASSETS),
      ...Object.values(ENEMY_ASSETS),
      ...Object.values(STRUCTURE_ASSETS),
      'fort/wall-towers',
      'fort/wall-towers-door-seco',
      'survival/bonfire',
      'survival/tent',
      'nature/pine',
      'nature/tree',
      ...WEAPONS.map((weapon) => weapon.assetId),
      'interior/bed-single',
      'interior/oven',
      'interior/kitchen-sink',
      'interior/kitchen-fridge',
      'interior/table-round-small',
      'interior/table-round-large',
      'interior/chair',
      'interior/night-stand',
      'interior/shelf-large',
      'interior/shelf-small',
      'food/cooking-pot',
      'food/frying-pan',
      'fort/mountain',
    ]
    return ids
  }

  enqueueAsset(id: string): void {
    this.library.enqueue([id])
  }

  setDecorationPreview(pose: { assetId: string; x: number; z: number; yaw: number; scale: number } | null): void {
    if (!pose) {
      if (this.decorPreview) {
        this.scene.remove(this.decorPreview)
        this.decorPreview = null
      }
      return
    }
    this.enqueueAsset(pose.assetId)
    if (!this.decorPreview) {
      const group = new THREE.Group()
      group.name = 'decor-preview'
      const frame = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(1.2, 1.4, 1.2)),
        new THREE.LineBasicMaterial({ color: 0x7ad0ff, depthTest: false }),
      )
      frame.position.y = 0.7
      frame.name = 'ghost-frame'
      frame.renderOrder = 30
      group.add(frame)
      this.scene.add(group)
      this.decorPreview = group
    }
    this.decorPreview.position.set(pose.x, 0, pose.z)
    this.decorPreview.rotation.y = pose.yaw
    const existing = this.decorPreview.getObjectByName('kit')
    if (existing?.userData.previewId !== pose.assetId) {
      if (existing) this.decorPreview.remove(existing)
      const kit = this.spawnKit(pose.assetId, pose.scale)
      if (kit) {
        kit.userData.previewId = pose.assetId
        ghostMaterial(kit)
        this.decorPreview.add(kit)
      }
    }
  }

  private syncDressing(world: WorldState): void {
    const seen = new Set<string>()
    for (const pose of world.decorations) {
      seen.add(pose.id)
      this.enqueueAsset(pose.assetId)
      let mesh = this.dressingMeshes.get(pose.id)
      if (!mesh) {
        const kit = this.spawnKit(pose.assetId, pose.scale)
        if (!kit) continue
        this.dressingRoot.add(kit)
        this.dressingMeshes.set(pose.id, kit)
        mesh = kit
      }
      mesh.position.x = pose.x
      mesh.position.z = pose.z
      mesh.rotation.y = pose.yaw
    }
    for (const [id, mesh] of this.dressingMeshes) {
      if (seen.has(id)) continue
      this.dressingRoot.remove(mesh)
      this.dressingMeshes.delete(id)
    }
  }

  private syncScenery(world: WorldState): void {
    const seen = new Set<string>()
    for (const pose of world.scenery) {
      seen.add(pose.id)
      this.enqueueAsset(pose.assetId)
      let mesh = this.sceneryMeshes.get(pose.id)
      if (!mesh) {
        const kit = this.spawnKit(pose.assetId, pose.scale)
        if (!kit) continue
        this.dressingRoot.add(kit)
        this.sceneryMeshes.set(pose.id, kit)
        mesh = kit
      }
      mesh.position.x = pose.x
      mesh.position.z = pose.z
      mesh.rotation.y = pose.yaw
    }
    for (const [id, mesh] of this.sceneryMeshes) {
      if (seen.has(id)) continue
      this.dressingRoot.remove(mesh)
      this.sceneryMeshes.delete(id)
    }
  }

  private createSurvivorMarker(): THREE.Group {
    const group = new THREE.Group()
    const fallback = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 1.8, 0.6),
      new THREE.MeshLambertMaterial({ color: 0xc4b39a }),
    )
    fallback.name = 'fallback'
    fallback.position.y = 0.9
    fallback.castShadow = true
    group.add(fallback)
    return group
  }

  private syncHeldGun(world: WorldState, survivor: SurvivorState): void {
    const marker = this.survivors.get(survivor.id)
    if (!marker) return
    const weapon = isSleeping(world, survivor) ? undefined : equippedWeapon(survivor)
    const want = weapon?.assetId ?? ''
    const existing = marker.mesh.getObjectByName('held-gun')
    const kit = marker.mesh.getObjectByName('kit')
    const hand = kit ? findHoldBone(kit) : null
    if (existing && existing.userData.weaponAsset === want && weapon && hand) {
      snapHeldGun(marker.mesh, hand, existing, weapon.id)
      return
    }
    if (existing) existing.removeFromParent()
    if (!weapon || !hand) return
    this.enqueueAsset(weapon.assetId)
    const raw = this.library.clone(weapon.assetId)
    if (!raw) return
    const gun = prepareHeldGun(raw)
    gun.name = 'held-gun'
    gun.userData.weaponAsset = weapon.assetId
    gun.userData.weaponId = weapon.id
    snapHeldGun(marker.mesh, hand, gun, weapon.id)
  }

  private syncViewGun(world: WorldState): void {
    const self = world.player.view === 'firstperson' && world.player.controlledId
      ? world.survivors.find((entry) => entry.id === world.player.controlledId)
      : undefined
    const weapon = self ? equippedWeapon(self) : undefined
    const want = weapon?.assetId ?? ''
    if (this.viewGun && this.viewGun.userData.weaponAsset === want) {
      this.viewGun.visible = Boolean(weapon)
      return
    }
    if (this.viewGun) {
      this.viewGun.removeFromParent()
      this.viewGun = null
    }
    if (!weapon) return
    this.enqueueAsset(weapon.assetId)
    const raw = this.library.clone(weapon.assetId)
    if (!raw) return
    const gun = prepareHeldGun(raw)
    gun.name = 'view-gun'
    gun.userData.weaponAsset = weapon.assetId
    gun.scale.setScalar(weapon.class === 'pistol' || weapon.class === 'revolver' ? 0.34 : 0.7)
    gun.position.set(0.26, -0.2, -0.48)
    gun.rotation.set(0.08, Math.PI, 0)
    this.camera.add(gun)
    this.viewGun = gun
  }

  private syncProjectiles(world: WorldState): void {
    const seen = new Set<string>()
    const dir = new THREE.Vector3()
    for (const shot of world.projectiles) {
      seen.add(shot.id)
      let marker = this.projectiles.get(shot.id)
      if (!marker) {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.07, 0.07, 0.85),
          new THREE.MeshBasicMaterial({ color: tracerColor(shot.weaponId) }),
        )
        this.scene.add(mesh)
        marker = { id: shot.id, mesh }
        this.projectiles.set(shot.id, marker)
      }
      const gun = this.heldGunOf(shot.ownerId)
      const traveled = Math.max(0, shot.range - shot.remaining)
      const speed = Math.hypot(shot.velocity.x, shot.velocity.y, shot.velocity.z)
      if (gun) {
        const barrel = barrelTipWorld(gun)
        if (speed > 0.01) dir.set(shot.velocity.x / speed, shot.velocity.y / speed, shot.velocity.z / speed)
        else dir.copy(barrel.dir)
        marker.mesh.position.copy(barrel.tip).addScaledVector(dir, traveled)
        marker.mesh.lookAt(
          marker.mesh.position.x + dir.x,
          marker.mesh.position.y + dir.y,
          marker.mesh.position.z + dir.z,
        )
      } else {
        const y = shot.position.y || 2.06
        marker.mesh.position.set(shot.position.x, y, shot.position.z)
        marker.mesh.lookAt(
          shot.position.x + shot.velocity.x,
          y + shot.velocity.y,
          shot.position.z + shot.velocity.z,
        )
      }
    }
    for (const [id, marker] of this.projectiles) {
      if (seen.has(id)) continue
      this.disposeObject(marker.mesh)
      this.projectiles.delete(id)
    }
  }

  private heldGunOf(ownerId: string): THREE.Object3D | null {
    const marker = this.survivors.get(ownerId)
    if (marker && !marker.mesh.visible && this.viewGun) return this.viewGun
    return marker?.mesh.getObjectByName('held-gun') ?? null
  }

  private kitSurvivor(survivor: { id: string; professionId: string; position: { x: number; z: number } }): void {
    const marker = this.survivors.get(survivor.id)
    const assetId = SURVIVOR_ASSETS[survivor.professionId] ?? 'people/adventurer'
    this.enqueueAsset(assetId)
    if (!marker || marker.mesh.getObjectByName('kit')) return
    const kit = this.spawnKit(assetId, 1)
    if (!kit) return
    marker.mesh.add(kit)
    const mixer = new THREE.AnimationMixer(kit)
    const clips = this.library.clips(assetId)
    const poses: CharacterRig['poses'] = {}
    for (const kind of ['idle', 'walk', 'run', 'idleGun', 'aim', 'shoot', 'runShoot', 'sit', 'interact'] as const) {
      const clip = pickCharacterClip(clips, kind)
      if (clip) poses[kind] = mixer.clipAction(clip)
    }
    poses.idle?.play()
    this.rigs.set(survivor.id, {
      mixer,
      poses,
      current: 'idle',
      lastX: survivor.position.x,
      lastZ: survivor.position.z,
      displaySpeed: 0,
    })
  }

  private driveRig(world: WorldState, survivor: SurvivorState, dt: number): void {
    const rig = this.rigs.get(survivor.id)
    if (!rig) return
    if (isSleeping(world, survivor)) {
      const rest = rig.poses.sit ? 'sit' : 'idle'
      if (rig.current !== rest) {
        rig.poses[rig.current]?.fadeOut(0.1)
        rig.poses[rest]?.reset().fadeIn(0.12).play()
        rig.current = rest
      }
      rig.mixer.timeScale = 0.35
      rig.lastX = survivor.position.x
      rig.lastZ = survivor.position.z
      rig.mixer.update(dt)
      return
    }
    const speed = Math.hypot(survivor.position.x - rig.lastX, survivor.position.z - rig.lastZ) / Math.max(dt, 1 / 120)
    rig.lastX = survivor.position.x
    rig.lastZ = survivor.position.z
    rig.displaySpeed = speed > 0.2 ? speed : rig.displaySpeed * Math.exp(-dt * 12)
    const busy = isCooking(world, survivor) || isEating(survivor) || isWorkingInPlace(world, survivor) || isBuildingNow(world, survivor)
    const armed = Boolean(equippedWeapon(survivor)) && !busy
    const next = busy && rig.poses.interact
      ? 'interact'
      : armed
        ? pickArmedPose(rig.displaySpeed, survivor.fireCooldown > 0.05, rig.poses)
        : (rig.displaySpeed > 2.6 ? 'run' : rig.displaySpeed > 0.35 ? 'walk' : 'idle')
    rig.mixer.timeScale = busy ? 1.15 : 1
    if (next !== rig.current) {
      rig.poses[rig.current]?.fadeOut(0.12)
      rig.poses[next]?.reset().fadeIn(0.12).play()
      rig.current = next
    }
    rig.mixer.update(dt)
  }

  private kitStructure(world: WorldState, structure: StructureState, root: THREE.Object3D, cellSig: string): void {
    if (structure.stage !== 'complete') return
    const closedAsset =
      structure.visualAssetId ??
      STRUCTURE_ASSETS[structure.definitionId] ??
      (structure.kind === 'gate' ? STRUCTURE_ASSETS.gate : structure.kind === 'building' ? STRUCTURE_ASSETS.kitchen : STRUCTURE_ASSETS.wall) ??
      'fort/wooden-wall'
    const assetId = structure.kind === 'gate' && structure.open ? gateOpenAsset(closedAsset) : closedAsset
    const kitKey = `${cellSig}|${assetId}|${structure.yaw ?? 0}|${structure.open ? 'open' : 'shut'}`
    if (this.kitted.get(structure.id) === kitKey) return
    for (const child of [...root.children]) {
      if (child.name !== 'kit') continue
      root.remove(child)
    }
    this.enqueueAsset(assetId)
    if (structure.kind === 'wall') {
      const pieces: THREE.Object3D[] = []
      for (const cell of structure.cells) {
        const kit = this.spawnKit(assetId)
        if (!kit) return
        const center = cellCenter(world.nav, cell)
        kit.position.x += center.x
        kit.position.z += center.z
        kit.rotation.y = wallYaw(world, structure, cell) + (structure.yaw ?? 0)
        kit.scale.x *= 0.22
        kit.scale.z *= 1.8
        pieces.push(kit)
      }
      for (const piece of pieces) root.add(piece)
    } else {
      const kit = this.spawnKit(assetId, structure.kind === 'gate' ? 4 : undefined)
      if (!kit) return
      const xs = structure.cells.map((cell) => cell.x)
      const zs = structure.cells.map((cell) => cell.z)
      const mid = cellCenter(world.nav, {
        x: (Math.min(...xs) + Math.max(...xs)) / 2,
        z: (Math.min(...zs) + Math.max(...zs)) / 2,
      })
      kit.position.x += mid.x
      kit.position.z += mid.z
      if (structure.kind === 'gate') kit.rotation.y = (structure.yaw ?? 0) + gateYaw(structure)
      else if (structure.yaw) kit.rotation.y = structure.yaw
      if (structure.definitionId === 'brazier') kit.scale.multiplyScalar(2.6)
      if (structure.definitionId === 'bonfire') kit.scale.multiplyScalar(1.8)
      root.add(kit)
    }
    this.kitted.set(structure.id, kitKey)
    for (const child of root.children) {
      if (child.name === 'kit' || child.name === 'interior' || child.name === 'open-shell' || child.name === 'steam') continue
      child.visible = false
    }
  }

  private markEnemy(root: THREE.Object3D, hitFlash: number): void {
    const leftover = root.getObjectByName('threat-box')
    if (leftover) leftover.removeFromParent()
    let ring = root.getObjectByName('threat')
    if (!ring) {
      ring = new THREE.Mesh(
        new THREE.RingGeometry(0.34, 0.46, 28),
        new THREE.MeshBasicMaterial({
          color: 0xff2a18,
          side: THREE.DoubleSide,
          depthWrite: false,
          transparent: true,
          opacity: 0.8,
        }),
      )
      ring.rotation.x = -Math.PI / 2
      ring.position.y = 0.04
      ring.name = 'threat'
      ring.renderOrder = 28
      root.add(ring)
    }
    const pulse = hitFlash > 0 ? 1.18 : 1
    ring.scale.set(pulse, pulse, 1)
    const material = ring instanceof THREE.Mesh ? ring.material : null
    if (material instanceof THREE.MeshBasicMaterial) {
      material.color.set(hitFlash > 0 ? 0xfff1c8 : 0xff2a18)
      material.opacity = hitFlash > 0 ? 0.95 : 0.8
    }
  }

  private syncFireLights(world: WorldState): void {
    const seen = new Set<string>()
    const flicker = 0.82 + Math.sin(world.time.daySeconds * 11) * 0.12 + Math.sin(world.time.daySeconds * 19) * 0.06
    const night = world.time.phase === 'night' || world.time.phase === 'dusk'
    for (const structure of world.structures) {
      const lamp = fireLamp(structure.definitionId)
      if (!lamp || structure.stage !== 'complete' || !structure.cells[0]) continue
      seen.add(structure.id)
      const xs = structure.cells.map((cell) => cell.x)
      const zs = structure.cells.map((cell) => cell.z)
      const mid = cellCenter(world.nav, {
        x: (Math.min(...xs) + Math.max(...xs)) / 2,
        z: (Math.min(...zs) + Math.max(...zs)) / 2,
      })
      let light = this.fireLights.get(structure.id)
      if (!light) {
        light = new THREE.PointLight(0xff9a48, lamp.night, lamp.distance, 2)
        light.castShadow = false
        this.scene.add(light)
        const core = new THREE.Mesh(
          new THREE.SphereGeometry(0.28, 12, 12),
          new THREE.MeshBasicMaterial({
            color: 0xffe08a,
            transparent: true,
            opacity: 0.95,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        )
        core.name = 'flame'
        const halo = new THREE.Mesh(
          new THREE.SphereGeometry(0.72, 12, 12),
          new THREE.MeshBasicMaterial({
            color: 0xff6a28,
            transparent: true,
            opacity: 0.45,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        )
        halo.name = 'halo'
        light.add(core, halo)
        this.fireLights.set(structure.id, light)
      }
      const height = structure.definitionId === 'watchtower' ? this.towerDeckY(structure.id) + 0.32 : lamp.height
      light.position.set(mid.x, height, mid.z)
      light.intensity = (night ? lamp.night : lamp.day) * flicker
      light.distance = lamp.distance
      const glow = light.getObjectByName('flame')
      const halo = light.getObjectByName('halo')
      if (glow) glow.scale.setScalar(0.9 + flicker * 0.55)
      if (halo) halo.scale.setScalar(0.95 + flicker * 0.35)
    }
    for (const [id, light] of this.fireLights) {
      if (seen.has(id)) continue
      this.scene.remove(light)
      this.fireLights.delete(id)
    }
  }

  private syncImpacts(world: WorldState): void {
    const seen = new Set<string>()
    for (const impact of world.impacts) {
      seen.add(impact.id)
      let marker = this.impacts.get(impact.id)
      if (!marker) {
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(impact.kind === 'muzzle' ? 0.12 : 0.28, 8, 8),
          new THREE.MeshBasicMaterial({
            color: impact.kind === 'kill' ? 0xffe7a0 : impact.kind === 'muzzle' ? 0xffd080 : 0xff6a3a,
            transparent: true,
            opacity: 0.95,
            depthWrite: false,
          }),
        )
        this.scene.add(mesh)
        marker = { id: impact.id, mesh }
        this.impacts.set(impact.id, marker)
      }
      const t = Math.max(0, impact.life / impact.maxLife)
      marker.mesh.position.set(impact.position.x, impact.position.y || 1.3, impact.position.z)
      marker.mesh.scale.setScalar(impact.kind === 'muzzle' ? 1.2 + (1 - t) * 1.6 : 0.7 + (1 - t) * 2.4)
      const material = marker.mesh instanceof THREE.Mesh ? marker.mesh.material : null
      if (material instanceof THREE.MeshBasicMaterial) material.opacity = t
    }
    for (const [id, marker] of this.impacts) {
      if (seen.has(id)) continue
      this.disposeObject(marker.mesh)
      this.impacts.delete(id)
    }
  }

  private watchDeck(world: WorldState, survivor: SurvivorState): { x: number; y: number; z: number } {
    const post = world.nightPosts.find((entry) => entry.id === survivor.nightPostId || entry.id === survivor.watchPostId)
    if (!post || Math.hypot(survivor.position.x - post.position.x, survivor.position.z - post.position.z) > 1.6) {
      return { x: survivor.position.x, y: Math.max(0, survivor.position.y), z: survivor.position.z }
    }
    const tower = world.structures.find(
      (structure) =>
        structure.definitionId === 'watchtower' &&
        structure.stage === 'complete' &&
        Math.hypot(structureMidXz(world, structure).x - post.position.x, structureMidXz(world, structure).z - post.position.z) < 3,
    )
    const deckY = tower ? this.towerDeckY(tower.id) : TOWER_STAND_HEIGHT
    return { x: post.position.x, y: deckY, z: post.position.z }
  }

  private towerDeckY(structureId: string): number {
    const marker = this.structures.get(structureId)
    const kit = marker?.mesh.getObjectByName('kit')
    if (!kit) return TOWER_STAND_HEIGHT
    kit.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(kit)
    if (!Number.isFinite(box.max.y) || box.max.y < 0.6) return TOWER_STAND_HEIGHT
    return box.max.y
  }

  private kitExtras(): void {
    for (const extra of this.extras) {
      if (extra.getObjectByName('kit')) continue
      const assetId = extra.userData.assetId
      if (typeof assetId !== 'string') continue
      const kit = this.spawnKit(assetId)
      if (!kit) continue
      extra.add(kit)
      const fallback = extra.getObjectByName('fallback')
      if (fallback) fallback.visible = false
    }
  }

  private spawnKit(assetId: string, scaleOverride?: number): THREE.Object3D | null {
    const entry = assetById(assetId)
    const kit = this.library.clone(assetId)
    if (!entry || !kit) return null
    if (entry.category === 'people') {
      fitToHeight(kit, SURVIVOR_HEIGHT)
      kit.name = 'kit'
      return kit
    }
    return prepareKit(kit, scaleOverride ?? suggestedScale(entry))
  }

  private readonly resize = (): void => {
    const width = window.innerWidth
    const height = window.innerHeight
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
  }
}

function setCutaway(root: THREE.Object3D, on: boolean): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    const next = materials.map((material) => {
      if (!(material instanceof THREE.Material)) return material
      if (!material.userData.cutawayReady) {
        const cloned = material.clone()
        cloned.userData.cutawayReady = true
        cloned.userData.cutawayOpaque = cloned.transparent
        cloned.userData.cutawayOpacity = 'opacity' in cloned ? cloned.opacity : 1
        cloned.userData.cutawayDepth = cloned.depthWrite
        return cloned
      }
      return material
    })
    object.material = Array.isArray(object.material) ? next : next[0]!
    for (const material of next) {
      if (!(material instanceof THREE.Material)) continue
      material.transparent = on || Boolean(material.userData.cutawayOpaque)
      if ('opacity' in material) material.opacity = on ? 0.22 : Number(material.userData.cutawayOpacity ?? 1)
      material.depthWrite = on ? false : material.userData.cutawayDepth !== false
    }
  })
}

function ghostMaterial(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    for (const material of materials) {
      if (!(material instanceof THREE.Material)) continue
      material.transparent = true
      material.opacity = 0.4
      material.depthWrite = false
    }
  })
}

function structureMidXz(world: WorldState, structure: StructureState): { x: number; z: number } {
  const xs = structure.cells.map((cell) => cell.x)
  const zs = structure.cells.map((cell) => cell.z)
  const mid = cellCenter(world.nav, {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    z: (Math.min(...zs) + Math.max(...zs)) / 2,
  })
  return { x: mid.x, z: mid.z }
}

function isBuildingNow(world: WorldState, survivor: SurvivorState): boolean {
  if (survivor.workerState !== 'Work' || !survivor.currentJobId) return false
  const job = world.jobs.find((entry) => entry.id === survivor.currentJobId)
  return job?.definitionId === 'build'
}

function fireLamp(definitionId: string): { height: number; distance: number; day: number; night: number } | null {
  if (definitionId === 'bonfire') return { height: 1.4, distance: 34, day: 18, night: 90 }
  if (definitionId === 'brazier') return { height: 2.9, distance: 26, day: 12, night: 58 }
  if (definitionId === 'watchtower') return { height: 2.4, distance: 22, day: 10, night: 48 }
  return null
}

function tracerColor(weaponId: string): number {
  if (weaponId === 'shotgun') return 0xe07a4a
  if (weaponId === 'smg') return 0x8ec8e8
  if (weaponId === 'sniper') return 0xf4f0c8
  if (weaponId === 'revolver') return 0xe8b86d
  if (weaponId === 'pistol') return 0xf0d27a
  return 0xd8e07a
}

function wallYaw(world: WorldState, _structure: StructureState, cell: GridCell): number {
  const alongX = hasWallNeighbor(world, cell, -1, 0) || hasWallNeighbor(world, cell, 1, 0)
  const alongZ = hasWallNeighbor(world, cell, 0, -1) || hasWallNeighbor(world, cell, 0, 1)
  if (alongX && !alongZ) return Math.PI / 2
  if (alongZ && !alongX) return 0
  const north = worldToCell(world.nav, { x: 0, y: 0, z: BASE.north }).z
  const south = worldToCell(world.nav, { x: 0, y: 0, z: BASE.south }).z
  if (cell.z === north || cell.z === south) return Math.PI / 2
  return 0
}

function hasWallNeighbor(world: WorldState, cell: GridCell, dx: number, dz: number): boolean {
  return world.structures.some((structure) =>
    (structure.kind === 'wall' || structure.kind === 'gate') &&
    structure.stage === 'complete' &&
    structure.cells.some((entry) => entry.x === cell.x + dx && entry.z === cell.z + dz),
  )
}

function gateYaw(structure: StructureState): number {
  const xs = structure.cells.map((cell) => cell.x)
  const zs = structure.cells.map((cell) => cell.z)
  return Math.max(...xs) - Math.min(...xs) >= Math.max(...zs) - Math.min(...zs) ? 0 : Math.PI / 2
}
