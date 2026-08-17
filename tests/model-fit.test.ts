import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { fitToHeight } from '@/render/ModelFit'

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
})
