import { describe, expect, it } from 'vitest'
import { applyRosterStrategy, assignPost, postLabel } from '@/jobs/Roster'
import { planJobs } from '@/jobs/JobPlanner'
import { createInitialWorld } from '@/simulation/WorldState'
import { stepWorld } from '@/simulation/SimStep'

describe('base roster', () => {
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
    expect(world.survivors.filter((survivor) => survivor.dayAssignment === 'hunt').length).toBeGreaterThan(1)
    applyRosterStrategy(world, 'balanced')
    expect(world.survivors.find((survivor) => survivor.id === 'hunter')?.dayAssignment).toBe('hunt')
    expect(world.survivors.find((survivor) => survivor.id === 'hauler')?.dayAssignment).toBe('haul')
    expect(world.rosterStrategy).toBe('balanced')
  })

  it('idles everyone when the rest strategy is used', () => {
    const world = createInitialWorld()
    applyRosterStrategy(world, 'rest')
    planJobs(world)
    expect(world.survivors.every((survivor) => survivor.dayAssignment === null)).toBe(true)
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
