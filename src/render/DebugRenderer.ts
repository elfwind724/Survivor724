import * as THREE from 'three'
import { assetById } from '@/data/assetIndex'
import { STRUCTURE_ASSETS, SURVIVOR_ASSETS } from '@/data/worldDressing'
import { cellCenter } from '@/navigation/NavGrid'
import { BASE } from '@/simulation/baseLayout'
import type { GridCell, StructureState, WorldState } from '@/simulation/types'
import { AssetLibrary } from './AssetLibrary'
import { locomotionFromSpeed, pickCharacterClip, type Locomotion } from './CharacterClips'
import { fitToHeight, prepareKit, suggestedScale, SURVIVOR_HEIGHT } from './ModelFit'

interface Marker {
  id: string
  mesh: THREE.Object3D
}

interface CharacterRig {
  mixer: THREE.AnimationMixer
  idle: THREE.AnimationAction | null
  walk: THREE.AnimationAction | null
  run: THREE.AnimationAction | null
  current: Locomotion
  lastX: number
  lastZ: number
  displaySpeed: number
}

export class DebugRenderer {
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  readonly renderer: THREE.WebGLRenderer
  orbitYaw = 0
  distance = 42
  lookAtX = 0
  lookAtZ = 0
  followEnabled = true
  private readonly survivors = new Map<string, Marker>()
  private readonly structures = new Map<string, Marker>()
  private readonly extras: THREE.Object3D[] = []
  private readonly enemies = new Map<string, Marker>()
  private readonly wildlife = new Map<string, Marker>()
  private zones: THREE.Object3D[] = []
  private readonly hemi: THREE.HemisphereLight
  private readonly sun: THREE.DirectionalLight
  private preview: THREE.Group | null = null
  private previewKey = ''
  private readonly library = new AssetLibrary()
  private readonly dressingRoot = new THREE.Group()
  private readonly dressingMeshes = new Map<string, THREE.Object3D>()
  private readonly kitted = new Map<string, string>()
  private decorPreview: THREE.Group | null = null
  private readonly rigs = new Map<string, CharacterRig>()
  private readonly clock = new THREE.Clock()

  constructor(canvas: HTMLCanvasElement) {
    this.scene.background = new THREE.Color(0x1b2124)
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500)
    this.camera.position.set(0, 48, 36)
    this.camera.lookAt(0, 0, 0)

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    this.hemi = new THREE.HemisphereLight(0xdde6d8, 0x2a2f28, 1.1)
    this.sun = new THREE.DirectionalLight(0xfff1d0, 0.85)
    this.sun.position.set(28, 48, 16)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    this.sun.shadow.camera.left = -90
    this.sun.shadow.camera.right = 90
    this.sun.shadow.camera.top = 90
    this.sun.shadow.camera.bottom = -90
    this.scene.add(this.hemi, this.sun)
    this.scene.fog = new THREE.Fog(0x1b2124, 70, 210)

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

  panBy(screenDx: number, screenDy: number): void {
    this.followEnabled = false
    const scale = this.distance * 0.0024
    const forwardX = -Math.sin(this.orbitYaw)
    const forwardZ = -Math.cos(this.orbitYaw)
    const rightX = -forwardZ
    const rightZ = forwardX
    this.lookAtX += rightX * screenDx * scale - forwardX * screenDy * scale
    this.lookAtZ += rightZ * screenDx * scale - forwardZ * screenDy * scale
  }

  recenter(): void {
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
    this.syncLighting(world)
    this.syncZones(world)
    this.syncStructures(world)
    this.syncActors(world.enemies, this.enemies, 1.2, 1.6, 0x4a5a32)
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
      marker.mesh.position.set(survivor.position.x, 0, survivor.position.z)
      marker.mesh.rotation.y = survivor.facingYaw
      this.driveRig(survivor, dt)
      const fallback = marker.mesh.getObjectByName('fallback')
      if (fallback instanceof THREE.Mesh && fallback.material instanceof THREE.MeshLambertMaterial) {
        const controlled = world.player.controlledId === survivor.id
        const selected = world.player.selectedId === survivor.id
        fallback.material.color.set(controlled ? 0xf0d27a : selected ? 0xd8c4a0 : 0xc4b39a)
        fallback.visible = !kit
        fallback.position.y = 0.9
      }
    }
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
    if (this.followEnabled) {
      this.lookAtX = focus.position.x
      this.lookAtZ = focus.position.z
    }
    const target = new THREE.Vector3(this.lookAtX, 0, this.lookAtZ)
    const horiz = this.distance * 0.62
    const height = this.distance * 0.78
    const desired = new THREE.Vector3(
      this.lookAtX + Math.sin(this.orbitYaw) * horiz,
      height,
      this.lookAtZ + Math.cos(this.orbitYaw) * horiz,
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
    if (structure.kind === 'gate') this.styleGateKit(root, structure)
    const meshes = root instanceof THREE.Mesh ? [root] : root.children
    for (const mesh of meshes) {
      if (mesh.name === 'kit' || mesh.parent?.name === 'kit') continue
      if (!(mesh instanceof THREE.Mesh) || !(mesh.material instanceof THREE.MeshLambertMaterial)) continue
      const material = mesh.material
      const baseHeight = typeof mesh.userData.baseHeight === 'number' ? mesh.userData.baseHeight : 2.6
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

  private styleGateKit(root: THREE.Object3D, structure: StructureState): void {
    for (const child of root.children) {
      if (child.name !== 'kit') continue
      if (child.userData.closedX === undefined) {
        child.userData.closedX = child.position.x
        child.userData.closedZ = child.position.z
        child.userData.closedYaw = child.rotation.y
      }
      const closedX = Number(child.userData.closedX)
      const closedZ = Number(child.userData.closedZ)
      const closedYaw = Number(child.userData.closedYaw)
      if (structure.open) {
        child.rotation.y = closedYaw + Math.PI / 2
        child.position.x = closedX + Math.cos(closedYaw) * 2.8
        child.position.z = closedZ + Math.sin(closedYaw) * 2.8
      } else {
        child.rotation.y = closedYaw
        child.position.x = closedX
        child.position.z = closedZ
      }
    }
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

    for (const container of world.containers) {
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
  }

  private syncLighting(world: WorldState): void {
    if (world.time.phase === 'night') {
      this.scene.background = new THREE.Color(0x0c1014)
      if (this.scene.fog instanceof THREE.Fog) this.scene.fog.color.set(0x0c1014)
      this.hemi.intensity = 0.28
      this.sun.intensity = 0.08
      return
    }
    if (world.time.phase === 'dusk') {
      this.scene.background = new THREE.Color(0x2a1c16)
      if (this.scene.fog instanceof THREE.Fog) this.scene.fog.color.set(0x2a1c16)
      this.hemi.intensity = 0.7
      this.sun.intensity = 0.35
      return
    }
    this.scene.background = new THREE.Color(0x8fa4c4)
    if (this.scene.fog instanceof THREE.Fog) this.scene.fog.color.set(0x8fa4c4)
    this.hemi.intensity = 1.05
    this.sun.intensity = 0.9
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

  private bootIds(): string[] {
    const ids = [
      ...Object.values(SURVIVOR_ASSETS),
      STRUCTURE_ASSETS.wall,
      STRUCTURE_ASSETS.gate,
      STRUCTURE_ASSETS.kitchen,
      STRUCTURE_ASSETS.warehouse,
      STRUCTURE_ASSETS.locker,
      'survival/bonfire',
      'survival/tent',
      'nature/pine',
      'nature/tree',
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
    const idleClip = pickCharacterClip(clips, 'idle')
    const walkClip = pickCharacterClip(clips, 'walk')
    const runClip = pickCharacterClip(clips, 'run')
    const idle = idleClip ? mixer.clipAction(idleClip) : null
    idle?.play()
    this.rigs.set(survivor.id, {
      mixer,
      idle,
      walk: walkClip ? mixer.clipAction(walkClip) : null,
      run: runClip ? mixer.clipAction(runClip) : null,
      current: 'idle',
      lastX: survivor.position.x,
      lastZ: survivor.position.z,
      displaySpeed: 0,
    })
  }

  private driveRig(survivor: { id: string; position: { x: number; z: number } }, dt: number): void {
    const rig = this.rigs.get(survivor.id)
    if (!rig) return
    const speed = Math.hypot(survivor.position.x - rig.lastX, survivor.position.z - rig.lastZ) / Math.max(dt, 1 / 120)
    rig.lastX = survivor.position.x
    rig.lastZ = survivor.position.z
    rig.displaySpeed = speed > 0.2 ? speed : rig.displaySpeed * Math.exp(-dt * 12)
    const next = locomotionFromSpeed(rig.displaySpeed)
    if (next !== rig.current) {
      const previous = rig[rig.current]
      const incoming = rig[next]
      previous?.fadeOut(0.12)
      incoming?.reset().fadeIn(0.12).play()
      rig.current = next
    }
    rig.mixer.update(dt)
  }

  private kitStructure(world: WorldState, structure: StructureState, root: THREE.Object3D, cellSig: string): void {
    if (structure.stage !== 'complete') return
    if (this.kitted.get(structure.id) === cellSig) return
    for (const child of [...root.children]) {
      if (child.name !== 'kit') continue
      root.remove(child)
    }
    const assetId = structure.kind === 'gate' ? STRUCTURE_ASSETS.gate : structure.kind === 'building' ? STRUCTURE_ASSETS.kitchen : STRUCTURE_ASSETS.wall
    if (structure.kind === 'wall') {
      const pieces: THREE.Object3D[] = []
      for (const cell of structure.cells) {
        const kit = this.spawnKit(assetId)
        if (!kit) return
        const center = cellCenter(world.nav, cell)
        kit.position.x += center.x
        kit.position.z += center.z
        kit.rotation.y = wallYaw(structure, cell)
        kit.scale.x *= 0.22
        kit.scale.z *= 1.8
        pieces.push(kit)
      }
      for (const piece of pieces) root.add(piece)
    } else {
      const kit = this.spawnKit(assetId)
      if (!kit) return
      const xs = structure.cells.map((cell) => cell.x)
      const zs = structure.cells.map((cell) => cell.z)
      const mid = cellCenter(world.nav, {
        x: (Math.min(...xs) + Math.max(...xs)) / 2,
        z: (Math.min(...zs) + Math.max(...zs)) / 2,
      })
      kit.position.x += mid.x
      kit.position.z += mid.z
      root.add(kit)
    }
    this.kitted.set(structure.id, cellSig)
    for (const child of root.children) {
      if (child.name !== 'kit') child.visible = false
    }
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

function wallYaw(structure: StructureState, cell: GridCell): number {
  const alongZ = structure.cells.some((entry) => entry.x === cell.x && Math.abs(entry.z - cell.z) === 1)
  const alongX = structure.cells.some((entry) => entry.z === cell.z && Math.abs(entry.x - cell.x) === 1)
  if (alongZ && !alongX) return Math.PI / 2
  return 0
}
