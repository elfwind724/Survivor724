/**
 * READ ONLY excerpt from survival-highway WorldManager.ts.
 *
 * Grade: useful capacity-recycling pattern.
 * Do not copy WorldManager, rolling-road generation, or harvest slots.
 * Dawn Bastion must keep instance transforms in the simulation layer
 * and treat InstancedMesh as a view.
 */
import * as THREE from 'three'

const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0)

export class InstancedPool {
  readonly mesh: THREE.InstancedMesh
  private readonly freeSlots: number[] = []

  constructor(geometry: THREE.BufferGeometry, material: THREE.Material, capacity: number) {
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity)
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    for (let i = capacity - 1; i >= 0; i -= 1) {
      this.mesh.setMatrixAt(i, HIDDEN)
      this.freeSlots.push(i)
    }
    this.mesh.instanceMatrix.needsUpdate = true
  }

  acquire(): number {
    return this.freeSlots.pop() ?? -1
  }

  release(index: number): void {
    this.mesh.setMatrixAt(index, HIDDEN)
    this.freeSlots.push(index)
    this.mesh.instanceMatrix.needsUpdate = true
  }
}
