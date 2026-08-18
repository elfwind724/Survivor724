import { describe, expect, it } from 'vitest'
import { derivedStats } from '@/data/equipment'
import { countItem } from '@/inventory/Inventory'
import { createInitialWorld } from '@/simulation/WorldState'
import { equipHotbar, equipItem, hotbarOf, unequipSlot } from '@/survivors/Equipment'

describe('survivor equipment and attributes', () => {
  it('dresses each profession and derives combat and movement stats', () => {
    const world = createInitialWorld()
    const hunter = world.survivors.find((entry) => entry.id === 'hunter')
    if (!hunter) throw new Error('missing hunter')
    expect(hunter.equipment.clothes).toBe('jacket')
    expect(hunter.equipment.shoes).toBe('boots')
    const stats = derivedStats(hunter.attributes, hunter.equipment)
    expect(stats.total.strength).toBeGreaterThanOrEqual(12)
    expect(stats.attackPower).toBeGreaterThan(30)
    expect(hunter.moveSpeed).toBeCloseTo(stats.moveSpeed, 5)
  })

  it('lists distinct locker guns on the weapon slot', () => {
    const world = createInitialWorld()
    const hunter = world.survivors.find((entry) => entry.id === 'hunter')
    if (!hunter) throw new Error('missing hunter')
    expect(equipItem(world, hunter, 'shotgun')).toBe(true)
    expect(hunter.equipment.weapon).toBe('shotgun')
    expect(equipItem(world, hunter, 'sniper')).toBe(true)
    expect(hunter.equipment.weapon).toBe('sniper')
  })

  it('equips a warehouse pistol onto the weapon slot and can take it off', () => {
    const world = createInitialWorld()
    const hunter = world.survivors.find((entry) => entry.id === 'hunter')
    const locker = world.inventories['inv-locker']
    if (!hunter || !locker) throw new Error('missing hunter')
    const revolvers = countItem(locker, 'revolver')
    expect(equipItem(world, hunter, 'revolver')).toBe(true)
    expect(hunter.equipment.weapon).toBe('revolver')
    expect(derivedStats(hunter.attributes, hunter.equipment).total.strength).toBeGreaterThanOrEqual(14)
    expect(countItem(locker, 'revolver')).toBe(revolvers - 1)
    expect(unequipSlot(world, hunter, 'weapon')).toBe(true)
    expect(hunter.equipment.weapon).toBeNull()
  })

  it('uses assigned hotbar slots instead of dumping locker guns', () => {
    const world = createInitialWorld()
    const hunter = world.survivors.find((entry) => entry.id === 'hunter')
    if (!hunter) throw new Error('missing hunter')
    const slots = hotbarOf(world, hunter)
    const pistol = slots.findIndex((slot) => slot?.itemId === 'pistol')
    expect(pistol).toBe(0)
    expect(slots.some((slot) => slot?.itemId === 'rifle')).toBe(false)
    expect(slots[pistol]?.line).toMatch(/\d+-\d+/)
    expect(equipHotbar(world, hunter, pistol)?.itemId).toBe('pistol')
    expect(hunter.equipment.weapon).toBe('pistol')
  })
})
