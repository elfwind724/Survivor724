import { describe, expect, it } from 'vitest'
import { createEnemy, tryShoot, stepProjectiles } from '@/combat/Combat'
import { affixText, procLabel, rollGear, RARITY_COLOR, RARITY_LABEL } from '@/data/loot'
import { fireProfile } from '@/data/weapons'
import { countItem } from '@/inventory/Inventory'
import { createInitialWorld } from '@/simulation/WorldState'
import { possessSurvivor } from '@/controls/PlayerControl'

describe('diablo-style loot', () => {
  it('rolls colored rarities, affixes, and legendary procs', () => {
    const world = createInitialWorld()
    const legend = rollGear(world, 'force-legend-seed-zzz', 0.9, 'weapon')
    expect(world.gear[legend.id]).toBe(legend)
    expect(['common', 'magic', 'rare', 'legendary']).toContain(legend.rarity)
    expect(RARITY_COLOR[legend.rarity]).toMatch(/^#/)
    expect(RARITY_LABEL[legend.rarity].length).toBeGreaterThan(0)
    if (legend.rarity === 'legendary') {
      expect(legend.procs.length).toBeGreaterThan(0)
      expect(procLabel(legend.procs[0]!).length).toBeGreaterThan(0)
    }
    const magic = rollGear(world, 'magic-only-aaaaaaaa', 0, 'weapon')
    expect(magic.affixes.every((affix) => affixText(affix).includes('+'))).toBe(true)
  })

  it('applies min-max damage, crit, and extra pellets from a legendary gun', () => {
    const world = createInitialWorld()
    const hunter = world.survivors.find((entry) => entry.id === 'hunter')
    if (!hunter) throw new Error('missing hunter')
    const piece = rollGear(world, 'legend-gun-seed-xxx', 0.95, 'weapon')
    piece.rarity = 'legendary'
    piece.affixes = [
      { id: 'min_dmg', label: '最小攻击', value: 6 },
      { id: 'max_dmg', label: '最大攻击', value: 12 },
      { id: 'crit', label: '暴击几率', value: 40 },
      { id: 'crit_dmg', label: '暴击伤害', value: 50 },
      { id: 'aspd', label: '攻速', value: 15 },
    ]
    piece.procs = ['double', 'pierce']
    hunter.equipment.weapon = piece.id
    const profile = fireProfile(hunter, 0, world)
    expect(profile.minDamage).toBeLessThan(profile.maxDamage)
    expect(profile.pellets).toBeGreaterThan(1)
    expect(profile.critChance).toBeGreaterThan(0.3)
    expect(profile.procs).toContain('pierce')
    possessSurvivor(world, 'hunter')
    world.enemies.push(createEnemy('wanderer', { x: hunter.position.x, y: 0, z: hunter.position.z + 5 }, 'loot-dummy'))
    expect(tryShoot(world, hunter)).toBe(true)
    expect(world.projectiles.length).toBeGreaterThan(1)
    expect(world.projectiles[0]?.pierce).toBeGreaterThan(0)
    stepProjectiles(world, 0.2)
  })

  it('can drop a named weapon into a bag', () => {
    const world = createInitialWorld()
    const hunter = world.survivors.find((entry) => entry.id === 'hunter')
    if (!hunter) throw new Error('missing hunter')
    const bag = world.inventories[hunter.inventoryId]
    if (!bag) throw new Error('missing bag')
    const piece = rollGear(world, 'bag-drop-seed', 0.2, 'weapon')
    bag.items.push({ itemId: piece.id, count: 1 })
    expect(countItem(bag, piece.id)).toBe(1)
    expect(piece.name.length).toBeGreaterThan(1)
  })
})
