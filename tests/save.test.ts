import { describe, expect, it } from 'vitest'
import { deserializeWorld, loadFromBrowser, SAVE_KEY, saveToBrowser, serializeWorld } from '@/save/SaveSchema'
import { createInitialWorld } from '@/simulation/WorldState'

describe('save schema', () => {
  it('roundtrips dayIndex and roster size through serializeWorld + deserializeWorld', () => {
    const world = createInitialWorld()
    world.time.dayIndex = 4
    const roster = world.survivors.length
    expect(roster).toBeGreaterThan(0)

    const save = serializeWorld(world)
    expect(save.version).toBeGreaterThan(0)
    expect(save.world.time.dayIndex).toBe(4)
    expect(save.world.survivors).toHaveLength(roster)

    const loaded = deserializeWorld(save)
    expect(loaded.time.dayIndex).toBe(4)
    expect(loaded.survivors).toHaveLength(roster)
    expect(loaded.survivors.map((survivor) => survivor.id)).toEqual(world.survivors.map((survivor) => survivor.id))
    expect(loaded.dayGunshots).toBe(0)
    expect(loaded.dayNoise.east).toBe(0)
  })

  it('fills hunting noise on old saves', () => {
    const world = createInitialWorld()
    const save = serializeWorld(world)
    const raw = save as { world: Partial<typeof world> }
    delete raw.world.dayGunshots
    delete raw.world.dayNoise
    const loaded = deserializeWorld(save)
    expect(loaded.dayGunshots).toBe(0)
    expect(loaded.dayNoise).toEqual({ north: 0, east: 0, west: 0, south: 0 })
  })

  it('fills an empty codex on old saves', () => {
    const world = createInitialWorld()
    const save = serializeWorld(world)
    const raw = save as { world: Partial<typeof world> }
    delete raw.world.codex
    const loaded = deserializeWorld(save)
    expect(loaded.codex.bases).toContain('pistol')
    expect(loaded.codex.affixes).toEqual([])
    expect(loaded.codex.procs).toEqual([])
  })

  it('keeps dayIndex and headcount after a JSON load roundtrip', () => {
    const world = createInitialWorld()
    world.time.dayIndex = 7
    const roster = world.survivors.length
    const loaded = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(world))))
    expect(loaded.time.dayIndex).toBe(7)
    expect(loaded.survivors).toHaveLength(roster)

    loaded.time.dayIndex = 99
    expect(world.time.dayIndex).toBe(7)
  })

  it('writes and reads the dawn-bastion-save browser key', () => {
    const mem = new Map<string, string>()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => mem.get(key) ?? null,
        setItem: (key: string, value: string) => {
          mem.set(key, value)
        },
        removeItem: (key: string) => {
          mem.delete(key)
        },
      },
    })
    const world = createInitialWorld()
    world.time.dayIndex = 3
    expect(saveToBrowser(world)).toBe(true)
    expect(mem.has(SAVE_KEY)).toBe(true)
    const loaded = loadFromBrowser()
    expect(loaded?.time.dayIndex).toBe(3)
    expect(loaded?.survivors).toHaveLength(world.survivors.length)
  })
})
