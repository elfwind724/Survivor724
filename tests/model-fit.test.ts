import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { alignGunAxes, barrelTipWorld, findHoldBone, heldGunLength, holdPose, prepareHeldGun, snapHeldGun } from '@/render/HeldWeapon'
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

  it('puts the grip at the origin and parents the gun to WristR', () => {
    const raw = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.3, 4))
    raw.position.set(0, -0.8, 0.4)
    const held = prepareHeldGun(raw)
    held.updateMatrixWorld(true)
    const prepared = new THREE.Box3().setFromObject(held)
    const center = prepared.getCenter(new THREE.Vector3())
    expect(Math.max(prepared.max.x - prepared.min.x, prepared.max.y - prepared.min.y, prepared.max.z - prepared.min.z)).toBeCloseTo(1, 2)
    expect(Math.abs(center.x)).toBeLessThan(0.2)
    expect(Math.abs(center.y)).toBeLessThan(0.3)
    expect(Math.abs(center.z)).toBeLessThan(0.3)

    const root = new THREE.Group()
    const wrist = new THREE.Bone()
    wrist.name = 'WristR'
    wrist.position.set(-0.22, 1.04, 0.14)
    root.add(wrist)
    expect(findHoldBone(root)?.name).toBe('WristR')
    root.updateMatrixWorld(true)
    snapHeldGun(root, wrist, held, 'pistol')
    root.updateMatrixWorld(true)
    expect(held.parent).toBe(root)
    expect(heldGunLength('pistol')).toBeLessThan(heldGunLength('rifle'))
    expect(held.visible).toBe(true)
    const world = new THREE.Vector3()
    held.getWorldPosition(world)
    expect(world.y).toBeGreaterThan(0.9)
    expect(world.distanceTo(new THREE.Vector3(-0.22, 1.04, 0.14))).toBeLessThan(0.35)
  })

  it('keeps pistol grips low and turns a sideways shotgun barrel onto Z', () => {
    expect(holdPose('pistol').lift).toBeLessThan(0.05)
    expect(holdPose('rifle').lift).toBeLessThan(0.06)
    expect(holdPose('shotgun').barrelFlip).toBe(true)
    expect(holdPose('rifle').barrelFlip).toBe(false)
    const shotgun = new THREE.Mesh(new THREE.BoxGeometry(5, 0.8, 0.3))
    alignGunAxes(shotgun)
    shotgun.updateMatrixWorld(true)
    const size = new THREE.Box3().setFromObject(shotgun).getSize(new THREE.Vector3())
    expect(size.z).toBeGreaterThan(size.x)
    expect(size.z).toBeGreaterThan(size.y)
  })

  it('finds the barrel tip in front of the grip for a long gun', () => {
    const gun = new THREE.Group()
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 2))
    mesh.position.z = 1
    gun.add(mesh)
    gun.updateMatrixWorld(true)
    const barrel = barrelTipWorld(gun)
    expect(barrel.dir.z).toBeGreaterThan(0.9)
    expect(barrel.tip.z).toBeGreaterThan(1.6)
  })
})
