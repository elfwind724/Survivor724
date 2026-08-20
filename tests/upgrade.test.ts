import { describe, expect, it } from 'vitest'
import { buildQueue } from '@/base/BuildQueue'
import { canUpgrade, facilityCap, finishUpgrade, hallLevel, markUpgrade, upgradeCost } from '@/base/upgrade'
import { countItem } from '@/inventory/Inventory'
import { assignPost } from '@/jobs/Roster'
import { planJobs } from '@/jobs/JobPlanner'
import { stepWorld } from '@/simulation/SimStep'
import { createInitialWorld } from '@/simulation/WorldState'
import { buildHudModel, renderHudHtml } from '@/ui/GameHud'

describe('hall and facility upgrades', () => {
  it('locks other buildings to the hall level', () => {
    const world = createInitialWorld()
    const hall = world.structures.find((entry) => entry.definitionId === 'hall')
    const kitchen = world.structures.find((entry) => entry.definitionId === 'kitchen')
    if (!hall || !kitchen) throw new Error('missing hall')
    expect(hallLevel(world)).toBe(1)
    expect(canUpgrade(world, kitchen)).toBe(false)
    expect(canUpgrade(world, hall)).toBe(true)
    expect(upgradeCost(hall)[0]?.count).toBeGreaterThan(20)
    expect(markUpgrade(world, hall)).toBe(true)
    expect(hall.upgrading).toBe(true)
  })

  it('lets a builder spend warehouse stock to raise the hall, then unlock kitchen upgrades', () => {
    const world = createInitialWorld()
    const hall = world.structures.find((entry) => entry.definitionId === 'hall')
    const kitchen = world.structures.find((entry) => entry.definitionId === 'kitchen')
    const warehouse = world.inventories['inv-warehouse']
    if (!hall || !kitchen || !warehouse) throw new Error('missing hall')
    warehouse.items.push({ itemId: 'scrap', count: 20 })
    expect(markUpgrade(world, hall)).toBe(true)
    expect(assignPost(world, 'builder', 'upgrade')).toBe(true)
    planJobs(world)
    const wood = countItem(warehouse, 'wood')
    for (let i = 0; i < 30 * 40; i += 1) stepWorld(world, 1 / 30)
    expect(hall.level).toBe(2)
    expect(hall.upgrading).toBe(false)
    expect(facilityCap(world)).toBe(2)
    expect(canUpgrade(world, kitchen)).toBe(true)
    expect(countItem(warehouse, 'wood')).toBeLessThan(wood)
    finishUpgrade(world, kitchen)
    expect(kitchen.level).toBe(2)
  })

  it('pulls the default builder onto the hall so upgrade is not stuck at 0%', () => {
    const world = createInitialWorld()
    const hall = world.structures.find((entry) => entry.definitionId === 'hall')
    const builder = world.survivors.find((entry) => entry.id === 'builder')
    const warehouse = world.inventories['inv-warehouse']
    if (!hall || !builder || !warehouse) throw new Error('missing hall')
    warehouse.items.push({ itemId: 'scrap', count: 20 })
    expect(markUpgrade(world, hall)).toBe(true)
    expect(builder.currentJobId).toContain('upgrade')
    const queued = buildQueue(world).find((row) => row.action === '升级')
    expect(queued?.name).toMatch(/市政大厅/)
    expect(queued?.detail).toMatch(/木石/)
    const html = renderHudHtml(buildHudModel(world))
    expect(html).toContain('施工队列')
    expect(html).toContain('市政大厅')
    for (let i = 0; i < 30 * 55; i += 1) stepWorld(world, 1 / 30)
    expect(hall.upgrading).toBe(false)
    expect(hall.level).toBe(2)
  })

  it('says the hall is waiting on missing scrap instead of pretending to build', () => {
    const world = createInitialWorld()
    const hall = world.structures.find((entry) => entry.definitionId === 'hall')
    const warehouse = world.inventories['inv-warehouse']
    if (!hall || !warehouse) throw new Error('missing hall')
    warehouse.items = warehouse.items.filter((item) => item.itemId !== 'scrap')
    expect(markUpgrade(world, hall)).toBe(true)
    const queued = buildQueue(world).find((row) => row.action === '升级')
    expect(queued?.stuck).toBe(true)
    expect(queued?.detail).toMatch(/缺/)
    expect(queued?.progress).toBe(0)
  })
})
