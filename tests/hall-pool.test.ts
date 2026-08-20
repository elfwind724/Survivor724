import { describe, expect, it } from 'vitest'
import { finishUpgrade } from '@/base/upgrade'
import { unlockedAffixIds, unlockedProcIds, noteGear } from '@/data/hallPool'
import { giveGear, rollGear } from '@/data/loot'
import { createInitialWorld } from '@/simulation/WorldState'
import { inspectSheetHtml } from '@/ui/CharacterSheet'

describe('hall affix pool and codex', () => {
  it('keeps hall 1 drops to min and max damage with no procs', () => {
    const world = createInitialWorld()
    expect(unlockedAffixIds(1)).toEqual(['min_dmg', 'max_dmg'])
    expect(unlockedProcIds(1)).toEqual([])
    const piece = rollGear(world, 'hall1-magic-seed', 0, 'weapon')
    expect(piece.affixes.every((affix) => affix.id === 'min_dmg' || affix.id === 'max_dmg')).toBe(true)
    expect(piece.procs).toEqual([])
  })

  it('unlocks crit and attack speed when the hall is level 2', () => {
    const world = createInitialWorld()
    const hall = world.structures.find((entry) => entry.definitionId === 'hall')
    if (!hall) throw new Error('missing hall')
    hall.level = 1
    finishUpgrade(world, hall)
    expect(hall.level).toBe(2)
    expect(unlockedAffixIds(2)).toEqual(expect.arrayContaining(['min_dmg', 'max_dmg', 'aspd', 'crit']))
    expect(unlockedProcIds(2)).toEqual([])
  })

  it('records obtained guns into the codex and shows them in the sheet', () => {
    const world = createInitialWorld()
    const hunter = world.survivors.find((entry) => entry.id === 'hunter')
    if (!hunter) throw new Error('missing hunter')
    const hall = world.structures.find((entry) => entry.definitionId === 'hall')
    if (hall) hall.level = 5
    const piece = rollGear(world, 'codex-gun-seed', 0.95, 'weapon')
    piece.affixes = [{ id: 'aspd', label: '攻速', value: 10 }]
    piece.procs = ['burn']
    giveGear(world, piece, hunter.inventoryId)
    noteGear(world, piece)
    expect(world.codex.bases).toContain(piece.baseId)
    expect(world.codex.affixes).toContain('aspd')
    expect(world.codex.procs).toContain('burn')
    const html = inspectSheetHtml(world, 'hunter', 'codex')
    expect(html).toContain('图鉴')
    expect(html).toContain('市政大厅 5 级')
    expect(html).toContain('攻速')
    expect(html).toContain('已见')
    expect(html).toContain('词条池全开')
    const locked = inspectSheetHtml(createInitialWorld(), 'hunter', 'codex')
    expect(locked).toContain('大厅2级')
    expect(locked).toContain('可掉落')
  })

  it('does not roll legendary procs until the hall is high enough', () => {
    const world = createInitialWorld()
    const low = rollGear(world, 'force-legend-seed-zzz', 0.9, 'weapon')
    if (low.rarity === 'legendary') expect(low.procs).toEqual([])
    const hall = world.structures.find((entry) => entry.definitionId === 'hall')
    if (hall) hall.level = 5
    const high = rollGear(world, 'force-legend-seed-zzz', 0.9, 'weapon')
    if (high.rarity === 'legendary') expect(high.procs.length).toBeGreaterThan(0)
  })
})
