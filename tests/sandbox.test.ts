import { describe, expect, it } from 'vitest'
import {
  breachSector,
  clearHorde,
  defaultSandboxDraft,
  jumpToNight,
  repairFortifications,
  sandboxSnapshot,
  skipToAftermath,
  spawnAnotherWave,
  weakenFortifications,
} from '@/combat/Sandbox'
import { countItem } from '@/inventory/Inventory'
import { createInitialWorld } from '@/simulation/WorldState'

describe('defense sandbox', () => {
  it('jumps to night and spawns the drafted horde from the north', () => {
    const world = createInitialWorld()
    jumpToNight(world, { wanderers: 8, runners: 3, approach: 'north', dayIndex: 2 })
    expect(world.time.phase).toBe('night')
    expect(world.enemies).toHaveLength(11)
    expect(world.nightSpawned).toBe(11)
    expect(world.enemies.every((enemy) => enemy.position.z > 50)).toBe(true)
    expect(world.survivors.filter((survivor) => survivor.dayAssignment === 'watch').length).toBeGreaterThanOrEqual(4)
  })

  it('can stack a second wave without wiping the first', () => {
    const world = createInitialWorld()
    const draft = { wanderers: 4, runners: 1, approach: 'east' as const, dayIndex: 1 }
    jumpToNight(world, draft)
    spawnAnotherWave(world, draft)
    expect(world.enemies).toHaveLength(10)
    expect(world.nightSpawned).toBe(10)
    expect(world.enemies.every((enemy) => enemy.position.x > 50)).toBe(true)
  })

  it('repairs, weakens, and breaches perimeter walls', () => {
    const world = createInitialWorld()
    const before = sandboxSnapshot(world).walls
    expect(weakenFortifications(world)).toBeGreaterThan(10)
    expect(sandboxSnapshot(world).wallHp).toBe(40)
    expect(repairFortifications(world)).toBeGreaterThan(10)
    expect(sandboxSnapshot(world).wallHp).toBe(100)
    expect(breachSector(world, 'north')).toBe(true)
    expect(sandboxSnapshot(world).walls).toBeLessThan(before)
  })

  it('clears the horde and settles a sandbox night into salvage', () => {
    const world = createInitialWorld()
    const warehouse = world.inventories['inv-warehouse']
    if (!warehouse) throw new Error('missing warehouse')
    const wood = countItem(warehouse, 'wood')
    jumpToNight(world, defaultSandboxDraft(1))
    world.nightKills = 9
    clearHorde(world)
    expect(world.enemies).toHaveLength(0)
    skipToAftermath(world)
    expect(world.time.phase).toBe('aftermath')
    expect(world.nightReport?.outcome).toBe('won')
    expect(countItem(warehouse, 'wood')).toBeGreaterThan(wood)
    skipToAftermath(world)
    expect(countItem(warehouse, 'wood')).toBe(wood + 6 + 9)
  })
})
