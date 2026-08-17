import { applyRosterStrategy, assignmentLabel, assignPost, assignWatch, postLabel, ROSTER_POSTS, ROSTER_STRATEGIES, WATCH_CORNERS, type RosterPostId, type RosterStrategyId } from '@/jobs/Roster'
import type { WorldState } from '@/simulation/types'

export class RosterPanel {
  private open = false
  private lastKey = ''

  constructor(
    private readonly root: HTMLElement,
    private readonly onChange: (notice: string) => void,
  ) {
    this.root.classList.add('roster-root')
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
    const key = `${this.open}:${world.rosterStrategy}:${world.survivors.map((survivor) => `${survivor.id}:${survivor.dayAssignment}:${survivor.watchPostId}:${survivor.workerState}`).join('|')}`
    if (key === this.lastKey) return
    this.lastKey = key
    this.root.innerHTML = this.open ? this.panelHtml(world) : this.toggleHtml()
    this.bind(world)
  }

  private toggleHtml(): string {
    return `<button type="button" class="roster-toggle${this.open ? ' is-open' : ''}" data-action="toggle">岗位</button>`
  }

  private panelHtml(world: WorldState): string {
    const people = world.survivors.map((survivor) => {
      const posts = ROSTER_POSTS.map((post) => {
        const on = (survivor.dayAssignment ?? 'idle') === post.id ? ' is-on' : ''
        return `<button type="button" class="roster-post${on}" data-person="${survivor.id}" data-post="${post.id}">${post.label}</button>`
      }).join('')
      const corners = survivor.dayAssignment === 'watch'
        ? `<div class="roster-corners">${WATCH_CORNERS.map((corner) => {
          const on = survivor.watchPostId === corner.id ? ' is-on' : ''
          return `<button type="button" class="roster-post roster-corner${on}" data-person="${survivor.id}" data-tower="${corner.id}">${corner.label}</button>`
        }).join('')}</div>`
        : ''
      return `<div class="roster-person">
        <header><strong>${escapeHtml(survivor.name)}</strong><span>${assignmentLabel(survivor)}</span></header>
        <div class="roster-posts">${posts}</div>
        ${corners}
      </div>`
    }).join('')
    const strategies = ROSTER_STRATEGIES.map((strategy) => {
      const on = world.rosterStrategy === strategy.id ? ' is-on' : ''
      return `<button type="button" class="roster-strategy${on}" data-strategy="${strategy.id}">
        <strong>${strategy.label}</strong>
        <span>${strategy.hint}</span>
      </button>`
    }).join('')
    return `${this.toggleHtml()}
      <div class="roster-panel is-open">
        <div class="roster-col">
          <p>点人名下的岗位手动指派</p>
          ${people}
        </div>
        <div class="roster-col">
          <p>按策略一键上岗</p>
          ${strategies}
        </div>
      </div>`
  }

  private bind(world: WorldState): void {
    this.bindToggle()
    this.root.querySelectorAll<HTMLButtonElement>('[data-post]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.person
        const post = button.dataset.post as RosterPostId | undefined
        if (!id || !post) return
        if (assignPost(world, id, post)) {
          const name = world.survivors.find((entry) => entry.id === id)?.name ?? id
          this.onChange(`${name} 改去${postLabel(post)}`)
          this.lastKey = ''
          this.render(world)
        }
      })
    })
    this.root.querySelectorAll<HTMLButtonElement>('[data-tower]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.person
        const tower = button.dataset.tower
        if (!id || !tower) return
        if (assignWatch(world, tower, id)) {
          const name = world.survivors.find((entry) => entry.id === id)?.name ?? id
          this.onChange(`${name} 去${WATCH_CORNERS.find((corner) => corner.id === tower)?.label ?? ''}塔`)
          this.lastKey = ''
          this.render(world)
        }
      })
    })
    this.root.querySelectorAll<HTMLButtonElement>('[data-strategy]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.strategy as RosterStrategyId | undefined
        if (!id) return
        applyRosterStrategy(world, id)
        const label = ROSTER_STRATEGIES.find((entry) => entry.id === id)?.label ?? id
        this.onChange(`已按「${label}」安排上岗`)
        this.lastKey = ''
        this.render(world)
      })
    })
  }

  private bindToggle(): void {
    this.root.querySelector('[data-action="toggle"]')?.addEventListener('click', () => {
      this.toggle()
      this.lastKey = ''
    })
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    if (char === '&') return '&amp;'
    if (char === '<') return '&lt;'
    if (char === '>') return '&gt;'
    if (char === '"') return '&quot;'
    return '&#39;'
  })
}
