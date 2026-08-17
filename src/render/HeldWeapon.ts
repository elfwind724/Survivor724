import * as THREE from 'three'

const HOLD_NAMES = ['WristR', 'PalmR', 'MiddleHandR', 'RightHand', 'Hand_R', 'mixamorigRightHand']

const _pos = new THREE.Vector3()
const _fwd = new THREE.Vector3()
const _up = new THREE.Vector3()
const _right = new THREE.Vector3()
const _quat = new THREE.Quaternion()
const _parentQ = new THREE.Quaternion()
const _mat = new THREE.Matrix4()

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
  if (weaponId === 'pistol' || weaponId === 'revolver') return 0.34
  if (weaponId === 'smg') return 0.55
  if (weaponId === 'sniper') return 1.05
  if (weaponId === 'shotgun') return 0.9
  return 0.78
}

export function prepareHeldGun(source: THREE.Object3D): THREE.Group {
  const holder = new THREE.Group()
  holder.add(source)
  source.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(source)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const longest = Math.max(size.x, size.y, size.z)
  if (Number.isFinite(longest) && longest > 0.01) {
    const grip = new THREE.Vector3(center.x, box.min.y + size.y * 0.45, center.z - size.z * 0.06)
    source.position.sub(grip)
    source.scale.multiplyScalar(1 / longest)
  }
  return holder
}

export function snapHeldGun(
  character: THREE.Object3D,
  hand: THREE.Object3D,
  gun: THREE.Object3D,
  weaponId: string,
): void {
  if (gun.parent !== character) character.add(gun)
  hand.updateWorldMatrix(true, false)
  hand.getWorldPosition(_pos)
  character.getWorldQuaternion(_parentQ)
  _fwd.set(0, 0, 1).applyQuaternion(_parentQ)
  _right.crossVectors(_up.set(0, 1, 0), _fwd)
  if (_right.lengthSq() < 1e-6) _right.set(1, 0, 0)
  else _right.normalize()
  _up.crossVectors(_fwd, _right).normalize()
  _pos.addScaledVector(_fwd, 0.1)
  _pos.addScaledVector(_right, 0.04)
  _mat.makeBasis(_right, _up, _fwd)
  _quat.setFromRotationMatrix(_mat)
  character.worldToLocal(_pos)
  gun.position.copy(_pos)
  gun.quaternion.copy(_parentQ.invert().multiply(_quat))
  gun.scale.setScalar(heldGunLength(weaponId))
  gun.visible = true
}
