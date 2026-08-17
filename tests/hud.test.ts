import { describe, expect, it } from 'vitest'
import { stepWorld } from '@/simulation/SimStep'
import { createInitialWorld } from '@/simulation/WorldState'
import { buildHudModel, renderHudHtml } from '@/ui/GameHud'

describe('game hud', () => {
  it('lists every survivor with name, health, hunger, and thirst', () => {
    const world = createInitialWorld()
    const model = buildHudModel(world, '点头像选人')
    expect(model.cards).toHaveLength(world.survivors.length)
    expect(model.cards.map((card) => card.name)).toContain('林深')
    for (const card of model.cards) {
      expect(card.bars.map((bar) => bar.label)).toEqual(['血', '饥', '渴'])
      expect(card.bars.every((bar) => bar.value > 0)).toBe(true)
    }

    const html = renderHudHtml(model)
    expect(html).toContain('林深')
    expect(html).toContain('血')
    expect(html).toContain('饥')
    expect(html).toContain('渴')
    expect(html).toContain('第 1 天')
    expect(html).not.toContain('AcquireEquipment')
    expect(html).not.toContain('Warehouse')
  })

  it('drains hunger and thirst while a survivor is working', () => {
    const world = createInitialWorld()
    const hunter = world.survivors.find((entry) => entry.id === 'hunter')
    if (!hunter) throw new Error('missing hunter')
    const hunger = hunter.hunger
    const thirst = hunter.thirst
    hunter.workerState = 'Work'
    for (let i = 0; i < 30 * 20; i += 1) stepWorld(world, 1 / 30)
    expect(hunter.hunger).toBeLessThan(hunger)
    expect(hunter.thirst).toBeLessThan(thirst)
    expect(hunter.hunger).toBeGreaterThan(40)
  })
})
