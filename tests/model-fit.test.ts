import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { findHoldBone, heldGunLength, prepareHeldGun } from '@/render/HeldWeapon'
import { fitHeldGun, fitToHeight } from '@/render/ModelFit'

describe('model fit', () => {
  it('brings an oversized Man and a normal Adventurer to the same height', () => {
    const tall = new THREE.Mesh(new THREE.BoxGeometry(1, 4.83, 1))
    const short = new THREE.Mesh(new THREE.BoxGeometry(1, 1.83, 1))
    fitToHeight(tall, 2.8)
    fitToHeight(short, 2.8)
    const tallH = new THREE.Box3().setFromObject(tall)
    const shortH = new THREE.Box3().setFromObject(short)
    expect(tallH.max.y - tallH.min.y).toBeCloseTo(2.8, 2)
    expect(shortH.max.y - shortH.min.y).toBeCloseTo(2.8, 2)
  })

  it('scales a long gun down to held size', () => {
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 4))
    fitHeldGun(gun)
    const box = new THREE.Box3().setFromObject(gun)
    const size = box.getSize(new THREE.Vector3())
    expect(Math.max(size.x, size.y, size.z)).toBeCloseTo(0.82, 2)
  })

  it('parents a recentered gun to WristR, not the ground', () => {
    const root = new THREE.Group()
    const wrist = new THREE.Bone()
    wrist.name = 'WristR'
    wrist.position.set(-0.22, 1.04, 0.14)
    root.add(wrist)
    expect(findHoldBone(root)?.name).toBe('WristR')
    const raw = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.3, 4))
    raw.position.set(0, -0.2, 0)
    const held = prepareHeldGun(raw)
    wrist.add(held)
    root.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(held)
    const size = box.getSize(new THREE.Vector3())
    expect(Math.max(size.x, size.y, size.z)).toBeCloseTo(1, 2)
    expect(heldGunLength('pistol')).toBeLessThan(heldGunLength('rifle'))
    expect(held.parent?.name).toBe('WristR')
    expect(box.getCenter(new THREE.Vector3()).y).toBeGreaterThan(0.6)
  })
})
