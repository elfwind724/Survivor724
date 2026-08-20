import * as THREE from 'three'
import { terrainHeight, terrainTint } from '@/data/landscape'

const TERRAIN_SIZE = 360
const TERRAIN_SEGMENTS = 120

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
  const material = new THREE.MeshStandardMaterial({
    map: grassAlbedo(),
    vertexColors: true,
    roughness: 0.94,
    metalness: 0,
  })
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
#if defined( USE_MAP )
    vec2 macroUv = vMapUv * 0.16 + vec2(0.27, 0.09);
    vec3 macroSample = texture2D( map, macroUv ).rgb;
    diffuseColor.rgb *= mix( vec3(1.0), macroSample, 0.34 );
#endif
`,
    )
  }
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'ground'
  mesh.receiveShadow = true
  return mesh
}

export function createSkyDome(): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(240, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2)
  const pos = geometry.getAttribute('position')
  const colors = new Float32Array(pos.count * 3)
  const zenith = new THREE.Color(0xb7cce0)
  const horizon = new THREE.Color(0x9aaf98)
  const scratch = new THREE.Color()
  for (let i = 0; i < pos.count; i += 1) {
    const y = pos.getY(i)
    scratch.copy(horizon).lerp(zenith, Math.max(0, Math.min(1, y / 240)))
    colors[i * 3] = scratch.r
    colors[i * 3 + 1] = scratch.g
    colors[i * 3 + 2] = scratch.b
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'sky'
  mesh.renderOrder = -1
  mesh.frustumCulled = false
  return mesh
}

function grassAlbedo(): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    const fallback = new THREE.CanvasTexture(canvas)
    fallback.colorSpace = THREE.SRGBColorSpace
    return fallback
  }
  const image = ctx.createImageData(size, size)
  const data = image.data
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4
      const streak = hashed(x * 19 + Math.floor(y / 3) * 7)
      const clump = hashed(Math.floor(x / 18) * 31 + Math.floor(y / 14) * 17)
      const speck = hashed(x * 53 + y * 97)
      const blade = 0.78 + streak * 0.28 + (speck - 0.5) * 0.08
      const dirt = clump > 0.82 ? 0.12 : 0
      data[i] = Math.max(0, Math.min(255, Math.round((blade * 0.92 + dirt * 0.35) * 255)))
      data[i + 1] = Math.max(0, Math.min(255, Math.round((blade * 1.02 - dirt * 0.18) * 255)))
      data[i + 2] = Math.max(0, Math.min(255, Math.round((blade * 0.72 + dirt * 0.08) * 255)))
      data[i + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(42, 42)
  texture.anisotropy = 8
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

function hashed(value: number): number {
  let hash = value | 0
  hash = Math.imul(hash ^ (hash >>> 16), 2246822519)
  hash = Math.imul(hash ^ (hash >>> 13), 3266489917)
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296
}
