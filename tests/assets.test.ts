import { describe, expect, it } from 'vitest'
import { ASSET_INDEX, assetById, assetUrl, assetsIn } from '@/data/assetIndex'
import { CREATIVE_TABS, ENEMY_ASSETS, gateOpenAsset, SURVIVOR_ASSETS, STRUCTURE_ASSETS } from '@/data/worldDressing'

describe('asset catalog', () => {
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
    expect(assetById(STRUCTURE_ASSETS.wall ?? '')?.name).toBe('Wooden Wall')
    expect(assetById(STRUCTURE_ASSETS.warehouse ?? '')?.name).toBe('Storage House')
    expect(assetById(ENEMY_ASSETS.wanderer ?? '')?.id).toBe('people/punk')
    expect(assetById(ENEMY_ASSETS.runner ?? '')?.id).toBe('animals/wolf')
    expect(gateOpenAsset('fort/wooden-fortress-gate')).toBe('fort/wall-towers')
    expect(gateOpenAsset('fort/castle-gate')).toBe('fort/wall-towers-door-seco')
  })

  it('exposes creative tabs for every catalog category', () => {
    const tabIds = new Set(CREATIVE_TABS.map((tab) => tab.id))
    expect(tabIds.has('all')).toBe(true)
    expect(tabIds.has('people')).toBe(false)
    for (const entry of ASSET_INDEX) {
      if (entry.category === 'people') continue
      expect(tabIds.has(entry.category)).toBe(true)
    }
  })
})
