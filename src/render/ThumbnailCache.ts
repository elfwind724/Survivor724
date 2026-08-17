import * as THREE from 'three'
import { assetById } from '@/data/assetIndex'
import { AssetLibrary } from './AssetLibrary'
import { fitToHeight, prepareKit, suggestedScale } from './ModelFit'

const SIZE = 96

export class ThumbnailCache {
  private readonly library = new AssetLibrary()
  private readonly urls = new Map<string, string>()
  private readonly failed = new Set<string>()
  private readonly wanted = new Set<string>()
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(28, 1, 0.1, 40)

  constructor() {
    const canvas = document.createElement('canvas')
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setSize(SIZE, SIZE, false)
    this.renderer.setClearColor(0x000000, 0)
    const hemi = new THREE.HemisphereLight(0xfff4e0, 0x2a2a28, 1.4)
    const sun = new THREE.DirectionalLight(0xffffff, 1.2)
    sun.position.set(4, 8, 6)
    this.scene.add(hemi, sun)
    this.camera.position.set(2.4, 2.1, 2.8)
    this.camera.lookAt(0, 0.6, 0)
  }

  ask(id: string): string | null {
    this.wanted.add(id)
    if (this.urls.has(id)) return this.urls.get(id) ?? null
    if (this.failed.has(id)) return null
    this.library.enqueue([id])
    return null
  }

  tick(): void {
    this.library.tick()
    for (const id of this.wanted) {
      if (this.urls.has(id) || this.failed.has(id) || !this.library.has(id)) continue
      this.capture(id)
    }
  }

  private capture(id: string): void {
    const entry = assetById(id)
    const raw = this.library.clone(id)
    if (!entry || !raw) {
      this.failed.add(id)
      return
    }
    const kit = entry.category === 'people' ? raw : prepareKit(raw, suggestedScale(entry) || 1)
    if (entry.category === 'people') fitToHeight(kit, 1.8)
    kit.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(kit)
    const size = box.getSize(new THREE.Vector3())
    const longest = Math.max(size.x, size.y, size.z, 0.2)
    kit.scale.multiplyScalar(1.8 / longest)
    kit.updateMatrixWorld(true)
    const fitted = new THREE.Box3().setFromObject(kit)
    const center = fitted.getCenter(new THREE.Vector3())
    kit.position.sub(center)
    kit.position.y -= fitted.min.y - center.y
    this.scene.add(kit)
    this.renderer.render(this.scene, this.camera)
    this.urls.set(id, this.renderer.domElement.toDataURL('image/png'))
    this.scene.remove(kit)
  }
}
