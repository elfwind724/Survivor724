import { describe, expect, it } from 'vitest'
import { stepWorld } from '@/simulation/SimStep'
import { createInitialWorld } from '@/simulation/WorldState'
import { buildHudModel, renderHudHtml } from '@/ui/GameHud'

describe('game hud', () => {
  it('lists every survivor with name, health, hunger, and thirst', () => {
    const world = createInitialWorld()
    const model = buildHudModel(world, '点头像选人')
    expect(model.cards).toHaveLength(world.survivors.length)
    expect(model.cards.map((card) => card.name)).toContain('冯老师')
    for (const card of model.cards) {
      expect(card.bars.map((bar) => bar.label)).toEqual(['血', '饥', '渴'])
      expect(card.bars.every((bar) => bar.value > 0)).toBe(true)
    }

    const html = renderHudHtml(model)
    expect(html).toContain('冯老师')
    expect(html).toContain('血')
    expect(html).toContain('饥')
    expect(html).toContain('渴')
    expect(html).toContain('第 1 天')
    expect(html).toContain('复位镜头')
    expect(html).toContain('显示整栋')
    expect(html).toContain('C 技能')
    expect(html).toContain('仓库')
    expect(html).toContain('背包')
    expect(html).toContain('熟食')
    expect(html).toContain('水')
    expect(html).not.toContain('AcquireEquipment')
    expect(html).not.toContain('Warehouse')
  })

  it('shows a night report overlay after a defense settles', () => {
    const world = createInitialWorld()
    world.nightReport = {
      day: 1,
      outcome: 'won',
      kills: 12,
      spawned: 26,
      downed: 1,
      wallsLost: 2,
      loot: [{ itemId: 'wood', label: '木', count: 18 }],
      reason: '守住了这一夜，搜到的残骸进了仓库',
    }
    world.time.phase = 'aftermath'
    const html = renderHudHtml(buildHudModel(world))
    expect(html).toContain('防守成功')
    expect(html).toContain('继续建设')
    expect(html).toContain('木+18')

    world.gameOver = true
    world.nightReport = { ...world.nightReport, outcome: 'lost', reason: '仓库被毁，物资散尽', loot: [] }
    const lost = renderHudHtml(buildHudModel(world))
    expect(lost).toContain('防守失败')
    expect(lost).toContain('重新开始')
  })

  it('shows the current gun magazine and a cooldown ring', () => {
    const world = createInitialWorld()
    const hunter = world.survivors.find((entry) => entry.id === 'hunter')
    if (!hunter) throw new Error('missing hunter')
    hunter.equipment.weapon = 'pistol'
    hunter.ammo = 7
    hunter.weaponAmmo = { pistol: 7 }
    hunter.fireCooldown = 0.2
    hunter.fireCooldownMax = 0.4
    world.player.selectedId = 'hunter'
    const model = buildHudModel(world)
    expect(model.weapon?.name).toBe('手枪')
    expect(model.weapon?.ammo).toBe(7)
    expect(model.weapon?.ammoMax).toBe(12)
    expect(model.weapon?.cooldown).toBeCloseTo(0.5, 5)
    const html = renderHudHtml(model)
    expect(html).toContain('∞')
    expect(html).toContain('hud-cd')
    expect(html).toContain('hud-hotbar')
    expect(html).toContain('data-hotbar="pistol"')
    expect(model.hotbar.some((slot) => slot?.itemId === 'pistol' && slot.equipped)).toBe(true)
    expect(model.hotbar.some((slot) => slot?.itemId === 'rifle')).toBe(true)
    expect(model.hotbar[0]?.line).toMatch(/\d+-\d+/)
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
