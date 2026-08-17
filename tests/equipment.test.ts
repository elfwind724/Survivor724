import { describe, expect, it } from 'vitest'
import { derivedStats } from '@/data/equipment'
import { countItem } from '@/inventory/Inventory'
import { createInitialWorld } from '@/simulation/WorldState'
import { equipItem, unequipSlot } from '@/survivors/Equipment'

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

  it('equips a warehouse pistol onto the weapon slot and can take it off', () => {
    const world = createInitialWorld()
    const hunter = world.survivors.find((entry) => entry.id === 'hunter')
    const warehouse = world.inventories['inv-warehouse']
    if (!hunter || !warehouse) throw new Error('missing hunter')
    const beforeAgi = derivedStats(hunter.attributes, hunter.equipment).total.agility
    const pistols = countItem(warehouse, 'pistol')
    expect(equipItem(world, hunter, 'pistol')).toBe(true)
    expect(hunter.equipment.weapon).toBe('pistol')
    expect(derivedStats(hunter.attributes, hunter.equipment).total.agility).toBe(beforeAgi + 2)
    expect(countItem(warehouse, 'pistol')).toBe(pistols - 1)
    expect(unequipSlot(world, hunter, 'weapon')).toBe(true)
    expect(hunter.equipment.weapon).toBeNull()
  })
})
