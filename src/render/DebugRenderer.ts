import * as THREE from 'three'
import type { WorldState } from '@/simulation/types'

interface Marker {
  id: string
  mesh: THREE.Mesh
}

export class DebugRenderer {
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  readonly renderer: THREE.WebGLRenderer
  private readonly survivors = new Map<string, Marker>()
  private readonly extras: THREE.Object3D[] = []

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
    this.scene.add(ground)

    window.addEventListener('resize', this.resize)
    this.resize()
  }

  sync(world: WorldState): void {
    this.ensureStatic(world)
    for (const survivor of world.survivors) {
      let marker = this.survivors.get(survivor.id)
      if (!marker) {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(1.2, 1.8, 1.2),
          new THREE.MeshLambertMaterial({ color: 0xc4b39a }),
        )
        mesh.userData.survivorId = survivor.id
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
