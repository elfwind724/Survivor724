import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export const MODEL_ASSETS = {
  bandit: '/assets/models/bandit.glb',
  child: '/assets/models/child.glb',
  hospitalBed: '/assets/models/hospital-bed.glb',
  oldArmchair: '/assets/models/old-armchair.glb',
  shelterFurniture: '/assets/models/shelter-furniture.glb',
  survivorLeader: '/assets/models/survivor-leader.glb',
  survivorMan: '/assets/models/survivor-man.glb',
  zombieDog: '/assets/models/zombie-dog.glb',
  zombie: '/assets/models/zombie.glb',
  rv: '/assets/models/rv.glb',
  forestPack: '/assets/models/forest-pack.glb',
  stonePack: '/assets/models/stone-pack.glb',
  playerNew: '/assets/models/new/characters/player.glb',
  survivorManNew: '/assets/models/new/characters/survivor-man.glb',
  survivorWomanNew: '/assets/models/new/characters/survivor-woman.glb',
  farmerNew: '/assets/models/new/characters/farmer.glb',
  banditNew: '/assets/models/new/characters/bandit.glb',
  banditNew2: '/assets/models/new/characters/bandit-2.glb',
  zombieNew: '/assets/models/new/characters/zombie.glb',
  zombieNew2: '/assets/models/new/characters/zombie-2.glb',
  pistolNew: '/assets/models/new/characters/pistol.glb',
  shotgunNew: '/assets/models/new/characters/shotgun.glb',
  deerNew: '/assets/models/new/animals/deer.glb',
  cowNew: '/assets/models/new/animals/cow.glb',
  sheepNew: '/assets/models/new/animals/alpaca.glb',
  wolfNew: '/assets/models/new/animals/wolf.glb',
  foxNew: '/assets/models/new/animals/fox.glb',
  dogNew: '/assets/models/new/animals/husky.glb',
  pineNewA: '/assets/models/new/nature/pine-a.glb',
  pineNewB: '/assets/models/new/nature/pine-b.glb',
  treeNewA: '/assets/models/new/nature/tree-a.glb',
  treeNewB: '/assets/models/new/nature/tree-b.glb',
  deadTreeNew: '/assets/models/new/nature/dead-tree.glb',
  rockNewA: '/assets/models/new/nature/rock-a.glb',
  rockNewB: '/assets/models/new/nature/rock-b.glb',
  bushFlowersNew: '/assets/models/new/nature/bush-flowers.glb',
  cityBigBuildingNew: '/assets/models/new/city/big-building.glb',
  cityBrownBuildingNew: '/assets/models/new/city/brown-building.glb',
  cityGreenBuildingNew: '/assets/models/new/city/green-building.glb',
  cityRedBuildingNew: '/assets/models/new/city/red-building.glb',
  cityRedCornerNew: '/assets/models/new/city/red-corner.glb',
  cityPizzaCornerNew: '/assets/models/new/city/pizza-corner.glb',
  cityBenchNew: '/assets/models/new/city/bench.glb',
  cityDumpsterNew: '/assets/models/new/city/dumpster.glb',
  storageBox: '/assets/models/props/storage-box.glb',
  storageCabinet: '/assets/models/props/storage-cabinet.glb',
  storageSafe: '/assets/models/props/storage-safe.glb',
  medicalSideTable: '/assets/models/props/medical-side-table.glb',
  medicalSupplies: '/assets/models/props/medical-supplies.glb',
  workTable: '/assets/models/props/work-table.glb',
  toolbox: '/assets/models/props/toolbox.glb',
  wrench: '/assets/models/props/wrench.glb',
  hammer: '/assets/models/props/hammer.glb',
  powerBox: '/assets/models/props/power-box.glb',
} as const

export interface AttachModelOptions {
  name?: string
  targetHeight?: number
  targetSize?: number
  rotationY?: number
  offset?: THREE.Vector3 | [number, number, number]
  fallback?: THREE.Object3D[]
  playAnimation?: boolean
  /** Preferred clip names, in priority order. Matching ignores punctuation and case. */
  animation?: string | string[]
  castShadow?: boolean
  receiveShadow?: boolean
  /** Attach only one named node from a multi-prop asset pack. */
  selectNode?: string
  onReady?: (model: THREE.Group) => void
}

export interface StaticMeshAsset {
  geometry: THREE.BufferGeometry
  material: THREE.Material | THREE.Material[]
}

type AnimatedModel = {
  root: THREE.Object3D
  mixer: THREE.AnimationMixer
  clips: THREE.AnimationClip[]
  current: THREE.AnimationAction | null
  currentName: string
}

const loader = new GLTFLoader()
const prototypes = new Map<string, Promise<GLTF>>()
const animations = new Set<AnimatedModel>()

function normalizedClipName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function findClip(clips: THREE.AnimationClip[], requested: string[]): THREE.AnimationClip | undefined {
  const names = requested.map(normalizedClipName).filter(Boolean)
  for (const wanted of names) {
    const exact = clips.find(clip => normalizedClipName(clip.name) === wanted)
    if (exact) return exact
  }
  for (const wanted of names) {
    const partial = clips.find(clip => normalizedClipName(clip.name).includes(wanted))
    if (partial) return partial
  }
  return undefined
}

function playModelClip(entry: AnimatedModel, requested: string[], fade = 0.16): boolean {
  const clip = findClip(entry.clips, requested)
  if (!clip || clip.name === entry.currentName) return !!clip
  const next = entry.mixer.clipAction(clip)
  next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(fade).play()
  entry.current?.fadeOut(fade)
  entry.current = next
  entry.currentName = clip.name
  return true
}

function getPrototype(url: string): Promise<GLTF> {
  let pending = prototypes.get(url)
  if (!pending) {
    pending = loader.loadAsync(url)
    prototypes.set(url, pending)
  }
  return pending
}

function normalizeModel(model: THREE.Object3D, targetHeight?: number, targetSize?: number): void {
  model.updateMatrixWorld(true)
  const bounds = new THREE.Box3().setFromObject(model)
  const size = bounds.getSize(new THREE.Vector3())
  const desired = targetHeight ?? targetSize
  const measured = targetHeight ? size.y : Math.max(size.x, size.y, size.z)
  if (desired && measured > 0.0001) model.scale.multiplyScalar(desired / measured)

  model.updateMatrixWorld(true)
  bounds.setFromObject(model)
  const center = bounds.getCenter(new THREE.Vector3())
  model.position.x -= center.x
  model.position.y -= bounds.min.y
  model.position.z -= center.z
}

function offsetVector(offset?: THREE.Vector3 | [number, number, number]): THREE.Vector3 {
  if (!offset) return new THREE.Vector3()
  return Array.isArray(offset) ? new THREE.Vector3(...offset) : offset.clone()
}

/**
 * Adds a lazy GLB visual without transferring ownership of gameplay state.
 * The procedural parent remains the authoritative transform/collider/AI root;
 * if the asset fails, its low-poly fallback stays visible and playable.
 */
export async function attachModelVisual(
  parent: THREE.Object3D,
  url: string,
  options: AttachModelOptions = {},
): Promise<THREE.Group | null> {
  parent.userData.modelAssetLoading = url
  try {
    const gltf = await getPrototype(url)
    if (parent.userData.disposed) return null
    const selected = options.selectNode ? gltf.scene.getObjectByName(options.selectNode) : gltf.scene
    if (!selected) throw new Error(`Node "${options.selectNode}" was not found in ${url}`)
    const content = cloneSkeleton(selected) as THREE.Group
    content.name = `${options.name ?? 'model'}_content`
    normalizeModel(content, options.targetHeight, options.targetSize)
    content.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      object.castShadow = options.castShadow ?? true
      object.receiveShadow = options.receiveShadow ?? true
      object.frustumCulled = true
      object.userData.sharedModelAsset = true
    })

    const wrapper = new THREE.Group()
    wrapper.name = options.name ?? `model_${url.split('/').pop() ?? 'asset'}`
    wrapper.position.copy(offsetVector(options.offset))
    wrapper.rotation.y = options.rotationY ?? 0
    wrapper.add(content)
    parent.add(wrapper)

    for (const fallback of options.fallback ?? []) fallback.visible = false
    if (options.playAnimation !== false && gltf.animations.length > 0) {
      const mixer = new THREE.AnimationMixer(content)
      const entry: AnimatedModel = { root: wrapper, mixer, clips: gltf.animations, current: null, currentName: '' }
      wrapper.userData.modelAnimation = entry
      animations.add(entry)
      const requested = options.animation
        ? (Array.isArray(options.animation) ? options.animation : [options.animation])
        : (parent.userData.requestedModelAnimation as string[] | undefined)
      if (!playModelClip(entry, requested ?? ['Idle', 'Idle_Neutral'], 0)) {
        playModelClip(entry, [gltf.animations[0].name], 0)
      }
    }
    delete parent.userData.modelAssetLoading
    parent.userData.modelAssetReady = url
    options.onReady?.(wrapper)
    return wrapper
  } catch (error) {
    delete parent.userData.modelAssetLoading
    parent.userData.modelAssetError = url
    console.warn(`[ModelLibrary] Failed to load ${url}; keeping fallback`, error)
    return null
  }
}

/**
 * Extract one prop from a GLB pack into an InstancedMesh-ready asset.
 * WorldManager keeps ownership of transforms and interaction slots; the GLB
 * only supplies production geometry and material. Asset-pack props used here
 * intentionally contain one render mesh beneath their named root.
 */
export async function loadStaticMeshAsset(
  url: string,
  nodeName?: string,
  targetHeight?: number,
  targetSize?: number,
): Promise<StaticMeshAsset> {
  const gltf = await getPrototype(url)
  const source = nodeName ? gltf.scene.getObjectByName(nodeName) : gltf.scene
  if (!source) throw new Error(`Node "${nodeName}" was not found in ${url}`)
  const content = cloneSkeleton(source) as THREE.Object3D
  normalizeModel(content, targetHeight, targetSize)
  content.updateMatrixWorld(true)

  const geometries: THREE.BufferGeometry[] = []
  const materials: THREE.Material[] = []
  content.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    const geometry = object.geometry.clone()
    geometry.applyMatrix4(object.matrixWorld)
    geometries.push(geometry)
    const material = Array.isArray(object.material) ? object.material[0] : object.material
    materials.push(material.clone())
  })
  if (geometries.length === 0) throw new Error(`Node "${nodeName ?? 'scene'}" has no mesh in ${url}`)

  const merged = geometries.length > 1 ? mergeGeometries(geometries, true) : geometries[0]
  const geometry = merged ?? geometries[0]
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  const material = materials.length > 1 && merged ? materials : materials[0]
  return { geometry, material }
}

/** Change an already attached model's animation without coupling gameplay to its skeleton. */
export function setModelAnimation(
  target: THREE.Object3D,
  requested: string | string[],
  fade = 0.16,
): boolean {
  const names = Array.isArray(requested) ? requested : [requested]
  target.userData.requestedModelAnimation = names
  let changed = false
  target.traverse((object) => {
    const entry = object.userData.modelAnimation as AnimatedModel | undefined
    if (entry) changed = playModelClip(entry, names, fade) || changed
  })
  return changed
}

export function preloadModel(url: string): void {
  void getPrototype(url).catch((error) => console.warn(`[ModelLibrary] Preload failed: ${url}`, error))
}

export class ModelAnimationRuntime {
  update(delta: number): void {
    for (const entry of animations) {
      let node: THREE.Object3D | null = entry.root
      while (node?.parent) node = node.parent
      if (!(node instanceof THREE.Scene)) {
        animations.delete(entry)
        continue
      }
      entry.mixer.update(delta)
    }
  }
}
