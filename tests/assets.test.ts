import { describe, expect, it } from 'vitest'
import { ASSET_INDEX, assetById, assetUrl, assetsIn } from '@/data/assetIndex'
import { reservedPeopleIds, SURVIVOR_ASSETS, STRUCTURE_ASSETS, unusedDressingIds, worldDressing } from '@/data/worldDressing'

describe('asset catalog and world dressing', () => {
  it('indexes real glbs by readable names and skips mac resource forks', () => {
    expect(ASSET_INDEX.length).toBeGreaterThan(300)
    expect(ASSET_INDEX.some((entry) => entry.file.includes('/._') || entry.name.startsWith('._'))).toBe(false)
    expect(assetsIn('people').some((entry) => entry.id === 'people/adventurer')).toBe(true)
    expect(assetById('fort/wooden-wall')?.name).toBe('Wooden Wall')
    expect(assetUrl('人物模型/Worker by Quaternius - Yg2bQZO6Hj.glb')).toContain('%E4%BA%BA%E7%89%A9%E6%A8%A1%E5%9E%8B')
    expect(assetUrl('人物模型/Worker by Quaternius - Yg2bQZO6Hj.glb')).toContain('Worker')
  })

  it('maps camp roles to named people and buildings', () => {
    expect(assetById(SURVIVOR_ASSETS.hunter ?? '')?.name).toBe('Adventurer')
    expect(assetById(SURVIVOR_ASSETS.fisher ?? '')?.name).toBe('Beach Character')
    expect(assetById(SURVIVOR_ASSETS.hauler ?? '')?.name).toBe('Worker')
    expect(assetById(STRUCTURE_ASSETS.wall)?.name).toBe('Wooden Wall')
    expect(assetById(STRUCTURE_ASSETS.warehouse)?.name).toBe('Storage House')
  })

  it('places every non-reserved asset at least once', () => {
    const poses = worldDressing()
    expect(poses.length).toBeGreaterThan(200)
    expect(poses.every((pose) => Number.isFinite(pose.x) && Number.isFinite(pose.z))).toBe(true)
    expect(unusedDressingIds()).toEqual([])
    expect(reservedPeopleIds().length).toBeGreaterThan(0)
  })
})
