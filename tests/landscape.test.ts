import { describe, expect, it } from 'vitest'
import { pointNearRiver, riverStrips, roadStrips, RIVER_SPINE, terrainBlocksWalk, terrainHeight, terrainTint } from '@/data/landscape'
import { seedOutdoorScenery } from '@/data/outdoorScenery'

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
})
