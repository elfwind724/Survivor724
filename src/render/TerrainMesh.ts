import * as THREE from 'three'
import { terrainHeight, terrainTint } from '@/data/landscape'

const TERRAIN_SIZE = 360
const TERRAIN_SEGMENTS = 96

export function createTerrainMesh(): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS)
  geometry.rotateX(-Math.PI / 2)
  const pos = geometry.getAttribute('position')
  const colors = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    pos.setY(i, terrainHeight(x, z))
    const tint = terrainTint(x, z)
    colors[i * 3] = tint[0]
    colors[i * 3 + 1] = tint[1]
    colors[i * 3 + 2] = tint[2]
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
  const material = new THREE.MeshLambertMaterial({ vertexColors: true })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'ground'
  mesh.receiveShadow = true
  return mesh
}
