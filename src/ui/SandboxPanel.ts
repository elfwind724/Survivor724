import {
  SANDBOX_PRESETS,
  approachLabel,
  breachSector,
  clearHorde,
  defaultSandboxDraft,
  jumpToNight,
  repairFortifications,
  restockSandboxAmmo,
  restoreSurvivors,
  sandboxSnapshot,
  setSandboxPaused,
  setSandboxTimeScale,
  skipToAftermath,
  spawnAnotherWave,
  weakenFortifications,
  type SandboxDraft,
} from '@/combat/Sandbox'
import { hordeCounts } from '@/data/enemies'
import { applyRosterStrategy } from '@/jobs/Roster'
import type { DefenseSectorId, WorldState } from '@/simulation/types'

export class SandboxPanel {
  private open = false
  private lastKey = ''
  private draft: SandboxDraft = defaultSandboxDraft(1)

  constructor(
    private readonly root: HTMLElement,
    private readonly onChange: (notice: string) => void,
  ) {
    this.root.classList.add('sandbox-root')
    this.root.addEventListener('pointerdown', (event) => event.stopPropagation())
  }

  isOpen(): boolean {
    return this.open
  }

  toggle(): void {
    this.open = !this.open
    this.lastKey = ''
  }

  close(): void {
    this.open = false
    this.lastKey = ''
    this.root.innerHTML = this.toggleHtml()
    this.bindToggle()
  }

  render(world: WorldState): void {
    const snap = sandboxSnapshot(world)
    const key = `${this.open}:${snap.phase}:${snap.enemies}:${snap.kills}:${snap.wallHp}:${snap.paused}:${world.time.timeScale}:${world.debugInfiniteAmmo ? 1 : 0}:${this.draft.wanderers}:${this.draft.runners}:${this.draft.approach}:${this.draft.dayIndex}`
    if (key === this.lastKey) return
    this.lastKey = key
    this.root.innerHTML = this.open ? this.panelHtml(world) : this.toggleHtml()
    this.bind(world)
  }

  private toggleHtml(): string {
    return `<button type="button" class="sandbox-toggle${this.open ? ' is-open' : ''}" data-action="toggle">沙盘</button>`
  }

  private panelHtml(world: WorldState): string {
    const snap = sandboxSnapshot(world)
    const approaches: Array<SandboxDraft['approach']> = ['all', 'north', 'east', 'south', 'west']
    const approachButtons = approaches
      .map((id) => {
        const on = this.draft.approach === id ? ' is-on' : ''
        return `<button type="button" class="sandbox-chip${on}" data-approach="${id}">${approachLabel(id)}</button>`
      })
      .join('')
    const presets = SANDBOX_PRESETS.map(
      (preset) => `<button type="button" class="sandbox-preset" data-preset="${preset.id}">
        <strong>${preset.label}</strong><span>${preset.hint}</span>
      </button>`,
    ).join('')
    return `${this.toggleHtml()}
      <div class="sandbox-panel is-open">
        <p>改条件，立刻开打。尸潮、缺口、时间都可以推演。</p>
        <div class="sandbox-live">现场 ${snap.enemies} 只 · 击杀 ${snap.kills}/${snap.spawned} · 墙 ${snap.wallHp}% · 倒地 ${snap.downed}${snap.paused ? ' · 已暂停' : ''}</div>
        <div class="sandbox-row">
          <label>第 <input type="number" min="1" max="30" value="${this.draft.dayIndex}" data-field="dayIndex"> 夜</label>
          <label>游荡 <input type="number" min="0" max="80" value="${this.draft.wanderers}" data-field="wanderers"></label>
          <label>奔袭 <input type="number" min="0" max="40" value="${this.draft.runners}" data-field="runners"></label>
        </div>
        <div class="sandbox-row">${approachButtons}</div>
        <div class="sandbox-grid">${presets}</div>
        <div class="sandbox-row">
          <button type="button" data-act="night">开打这一夜</button>
          <button type="button" data-act="wave">再来一波</button>
          <button type="button" data-act="clear">清空尸潮</button>
          <button type="button" data-act="end">跳到清场</button>
        </div>
        <div class="sandbox-row">
          <button type="button" data-act="pause">${world.paused ? '继续' : '暂停'}</button>
          <button type="button" data-scale="1">1×</button>
          <button type="button" data-scale="2">2×</button>
          <button type="button" data-scale="4">4×</button>
        </div>
        <div class="sandbox-row">
          <button type="button" data-act="watch">全员上塔</button>
          <button type="button" data-act="heal">全员满血</button>
          <button type="button" data-act="ammo">补弹药</button>
          <button type="button" data-act="infinite">${world.debugInfiniteAmmo ? '关闭无限弹药' : '无限弹药'}</button>
          <button type="button" data-act="repair">修好围墙</button>
        </div>
        <div class="sandbox-row">
          <button type="button" data-act="weaken">墙剩四成</button>
          <button type="button" data-breach="north">砸开北墙</button>
          <button type="button" data-breach="east">砸开东墙</button>
          <button type="button" data-breach="south">砸开南墙</button>
          <button type="button" data-breach="west">砸开西墙</button>
        </div>
      </div>`
  }

  private bind(world: WorldState): void {
    this.bindToggle()
    this.root.querySelectorAll<HTMLInputElement>('[data-field]').forEach((input) => {
      input.addEventListener('change', () => {
        const field = input.dataset.field
        const value = Math.max(0, Math.floor(Number(input.value) || 0))
        if (field === 'dayIndex') {
          this.draft.dayIndex = Math.max(1, value)
          const counts = hordeCounts(this.draft.dayIndex)
          this.draft.wanderers = counts.wanderers
          this.draft.runners = counts.runners
        }
        if (field === 'wanderers') this.draft.wanderers = value
        if (field === 'runners') this.draft.runners = value
        this.lastKey = ''
        this.render(world)
      })
    })
    this.root.querySelectorAll<HTMLButtonElement>('[data-approach]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.approach
        if (id === 'all' || id === 'north' || id === 'east' || id === 'south' || id === 'west') {
          this.draft.approach = id
          this.lastKey = ''
          this.render(world)
        }
      })
    })
    this.root.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((button) => {
      button.addEventListener('click', () => {
        const preset = SANDBOX_PRESETS.find((entry) => entry.id === button.dataset.preset)
        if (!preset) return
        this.draft.wanderers = preset.wanderers
        this.draft.runners = preset.runners
        this.draft.approach = preset.approach
        if (preset.weaken) weakenFortifications(world)
        jumpToNight(world, this.draft)
        this.onChange(`${preset.label}：${preset.hint}`)
        this.lastKey = ''
        this.render(world)
      })
    })
    this.root.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((button) => {
      button.addEventListener('click', () => this.runAct(world, button.dataset.act ?? ''))
    })
    this.root.querySelectorAll<HTMLButtonElement>('[data-scale]').forEach((button) => {
      button.addEventListener('click', () => {
        const scale = Number(button.dataset.scale)
        setSandboxTimeScale(world, scale)
        this.onChange(`沙盘时间 ${scale}×`)
        this.lastKey = ''
        this.render(world)
      })
    })
    this.root.querySelectorAll<HTMLButtonElement>('[data-breach]').forEach((button) => {
      button.addEventListener('click', () => {
        const sector = button.dataset.breach as DefenseSectorId | undefined
        if (!sector) return
        const ok = breachSector(world, sector)
        this.onChange(ok ? `已砸开${sector}一侧的墙，尸潮会从缺口进来` : '这一侧没有完整的墙')
        this.lastKey = ''
        this.render(world)
      })
    })
  }

  private runAct(world: WorldState, act: string): void {
    if (act === 'night') {
      jumpToNight(world, this.draft)
      this.onChange(`沙盘开打：${this.draft.wanderers}游荡 + ${this.draft.runners}奔袭，从${approachLabel(this.draft.approach)}压过来`)
    }
    if (act === 'wave') {
      spawnAnotherWave(world, this.draft)
      this.onChange('又压过来一波')
    }
    if (act === 'clear') {
      clearHorde(world)
      this.onChange('尸潮已清空')
    }
    if (act === 'end') {
      skipToAftermath(world)
      this.onChange('已跳到清场结算')
    }
    if (act === 'pause') {
      setSandboxPaused(world, !world.paused)
      this.onChange(world.paused ? '沙盘已暂停' : '沙盘继续')
    }
    if (act === 'watch') {
      applyRosterStrategy(world, 'watch')
      this.onChange('全员上塔站岗')
    }
    if (act === 'heal') {
      restoreSurvivors(world)
      this.onChange('全员满血，倒地的人也起来了')
    }
    if (act === 'ammo') {
      restockSandboxAmmo(world)
      this.onChange('仓库和弹匣都补过了')
    }
    if (act === 'infinite') {
      world.debugInfiniteAmmo = world.debugInfiniteAmmo !== true
      this.onChange(world.debugInfiniteAmmo ? '已开启无限弹药' : '已关闭无限弹药')
    }
    if (act === 'repair') {
      const count = repairFortifications(world)
      this.onChange(count > 0 ? `修好了 ${count} 段墙门` : '墙门本来就是满的')
    }
    if (act === 'weaken') {
      weakenFortifications(world)
      this.onChange('围墙只剩四成耐久')
    }
    this.lastKey = ''
    this.render(world)
  }

  private bindToggle(): void {
    this.root.querySelector('[data-action="toggle"]')?.addEventListener('click', () => this.toggle())
  }
}
