import { describe, expect, it } from 'vitest'
import { extraYieldCount, skillDamageMult, skillLevel, skillSummary, skillWorkMult, skillYieldChance } from '@/data/skills'
import { createInitialWorld } from '@/simulation/WorldState'
import { grantSkillXp, recordWorkYield } from '@/survivors/Progress'
import { inspectSheetHtml } from '@/ui/CharacterSheet'

describe('profession skills', () => {
  it('seeds hunter and npc skills with profession majors', () => {
    const world = createInitialWorld()
    const hunter = world.survivors.find((entry) => entry.id === 'hunter')
    const fisher = world.survivors.find((entry) => entry.id === 'fisher')
    if (!hunter || !fisher) throw new Error('missing people')
    expect(skillLevel(hunter, 'hunt')).toBe(2)
    expect(skillLevel(hunter, 'marksmanship')).toBe(2)
    expect(skillLevel(fisher, 'fish')).toBe(2)
    expect(skillLevel(fisher, 'hunt')).toBe(1)
    expect(skillSummary(hunter)).toContain('狩猎Lv2')
    expect(skillDamageMult(hunter)).toBeGreaterThan(1)
    expect(skillWorkMult(fisher, 'fish')).toBeGreaterThan(1)
    expect(skillYieldChance(hunter, 'hunt')).toBeCloseTo(0.08, 5)
  })

  it('raises a skill when work yield is recorded', () => {
    const world = createInitialWorld()
    const fisher = world.survivors.find((entry) => entry.id === 'fisher')
    if (!fisher) throw new Error('missing fisher')
    const before = fisher.skills.fish.xp
    recordWorkYield(world, fisher, 'raw_fish', 1, 4, 'fish')
    expect(fisher.skills.fish.xp).toBe(before + 4)
    expect(fisher.xp).toBeGreaterThanOrEqual(4)
    expect(grantSkillXp(fisher, 'fish', 80)).toBe(true)
    expect(skillLevel(fisher, 'fish')).toBeGreaterThan(2)
  })

  it('renders a readable skill panel for player and npc', () => {
    const world = createInitialWorld()
    const player = inspectSheetHtml(world, 'hunter')
    expect(player).toContain('玩家技能')
    expect(player).toContain('狩猎')
    expect(player).toContain('射击')
    expect(player).toContain('Lv2')
    expect(player).toContain('剥皮多肉')
    const npc = inspectSheetHtml(world, 'fisher')
    expect(npc).toContain('NPC技能')
    expect(npc).toContain('钓鱼')
    expect(npc).toContain('厨艺')
  })

  it('does not invent extra yield at skill level 1', () => {
    const world = createInitialWorld()
    const builder = world.survivors.find((entry) => entry.id === 'builder')
    if (!builder) throw new Error('missing builder')
    expect(skillLevel(builder, 'hunt')).toBe(1)
    expect(extraYieldCount(builder, 'hunt', 'seed')).toBe(0)
  })
})
