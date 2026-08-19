import { describe, expect, it } from 'vitest'
import { createEnemy, tryShoot } from '@/combat/Combat'
import { dungeonPropOffsets, generateDungeonLayout, isCombatAffix, rollRoomPicks } from '@/data/dungeon'
import { INFINITE_AMMO } from '@/data/weapons'
import { rollGear } from '@/data/loot'
import {
  advanceDungeon,
  chooseDungeonPick,
  dungeonEntrancePos,
  dungeonRoomCenter,
  enterDungeon,
  evacuateDungeon,
  isInDungeon,
} from '@/dungeon/Dungeon'
import { countItem } from '@/inventory/Inventory'
import { findSurvivor } from '@/simulation/EntityRegistry'
import { stepWorld } from '@/simulation/SimStep'
import { createInitialWorld } from '@/simulation/WorldState'
import { distanceXZ } from '@/simulation/types'
import { buildHudModel, renderHudHtml } from '@/ui/GameHud'

const ROOM_KINDS = ['combat', 'event', 'reward', 'elite', 'exit'] as const
const PICK_KINDS = ['ammo', 'bandage', 'gear_chest', 'shrine'] as const

describe('dungeon layout', () => {
  it('builds an 8–12 room run that starts in combat and ends at exit', () => {
    const layout = generateDungeonLayout(1, '724')
    expect(layout.length).toBeGreaterThanOrEqual(8)
    expect(layout.length).toBeLessThanOrEqual(12)
    expect(layout[0]?.kind).toBe('combat')
    expect(layout.at(-1)?.kind).toBe('exit')
    expect(layout.slice(0, -1).every((room) => room.kind !== 'exit')).toBe(true)
    expect(layout.every((room) => ROOM_KINDS.includes(room.kind))).toBe(true)
  })

  it('keeps every cave room inside the playable map', () => {
    const layout = generateDungeonLayout(1, 'dawn')
    for (let i = 0; i < layout.length; i += 1) {
      const at = dungeonRoomCenter({ nodes: layout, index: i } as never, i)
      expect(at.x).toBeGreaterThan(-80)
      expect(at.x).toBeLessThan(80)
      expect(at.z).toBeGreaterThan(-80)
      expect(at.z).toBeLessThan(80)
    }
  })

  it('dresses rooms with wall-side props so the fight floor stays open', () => {
    for (const kind of ROOM_KINDS) {
      const props = dungeonPropOffsets(kind, `dress:${kind}`)
      expect(props.length).toBeGreaterThanOrEqual(6)
      expect(props.some((prop) => prop.assetId.includes('torch'))).toBe(true)
      expect(props.every((prop) => Math.abs(prop.ox) >= 2.4 || Math.abs(prop.oz) >= 2.4)).toBe(true)
    }
    expect(dungeonPropOffsets('reward', 'a')).toEqual(dungeonPropOffsets('reward', 'a'))
    expect(dungeonPropOffsets('combat', 'a').map((prop) => prop.assetId)).not.toEqual(
      dungeonPropOffsets('reward', 'a').map((prop) => prop.assetId),
    )
  })

  it('returns the same rooms for the same dayIndex and worldSeed', () => {
    expect(generateDungeonLayout(3, '724')).toEqual(generateDungeonLayout(3, '724'))
    expect(generateDungeonLayout(1, '1')).toEqual(generateDungeonLayout(1, '1'))
  })
})

describe('room picks', () => {
  it('rolls 3 unique picks from the cave table', () => {
    const picks = rollRoomPicks('1:724:0')
    expect(picks).toHaveLength(3)
    expect(new Set(picks).size).toBe(3)
    expect(picks.every((kind) => PICK_KINDS.includes(kind))).toBe(true)
    expect(rollRoomPicks('1:724:0')).toEqual(picks)
  })

  it('treats min/max damage, aspd and crit as combat affixes', () => {
    expect(isCombatAffix('min_dmg')).toBe(true)
    expect(isCombatAffix('crit_dmg')).toBe(true)
    expect(isCombatAffix('knockback')).toBe(false)
    expect(isCombatAffix('str')).toBe(false)
  })
})

describe('dungeon run', () => {
  it('starts the world with a seed and no run', () => {
    const world = createInitialWorld()
    expect(world.worldSeed).toBe('dawn')
    expect(world.dungeonRun).toBeNull()
  })

  it('enterDungeon records the run, moves the survivor into the room, and spawns enemies', () => {
    const world = createInitialWorld()
    world.worldSeed = '724'
    const hunter = findSurvivor(world, 'hunter')
    if (!hunter) throw new Error('missing hunter')
    const origin = { ...hunter.position }
    const enemiesBefore = world.enemies.length

    enterDungeon(world, hunter)

    expect(world.dungeonRun).toBeTruthy()
    expect(world.dungeonRun?.nodes.length).toBeGreaterThanOrEqual(8)
    expect(world.dungeonRun?.nodes.length).toBeLessThanOrEqual(12)
    expect(world.dungeonRun?.nodes[0]?.kind).toBe('combat')
    expect(world.dungeonRun?.index).toBe(0)
    expect(world.dungeonRun?.evacuated).toBe(false)
    expect(distanceXZ(hunter.position, origin)).toBeGreaterThan(1)
    expect(world.enemies.length).toBeGreaterThan(enemiesBefore)
  })

  it('allows chooseDungeonPick after the current room enemies are gone', () => {
    const world = createInitialWorld()
    world.worldSeed = '724'
    const hunter = findSurvivor(world, 'hunter')
    const bag = hunter ? world.inventories[hunter.inventoryId] : undefined
    if (!hunter || !bag) throw new Error('missing hunter')

    enterDungeon(world, hunter)
    expect(world.dungeonRun).toBeTruthy()
    world.enemies = []
    stepWorld(world, 1 / 30)

    const picks = world.dungeonRun?.picks ?? rollRoomPicks(`${world.worldSeed}:${world.time.dayIndex}:picks:0`)
    expect(picks).toHaveLength(3)
    expect(new Set(picks).size).toBe(3)
    if (world.dungeonRun) world.dungeonRun.picks = picks

    const ammoBefore = countItem(bag, 'ammo')
    const bandageBefore = countItem(bag, 'bandage')
    const slotsBefore = bag.items.reduce((sum, item) => sum + item.count, 0)
    const pick = picks[0]
    if (!pick) throw new Error('missing pick')
    expect(chooseDungeonPick(world, hunter, pick)).toBe(true)

    if (pick === 'ammo') expect(countItem(bag, 'ammo')).toBeGreaterThan(ammoBefore)
    if (pick === 'bandage') expect(countItem(bag, 'bandage')).toBeGreaterThan(bandageBefore)
    if (pick === 'gear_chest') expect(bag.items.reduce((sum, item) => sum + item.count, 0)).toBeGreaterThan(slotsBefore)
  })

  it('clears a room on the sim step and can advance to the next', () => {
    const world = createInitialWorld()
    world.worldSeed = '724'
    const hunter = findSurvivor(world, 'hunter')
    if (!hunter) throw new Error('missing hunter')
    enterDungeon(world, hunter)
    world.enemies = []
    stepWorld(world, 1 / 30)
    expect(world.dungeonRun?.roomCleared).toBe(true)
    expect(world.dungeonRun?.picks).toHaveLength(3)
    expect(advanceDungeon(world, hunter)).toBe(true)
    const run = world.dungeonRun
    if (!run) throw new Error('missing run')
    hunter.position = dungeonRoomCenter(run, 1)
    stepWorld(world, 1 / 30)
    expect(world.dungeonRun?.index).toBe(1)
  })

  it('lets a shrine add a combat affix to the equipped gear gun', () => {
    const world = createInitialWorld()
    world.worldSeed = '724'
    const hunter = findSurvivor(world, 'hunter')
    if (!hunter) throw new Error('missing hunter')
    const piece = rollGear(world, 'shrine-gun', 0.2, 'weapon')
    piece.affixes = []
    hunter.equipment.weapon = piece.id
    enterDungeon(world, hunter)
    world.enemies = []
    if (!world.dungeonRun) throw new Error('missing run')
    world.dungeonRun.roomCleared = true
    world.dungeonRun.picks = ['shrine', 'ammo', 'bandage']
    expect(chooseDungeonPick(world, hunter, 'shrine')).toBe(true)
    expect(piece.affixes.some((affix) => isCombatAffix(affix.id))).toBe(true)
  })

  it('evacuateDungeon returns the survivor to the cave entrance', () => {
    const world = createInitialWorld()
    world.worldSeed = '724'
    const hunter = findSurvivor(world, 'hunter')
    if (!hunter) throw new Error('missing hunter')
    const ruin = world.nodes.find((node) => node.id === 'node-ruin')?.position ?? { x: 40, y: 0, z: 55 }

    enterDungeon(world, hunter)
    const entrance = dungeonEntrancePos()
    hunter.position = { x: entrance.x + 80, y: 0, z: entrance.z + 80 }
    world.enemies.push(createEnemy('wanderer', { x: hunter.position.x, y: 0, z: hunter.position.z + 4 }, 'dungeon-straggler'))

    evacuateDungeon(world, hunter)

    expect(isInDungeon(world)).toBe(false)
    expect(world.dungeonRun?.evacuated).toBe(true)
    expect(distanceXZ(hunter.position, entrance)).toBeLessThan(12)
    expect(distanceXZ(hunter.position, ruin)).toBeLessThan(24)
  })

  it('does not teleport out when dusk arrives inside the dungeon', () => {
    const world = createInitialWorld()
    const hunter = findSurvivor(world, 'hunter')
    if (!hunter) throw new Error('missing hunter')
    enterDungeon(world, hunter)
    const inside = { ...hunter.position }
    world.time.daySeconds = 60 + 11 * 60 + 10
    world.time.phase = 'dusk'
    stepWorld(world, 1 / 30)
    expect(isInDungeon(world)).toBe(true)
    expect(distanceXZ(hunter.position, inside)).toBeLessThan(1)
    const html = renderHudHtml(buildHudModel(world))
    expect(html).toContain('天黑了，赶紧撤离')
  })

  it('shows room count and pick buttons on the HUD', () => {
    const world = createInitialWorld()
    const hunter = findSurvivor(world, 'hunter')
    if (!hunter) throw new Error('missing hunter')
    enterDungeon(world, hunter)
    world.enemies = []
    stepWorld(world, 1 / 30)
    const html = renderHudHtml(buildHudModel(world))
    expect(html).toContain('房间 1/')
    expect(html).toContain('data-dungeon-pick')
    expect(html).toContain('撤离')
    expect(html).toContain('保存')
    expect(html).toContain('读取')
  })

  it('marks a raid empty until a shrine or chest gun comes home', () => {
    const world = createInitialWorld()
    const hunter = findSurvivor(world, 'hunter')
    if (!hunter) throw new Error('missing hunter')
    expect(world.raidEntered).toBe(false)
    enterDungeon(world, hunter)
    expect(world.raidEntered).toBe(true)
    evacuateDungeon(world, hunter)
    expect(world.raidBestRarity).toBeNull()
    const html = renderHudHtml(buildHudModel({ ...world, time: { ...world.time, phase: 'night' } }))
    expect(html).toContain('空手回营')
  })

  it('lets a shrine bless the starter pistol into a magic drop', () => {
    const world = createInitialWorld()
    const hunter = findSurvivor(world, 'hunter')
    if (!hunter) throw new Error('missing hunter')
    hunter.equipment.weapon = 'pistol'
    enterDungeon(world, hunter)
    const run = world.dungeonRun
    if (!run) throw new Error('missing run')
    run.roomCleared = true
    run.picks = ['shrine', 'ammo', 'bandage']
    expect(chooseDungeonPick(world, hunter, 'shrine')).toBe(true)
    expect(hunter.equipment.weapon?.startsWith('g-')).toBe(true)
    const blessed = world.gear[hunter.equipment.weapon ?? '']
    expect(blessed?.affixes.some((affix) => isCombatAffix(affix.id))).toBe(true)
  })
})

describe('limited ammo', () => {
  it('keeps INFINITE_AMMO off so guns spend magazine rounds', () => {
    expect(INFINITE_AMMO).toBe(false)

    const world = createInitialWorld()
    world.debugInfiniteAmmo = false
    const hunter = findSurvivor(world, 'hunter')
    if (!hunter) throw new Error('missing hunter')
    hunter.equipment.weapon = 'rifle'
    hunter.carriedTools = ['rifle']
    hunter.ammo = 5
    hunter.weaponAmmo = { rifle: 5 }
    hunter.fireCooldown = 0
    expect(tryShoot(world, hunter)).toBe(true)
    expect(hunter.ammo).toBe(4)

    hunter.ammo = 0
    hunter.weaponAmmo.rifle = 0
    hunter.fireCooldown = 0
    expect(tryShoot(world, hunter)).toBe(false)

    world.debugInfiniteAmmo = true
    hunter.fireCooldown = 0
    expect(tryShoot(world, hunter)).toBe(true)
    expect(hunter.ammo).toBe(0)
  })
})
