import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { assetById, assetUrl, type AssetEntry } from '@/data/assetIndex'

export class AssetLibrary {
  private readonly loader = new GLTFLoader()
  private readonly templates = new Map<string, THREE.Object3D>()
  private readonly failed = new Set<string>()
  private readonly loading = new Map<string, Promise<THREE.Object3D | null>>()
  private readonly queue: string[] = []
  private inflight = 0
  private readonly maxInflight = 4

  has(id: string): boolean {
    return this.templates.has(id)
  }

  enqueue(ids: Iterable<string>): void {
    for (const id of ids) {
      if (this.templates.has(id) || this.failed.has(id) || this.loading.has(id) || this.queue.includes(id)) continue
      this.queue.push(id)
    }
  }

  tick(): void {
    while (this.inflight < this.maxInflight && this.queue.length > 0) {
      const id = this.queue.shift()
      if (id) void this.load(id)
    }
  }

  clone(id: string): THREE.Object3D | null {
    const template = this.templates.get(id)
    return template ? template.clone(true) : null
  }

  async load(id: string): Promise<THREE.Object3D | null> {
    if (this.failed.has(id)) return null
    const ready = this.templates.get(id)
    if (ready) return ready
    const pending = this.loading.get(id)
    if (pending) return pending
    const entry = assetById(id)
    if (!entry) {
      this.failed.add(id)
      return null
    }
    const job = this.fetch(entry)
    this.loading.set(id, job)
    this.inflight += 1
    try {
      const scene = await job
      if (scene) this.templates.set(id, scene)
      else this.failed.add(id)
      return scene
    } finally {
      this.inflight -= 1
      this.loading.delete(id)
    }
  }

  private async fetch(entry: AssetEntry): Promise<THREE.Object3D | null> {
    try {
      const gltf = await this.loader.loadAsync(assetUrl(entry.file))
      const root = gltf.scene
      root.traverse((object) => {
        object.userData.assetId = entry.id
        if (object instanceof THREE.Mesh) {
          object.castShadow = entry.category !== 'food' && entry.category !== 'nature'
          object.receiveShadow = true
        }
      })
      return root
    } catch {
      return null
    }
  }
}
