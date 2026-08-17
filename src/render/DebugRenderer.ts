import * as THREE from 'three'
import type { StructureState, WorldState } from '@/simulation/types'
import { cellCenter } from '@/navigation/NavGrid'

interface Marker {
  id: string
  mesh: THREE.Object3D
}

export class DebugRenderer {
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  readonly renderer: THREE.WebGLRenderer
  private readonly survivors = new Map<string, Marker>()
  private readonly structures = new Map<string, Marker>()
  private readonly extras: THREE.Object3D[] = []
  private zones: THREE.Object3D[] = []

  constructor(canvas: HTMLCanvasElement) {
    this.scene.background = new THREE.Color(0x1b2124)
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400)
    this.camera.position.set(0, 72, 48)
    this.camera.lookAt(0, 0, 8)

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    const hemi = new THREE.HemisphereLight(0xdde6d8, 0x2a2f28, 1.1)
    const sun = new THREE.DirectionalLight(0xfff1d0, 0.7)
    sun.position.set(20, 40, 10)
    this.scene.add(hemi, sun)

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 120),
      new THREE.MeshLambertMaterial({ color: 0x3d4a3a }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.name = 'ground'
    this.scene.add(ground)

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

  sync(world: WorldState): void {
    this.ensureStatic(world)
    this.syncZones(world)
    this.syncStructures(world)
    for (const survivor of world.survivors) {
      let marker = this.survivors.get(survivor.id)
      if (!marker) {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(1.2, 1.8, 1.2),
          new THREE.MeshLambertMaterial({ color: 0xc4b39a }),
        )
        this.scene.add(mesh)
        marker = { id: survivor.id, mesh }
        this.survivors.set(survivor.id, marker)
      }
      marker.mesh.position.set(survivor.position.x, 0.9, survivor.position.z)
    }
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
      let marker = this.structures.get(structure.id)
      if (!marker) {
        const mesh = this.createStructureMesh(world, structure)
        this.scene.add(mesh)
        marker = { id: structure.id, mesh }
        this.structures.set(structure.id, marker)
      }
      this.styleStructure(marker.mesh, structure)
    }
    for (const [id, marker] of this.structures) {
      if (seen.has(id)) continue
      this.scene.remove(marker.mesh)
      this.structures.delete(id)
    }
  }

  private createStructureMesh(world: WorldState, structure: StructureState): THREE.Mesh {
    const width = Math.max(1, structure.cells.length)
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(width, 2.4, 1),
      new THREE.MeshLambertMaterial({ color: 0x6b6254, transparent: true, opacity: 1 }),
    )
    const first = structure.cells[0]
    const last = structure.cells[structure.cells.length - 1]
    if (first && last) {
      const a = cellCenter(world.nav, first)
      const b = cellCenter(world.nav, last)
      mesh.position.set((a.x + b.x) / 2, 1.2, (a.z + b.z) / 2)
    }
    return mesh
  }

  private styleStructure(mesh: THREE.Object3D, structure: StructureState): void {
    if (!(mesh instanceof THREE.Mesh) || !Array.isArray(mesh.material) && !(mesh.material instanceof THREE.MeshLambertMaterial)) return
    const material = mesh.material as THREE.MeshLambertMaterial
    if (structure.stage !== 'complete') {
      material.color.set(0x3d7ea6)
      material.opacity = 0.45
      material.transparent = true
      mesh.scale.y = 0.25
      mesh.position.y = 0.3
      return
    }
    material.transparent = false
    material.opacity = 1
    mesh.scale.y = structure.kind === 'gate' && structure.open ? 0.45 : 1
    mesh.position.y = structure.kind === 'gate' && structure.open ? 0.55 : 1.2
    material.color.set(structure.kind === 'gate' ? 0x8a6a3a : 0x6b6254)
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
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(isLocker ? 3 : 6, isLocker ? 2 : 3, isLocker ? 2 : 4),
        new THREE.MeshLambertMaterial({ color: isLocker ? 0x8a6a3a : 0x6b6254 }),
      )
      mesh.position.set(container.position.x, isLocker ? 1 : 1.5, container.position.z)
      this.scene.add(mesh)
      this.extras.push(mesh)
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

  private readonly resize = (): void => {
    const width = window.innerWidth
    const height = window.innerHeight
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
  }
}
