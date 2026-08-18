import * as THREE from 'three'
import type { AssetEntry } from '@/data/assetIndex'

export const SURVIVOR_HEIGHT = 2.8
export const HELD_GUN_LENGTH = 0.82

export function sitOnGround(object: THREE.Object3D): void {
  object.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(object)
  if (!Number.isFinite(box.min.y)) return
  object.position.y -= box.min.y
}

export function fitToHeight(object: THREE.Object3D, height: number): void {
  object.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(object)
  const sizeY = box.max.y - box.min.y
  if (!Number.isFinite(sizeY) || sizeY < 0.05) return
  object.scale.multiplyScalar(height / sizeY)
  sitOnGround(object)
}

export function suggestedScale(entry: AssetEntry): number {
  const name = entry.name.toLowerCase()
  if (entry.category === 'people') return 1
  if (name.includes('mountain')) return 46
  if (name.includes('shipping') || name.includes('dock') || name === 'port' || name === 'docks') return 11
  if (name === 'tent') return 0.16
  if (name.includes('backpack')) return 0.26
  if (name.includes('wood log')) return 0.3
  if (name.includes('bonfire') || name.includes('torch')) return 0.55
  if (
    name.includes('rifle') ||
    name.includes('pistol') ||
    name.includes('shotgun') ||
    name.includes('revolver') ||
    name.includes('submachine') ||
    name.includes('ammo')
  ) {
    return 0.2
  }
  if (entry.category === 'food') return 0.24
  if (entry.category === 'interior') {
    if (name.includes('light') || name.includes('cube')) return 1.4
    return 0.75
  }
  if (entry.category === 'survival') return 0.4
  if (entry.category === 'animals') return 1
  if (entry.category === 'nature') return 1
  if (entry.category === 'natureKit') {
    if (name.includes('pine') || name.includes('tree')) return 3.6
    if (name.includes('rock')) return 0.9
    if (name.includes('grass') || name.includes('flower') || name.includes('clover') || name.includes('fern')) return 0.7
    return 1
  }
  if (entry.category === 'natureClump') return name.includes('tree') ? 1.12 : 1.35
  if (entry.category === 'fort') {
    if (name.includes('wall') && !name.includes('tower')) return 4.4
    if (name.includes('gate')) return 4
    if (name.includes('watch') || name.includes('tower')) return 5
    if (name.includes('storage')) return 6.2
    if (name.includes('crop') || name.includes('farm dirt')) return 7
    if (name.includes('pine') || name.includes('tree')) return 7.5
    return 5.6
  }
  return 1
}

export function fitHeldGun(object: THREE.Object3D): void {
  object.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(object)
  const size = box.getSize(new THREE.Vector3())
  const longest = Math.max(size.x, size.y, size.z)
  if (!Number.isFinite(longest) || longest < 0.01) return
  object.scale.multiplyScalar(HELD_GUN_LENGTH / longest)
}

export function prepareKit(object: THREE.Object3D, scale: number): THREE.Object3D {
  object.scale.multiplyScalar(scale)
  sitOnGround(object)
  object.name = 'kit'
  return object
}
