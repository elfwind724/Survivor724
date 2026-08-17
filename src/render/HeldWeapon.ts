import * as THREE from 'three'

const HOLD_NAMES = ['WristR', 'PalmR', 'MiddleHandR', 'RightHand', 'Hand_R', 'mixamorigRightHand']

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

export function poseHeldGun(hand: THREE.Object3D, gun: THREE.Object3D, weaponId: string, aiming: boolean): void {
  if (gun.parent !== hand) hand.add(gun)
  const worldScale = hand.getWorldScale(new THREE.Vector3())
  const parent = Math.max(Math.abs(worldScale.x), 0.05)
  gun.scale.setScalar(heldGunLength(weaponId) / parent)
  if (aiming) gun.rotation.set(-Math.PI / 2, 0, Math.PI / 2)
  else gun.rotation.set(Math.PI, -Math.PI / 2, 0)
  gun.position.set(0.03, 0.02, 0.05)
}
