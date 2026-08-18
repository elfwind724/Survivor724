import { describe, expect, it } from 'vitest'
import { fireProfile } from '@/data/weapons'
import { itemLabel, withPlus } from '@/data/items'
import { countItem } from '@/inventory/Inventory'
import { createInitialWorld } from '@/simulation/WorldState'
import { combatRating, enhanceCost, spendAttr, tryEnhance } from '@/survivors/Enhance'
import { grantXp } from '@/survivors/Progress'
import { inspectSheetHtml } from '@/ui/CharacterSheet'

describe('character growth and enhance', () => {
  it('gives the hero attribute points to spend and auto-trains npcs', () => {
    const world = createInitialWorld()
    const hero = world.survivors.find((entry) => entry.id === 'hunter')
    const fisher = world.survivors.find((entry) => entry.id === 'fisher')
    if (!hero || !fisher) throw new Error('missing people')
    const heroStr = hero.attributes.strength
    const fisherCon = fisher.attributes.constitution
    grantXp(hero, 80)
    grantXp(fisher, 80)
    expect(hero.level).toBeGreaterThan(1)
    expect(hero.attrPoints).toBeGreaterThan(0)
    expect(hero.attributes.strength).toBe(heroStr)
    expect(spendAttr(hero, 'strength')).toBe(true)
    expect(hero.attributes.strength).toBe(heroStr + 1)
    expect(fisher.attrPoints).toBe(0)
    expect(fisher.attributes.constitution).toBeGreaterThan(fisherCon)
  })

  it('enhances a worn weapon to +1 and raises its damage', () => {
    const world = createInitialWorld()
    const hunter = world.survivors.find((entry) => entry.id === 'hunter')
    if (!hunter) throw new Error('missing hunter')
    hunter.equipment.weapon = 'rifle'
    hunter.enhance.weapon = 0
    const before = fireProfile(hunter).damage
    const scrap = world.inventories['inv-warehouse']
    if (!scrap) throw new Error('missing scrap')
    const had = countItem(scrap, 'scrap')
    expect(tryEnhance(world, hunter, 'weapon')).toBe('ok')
    expect(hunter.enhance.weapon).toBe(1)
    expect(fireProfile(hunter).damage).toBeGreaterThan(before)
    expect(countItem(scrap, 'scrap')).toBe(had - enhanceCost(0))
    expect(itemLabel(withPlus('rifle', 1))).toBe('步枪 +1')
    expect(combatRating(hunter)).toBeGreaterThan(100)
  })

  it('shows combat power and enhance on the character sheet', () => {
    const world = createInitialWorld()
    const hero = world.survivors.find((entry) => entry.id === 'hunter')
    if (!hero) throw new Error('missing hero')
    hero.attrPoints = 2
    hero.equipment.weapon = 'rifle'
    const stats = inspectSheetHtml(world, 'hunter', 'stats')
    expect(stats).toContain('战力')
    expect(stats).toContain('可分配属性点 2')
    expect(stats).toContain('data-stat="strength"')
    const gear = inspectSheetHtml(world, 'hunter', 'gear')
    expect(gear).toContain('强化')
    expect(gear).toContain('+1')
  })
})
