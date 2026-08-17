import * as THREE from 'three'

const HOLD_NAMES = ['WristR', 'PalmR', 'MiddleHandR', 'RightHand', 'Hand_R', 'mixamorigRightHand']

const _pos = new THREE.Vector3()
const _quat = new THREE.Quaternion()
const _parentQ = new THREE.Quaternion()
const _offset = new THREE.Vector3()
const _hold = new THREE.Quaternion()

export interface HoldPose {
  lift: number
  forward: number
  side: number
}

const HOLD_POSES: Record<string, HoldPose> = {
  pistol: { lift: 0.02, forward: 0.12, side: 0.01 },
  revolver: { lift: 0.02, forward: 0.12, side: 0.01 },
  smg: { lift: 0.03, forward: 0.13, side: 0.01 },
  rifle: { lift: 0.03, forward: 0.14, side: 0.01 },
  shotgun: { lift: 0.03, forward: 0.14, side: 0.01 },
  sniper: { lift: 0.03, forward: 0.15, side: 0.01 },
}

export function holdPose(weaponId: string): HoldPose {
  return HOLD_POSES[weaponId] ?? { lift: 0.03, forward: 0.06, side: 0.01 }
}

export function holdRotation(_weaponId: string): THREE.Quaternion {
  return _hold.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, Math.PI / 2, 'XYZ'))
}

export function alignGunAxes(object: THREE.Object3D): void {
  object.updateMatrixWorld(true)
  let box = new THREE.Box3().setFromObject(object)
  let size = box.getSize(new THREE.Vector3())
  if (size.x >= size.y && size.x >= size.z) object.rotateY(-Math.PI / 2)
  else if (size.y >= size.x && size.y >= size.z) object.rotateX(Math.PI / 2)
  object.updateMatrixWorld(true)
  box.setFromObject(object)
  if (Math.abs(box.min.z) > box.max.z) object.rotateY(Math.PI)
  object.updateMatrixWorld(true)
  box.setFromObject(object)
  size = box.getSize(new THREE.Vector3())
  if (size.x > size.y) object.rotateZ(Math.PI / 2)
  object.updateMatrixWorld(true)
  box.setFromObject(object)
  if (box.max.y > Math.abs(box.min.y)) object.rotateZ(Math.PI)
}

export function findHoldBone(root: THREE.Object3D): THREE.Object3D | null {
  for (const name of HOLD_NAMES) {
    const found = root.getObjectByName(name)
    if (found) return found
  }
  let fallback: THREE.Object3D | null = null
  root.traverse((object) => {
    if (fallback) return
    const name = object.name.toLowerCase().replace(/[:._\s-]/g, '')
    if (name === 'wristr' || name === 'palmr' || name === 'middlehandr' || name === 'righthand' || name === 'handr') {
      fallback = object
    }
  })
  return fallback
}

export function heldGunLength(weaponId: string): number {
  if (weaponId === 'pistol' || weaponId === 'revolver') return 0.32
  if (weaponId === 'smg') return 0.5
  if (weaponId === 'sniper') return 1.02
  if (weaponId === 'shotgun') return 0.86
  return 0.74
}

export function prepareHeldGun(source: THREE.Object3D): THREE.Group {
  const holder = new THREE.Group()
  holder.add(source)
  source.traverse((object) => {
    object.frustumCulled = false
    object.visible = true
    if (object instanceof THREE.Mesh) object.geometry = object.geometry.clone()
  })
  alignGunAxes(source)
  source.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(source)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const longest = Math.max(size.x, size.y, size.z)
  if (Number.isFinite(longest) && longest > 0.01) {
    const grip = new THREE.Vector3(center.x, box.min.y + size.y * 0.34, center.z - size.z * 0.08)
    source.position.sub(grip)
    source.position.multiplyScalar(1 / longest)
    source.scale.multiplyScalar(1 / longest)
  }
  holder.frustumCulled = false
  holder.visible = true
  return holder
}

export function snapHeldGun(
  character: THREE.Object3D,
  hand: THREE.Object3D,
  gun: THREE.Object3D,
  weaponId: string,
): void {
  if (gun.parent !== character) character.add(gun)
  gun.frustumCulled = false
  gun.visible = true
  hand.updateWorldMatrix(true, false)
  hand.getWorldPosition(_pos)
  hand.getWorldQuaternion(_quat)
  const pose = holdPose(weaponId)
  _offset.set(-pose.lift, pose.forward, pose.side).applyQuaternion(_quat)
  _pos.add(_offset)
  character.worldToLocal(_pos)
  gun.position.copy(_pos)
  character.getWorldQuaternion(_parentQ)
  gun.quaternion.copy(_parentQ.invert().multiply(_quat).multiply(holdRotation(weaponId)))
  gun.scale.setScalar(heldGunLength(weaponId))
}
