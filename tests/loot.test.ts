import { describe, expect, it } from 'vitest'
import { createEnemy, tryShoot, stepProjectiles } from '@/combat/Combat'
import { affixText, maybeDropGear, nearbyLootName, pickupGroundLoot, previewFire, primaryAffixes, procLabel, rollGear, secondaryAffixes, spawnGroundLoot, weaponScore, RARITY_COLOR, RARITY_LABEL } from '@/data/loot'
import { fireProfile } from '@/data/weapons'
import { addItem, countItem, usedSlots } from '@/inventory/Inventory'
import { createInitialWorld } from '@/simulation/WorldState'
import { possessSurvivor } from '@/controls/PlayerControl'
import { inspectSheetHtml } from '@/ui/CharacterSheet'
import { stepWorld } from '@/simulation/SimStep'

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

  it('leaves overflow guns on the ground instead of the warehouse', () => {
    const world = createInitialWorld()
    const hunter = world.survivors.find((entry) => entry.id === 'hunter')
    const bag = hunter ? world.inventories[hunter.inventoryId] : undefined
    const warehouse = world.inventories['inv-warehouse']
    if (!hunter || !bag || !warehouse) throw new Error('missing hunter')
    bag.items = []
    bag.capacity = 1
    addItem(bag, 'raw_meat', 1)
    const before = usedSlots(warehouse)
    let piece = maybeDropGear(world, hunter, 'force-drop-runner', 'runner', hunter.position)
    for (let i = 0; i < 40 && !piece; i += 1) {
      piece = maybeDropGear(world, hunter, `force-drop-runner-${i}`, 'runner', hunter.position)
    }
    expect(piece).toBeTruthy()
    if (!piece) throw new Error('no drop')
    expect(countItem(warehouse, piece.id)).toBe(0)
    expect(usedSlots(warehouse)).toBe(before)
    expect(world.groundLoot.some((drop) => drop.gearId === piece.id)).toBe(true)
  })

  it('picks ground loot into the bag when the survivor walks over it', () => {
    const world = createInitialWorld()
    const hunter = world.survivors.find((entry) => entry.id === 'hunter')
    const bag = hunter ? world.inventories[hunter.inventoryId] : undefined
    if (!hunter || !bag) throw new Error('missing hunter')
    const piece = rollGear(world, 'ground-pick-seed', 0.2, 'weapon')
    spawnGroundLoot(world, piece, hunter.position.x, hunter.position.z)
    const picked = pickupGroundLoot(world, hunter)
    expect(picked.map((entry) => entry.id)).toContain(piece.id)
    expect(countItem(bag, piece.id)).toBe(1)
    expect(world.groundLoot).toHaveLength(0)
  })

  it('scores a stronger gun higher so the sheet can compare output', () => {
    const world = createInitialWorld()
    const hunter = world.survivors.find((entry) => entry.id === 'hunter')
    const bag = hunter ? world.inventories[hunter.inventoryId] : undefined
    if (!hunter || !bag) throw new Error('missing hunter')
    const weak = rollGear(world, 'score-weak-seed', 0, 'weapon')
    weak.rarity = 'common'
    weak.affixes = []
    weak.procs = []
    const strong = rollGear(world, 'score-strong-seed', 0.95, 'weapon')
    strong.rarity = 'legendary'
    strong.affixes = [
      { id: 'min_dmg', label: '最小攻击', value: 12 },
      { id: 'max_dmg', label: '最大攻击', value: 24 },
      { id: 'aspd', label: '攻速', value: 20 },
      { id: 'crit', label: '暴击几率', value: 30 },
    ]
    strong.procs = ['triple']
    bag.items.push({ itemId: weak.id, count: 1 }, { itemId: strong.id, count: 1 })
    const weakScore = weaponScore(previewFire(world, hunter, weak.id))
    const strongScore = weaponScore(previewFire(world, hunter, strong.id))
    expect(strongScore).toBeGreaterThan(weakScore)
    const html = inspectSheetHtml(world, 'hunter', 'gear', 'weapon')
    expect(html).toContain('攻击')
    expect(html).toContain('输出')
    expect(html).toContain('攻速')
    expect(html).toContain('暴击')
    expect(html).toContain(strong.name)
  })

  it('splits combat affixes from secondary ones and names nearby drops', () => {
    const world = createInitialWorld()
    const hunter = world.survivors.find((entry) => entry.id === 'hunter')
    if (!hunter) throw new Error('missing hunter')
    const piece = rollGear(world, 'affix-split-seed', 0.4, 'weapon')
    piece.affixes = [
      { id: 'min_dmg', label: '最小攻击', value: 4 },
      { id: 'knockback', label: '击退', value: 1 },
      { id: 'str', label: '力量', value: 2 },
      { id: 'crit', label: '暴击几率', value: 8 },
    ]
    expect(primaryAffixes(piece.affixes).map((affix) => affix.id)).toEqual(['min_dmg', 'crit'])
    expect(secondaryAffixes(piece.affixes).map((affix) => affix.id)).toEqual(['knockback', 'str'])
    spawnGroundLoot(world, piece, hunter.position.x, hunter.position.z)
    expect(nearbyLootName(world, hunter.position.x, hunter.position.z)).toContain(piece.name)
    hunter.equipment.weapon = piece.id
    const html = inspectSheetHtml(world, 'hunter', 'stats')
    expect(html).toContain('最小攻击')
    expect(html).toContain('次')
  })

  it('kicks warehouse guns back onto the ground on the next sim step', () => {
    const world = createInitialWorld()
    const warehouse = world.inventories['inv-warehouse']
    const door = world.containers.find((entry) => entry.kind === 'warehouse')
    if (!warehouse || !door) throw new Error('missing warehouse')
    const piece = rollGear(world, 'warehouse-eject-seed', 0.3, 'weapon')
    warehouse.items.push({ itemId: piece.id, count: 1 })
    stepWorld(world, 1 / 30)
    expect(countItem(warehouse, piece.id)).toBe(0)
    expect(world.groundLoot.some((drop) => drop.gearId === piece.id)).toBe(true)
  })
})
