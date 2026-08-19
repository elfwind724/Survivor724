import { describe, expect, it } from 'vitest'
import { stepFollowHero, toggleFollow } from '@/jobs/Follow'
import { applyRosterStrategy, assignmentLabel, assignPost, commandableSurvivors, postLabel } from '@/jobs/Roster'
import { planJobs } from '@/jobs/JobPlanner'
import { createInitialWorld } from '@/simulation/WorldState'
import { stepWorld } from '@/simulation/SimStep'

describe('base roster', () => {
  it('keeps the hero out of posts and watch towers', () => {
    const world = createInitialWorld()
    expect(assignPost(world, 'hunter', 'watch')).toBe(false)
    expect(world.survivors.find((entry) => entry.id === 'hunter')?.name).toBe('冯老师')
    expect(world.survivors.find((entry) => entry.id === 'hunter')?.dayAssignment).toBe('hunt')
  })

  it('lets a teammate follow the hero', () => {
    const world = createInitialWorld()
    const fisher = world.survivors.find((entry) => entry.id === 'fisher')
    const hero = world.survivors.find((entry) => entry.id === 'hunter')
    if (!fisher || !hero) throw new Error('missing people')
    hero.position = { x: 0, y: 0, z: 0 }
    fisher.position = { x: 8, y: 0, z: 0 }
    fisher.currentJobId = null
    fisher.workerState = 'RestOrNextJob'
    expect(toggleFollow(world, 'fisher')).toBe('follow')
    expect(assignPost(world, 'hunter', 'follow')).toBe(false)
    stepFollowHero(world, fisher, 1 / 30)
    expect(fisher.blockedReason).not.toBe('route_blocked')
    expect(Boolean(fisher.destination) || fisher.path.length > 0).toBe(true)
    for (let i = 0; i < 180; i += 1) stepFollowHero(world, fisher, 1 / 30)
    expect(Math.hypot(fisher.position.x - hero.position.x, fisher.position.z - hero.position.z)).toBeLessThan(4)
  })

  it('lets the player send one survivor to a new post', () => {
    const world = createInitialWorld()
    expect(assignPost(world, 'builder', 'cook')).toBe(true)
    const builder = world.survivors.find((entry) => entry.id === 'builder')
    expect(builder?.dayAssignment).toBe('cook')
    expect(postLabel('cook')).toBe('做饭')
    expect(world.rosterStrategy).toBeNull()
  })

  it('applies a food strategy and a one-click balanced reset', () => {
    const world = createInitialWorld()
    applyRosterStrategy(world, 'food')
    expect(world.survivors.some((survivor) => survivor.dayAssignment === 'cook')).toBe(true)
    expect(world.survivors.filter((survivor) => survivor.dayAssignment === 'hunt').length).toBeGreaterThanOrEqual(1)
    applyRosterStrategy(world, 'balanced')
    expect(world.survivors.find((survivor) => survivor.id === 'hunter')?.dayAssignment).toBe('hunt')
    expect(world.survivors.find((survivor) => survivor.id === 'hauler')?.dayAssignment).toBe('haul')
    expect(world.rosterStrategy).toBe('balanced')
  })

  it('idles everyone when the rest strategy is used', () => {
    const world = createInitialWorld()
    applyRosterStrategy(world, 'rest')
    planJobs(world)
    expect(commandableSurvivors(world).every((survivor) => survivor.dayAssignment === null)).toBe(true)
    expect(world.survivors.find((survivor) => survivor.id === 'hunter')?.dayAssignment).toBe('hunt')
  })

  it('posts four people onto the four watchtowers in one click', () => {
    const world = createInitialWorld()
    applyRosterStrategy(world, 'watch')
    const posted = world.survivors.filter((survivor) => survivor.dayAssignment === 'watch')
    expect(posted).toHaveLength(4)
    expect(posted.some((survivor) => survivor.id === 'hunter')).toBe(false)
    expect(new Set(posted.map((survivor) => survivor.watchPostId)).size).toBe(4)
    expect(assignmentLabel(posted[0]!)).toMatch(/^站岗·/)
  })

  it('picks up a cook job after a manual assignment', () => {
    const world = createInitialWorld()
    const warehouse = world.inventories['inv-warehouse']
    if (!warehouse) throw new Error('missing warehouse')
    warehouse.items.push({ itemId: 'raw_meat', count: 3 })
    expect(assignPost(world, 'hauler', 'cook')).toBe(true)
    for (let i = 0; i < 8; i += 1) stepWorld(world, 1 / 30)
    const hauler = world.survivors.find((entry) => entry.id === 'hauler')
    expect(hauler?.currentJobId).toMatch(/cook/)
  })
})
