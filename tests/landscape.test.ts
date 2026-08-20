import { describe, expect, it } from 'vitest'
import { distToRoad, pointNearRiver, riverStrips, roadStrips, RIVER_SPINE, terrainBlocksWalk, terrainHeight, terrainTint } from '@/data/landscape'
import { seedOutdoorScenery } from '@/data/outdoorScenery'
import { BASE } from '@/simulation/baseLayout'

describe('landscape', () => {
  it('builds a continuous river that passes the fishing banks', () => {
    const strips = riverStrips()
    expect(strips.length).toBe(RIVER_SPINE.length - 1)
    expect(strips.every((strip) => strip.width >= 10 && strip.length > 8)).toBe(true)
    expect(pointNearRiver(-64, 36)).toBe(true)
    expect(pointNearRiver(0, 0)).toBe(false)
  })

  it('runs dirt approaches out of the four gates', () => {
    const roads = roadStrips()
    expect(roads.length).toBeGreaterThanOrEqual(8)
    expect(roads.some((strip) => strip.x > 30 && strip.z < 5)).toBe(true)
    expect(roads.some((strip) => strip.x < -30)).toBe(true)
  })

  it('sculpts a bowl, river valley, wooded rise, and rim hills', () => {
    expect(Math.abs(terrainHeight(0, 0))).toBeLessThan(0.001)
    expect(terrainHeight(-64, 36)).toBeLessThan(-0.4)
    expect(terrainHeight(90, -20)).toBeGreaterThan(0.3)
    expect(terrainHeight(0, 165)).toBeGreaterThan(3)
    const grass = terrainTint(10, 8)
    const wood = terrainTint(90, -20)
    expect(wood[1]).toBeLessThan(grass[1])
    expect(terrainBlocksWalk(0, 0)).toBe(false)
    expect(terrainBlocksWalk(-64, 36)).toBe(true)
    expect(terrainBlocksWalk(0, 160)).toBe(true)
  })

  it('keeps river rocks along the water instead of a box fill', () => {
    const scenery = seedOutdoorScenery()
    const banks = scenery.filter((pose) => pointNearRiver(pose.x, pose.z, 10))
    expect(banks.length).toBeGreaterThan(8)
  })

  it('dresses the palisade skirt instead of a golf lawn', () => {
    const scenery = seedOutdoorScenery()
    const southYard = scenery.filter(
      (pose) => pose.z < BASE.south - 2 && pose.z > BASE.south - 14 && pose.x > BASE.west + 6 && pose.x < BASE.east - 6,
    )
    const eastYard = scenery.filter(
      (pose) => pose.x > BASE.east + 2 && pose.x < BASE.east + 14 && pose.z > BASE.south + 6 && pose.z < BASE.north - 6,
    )
    expect(southYard.length).toBeGreaterThan(12)
    expect(eastYard.length).toBeGreaterThan(8)
    expect(
      scenery.every(
        (pose) =>
          pose.x <= BASE.west + 1.5 || pose.x >= BASE.east - 1.5 || pose.z <= BASE.south + 1.5 || pose.z >= BASE.north - 1.5,
      ),
    ).toBe(true)
    const a = terrainTint(12, 8)
    const b = terrainTint(18, 14)
    expect(Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1])).toBeGreaterThan(0.008)
  })

  it('browns the dirt tracks and puts a tree belt in front of the rim', () => {
    expect(distToRoad(48, -8)).toBeLessThan(2)
    expect(distToRoad(0, 0)).toBeGreaterThan(20)
    const track = terrainTint(48, -8)
    const grass = terrainTint(10, 8)
    expect(track[0]).toBeGreaterThan(grass[0])
    expect(track[1]).toBeLessThan(grass[1])
    const scenery = seedOutdoorScenery()
    const belt = scenery.filter((pose) => {
      const reach = Math.hypot(pose.x, pose.z)
      return reach > 88 && reach < 130 && pose.assetId.includes('tree')
    })
    expect(belt.length).toBeGreaterThan(8)
  })
})
