import { FACILITY_DEFINITIONS } from '@/data/facilities'

export type BuildSelection = string | 'demolish' | null

export class BuildMenu {
  private open = false
  private selected: BuildSelection = null
  private readonly onChange: (selected: BuildSelection) => void

  constructor(
    private readonly root: HTMLElement,
    onChange: (selected: BuildSelection) => void,
  ) {
    this.onChange = onChange
    this.root.addEventListener('pointerdown', (event) => event.stopPropagation())
    this.render()
  }

  getSelected(): BuildSelection {
    return this.selected
  }

  isOpen(): boolean {
    return this.open
  }

  toggle(): void {
    this.open = !this.open
    this.render()
  }

  close(): void {
    this.open = false
    this.render()
  }

  clear(): void {
    this.selected = null
    this.render()
    this.onChange(null)
  }

  select(id: BuildSelection): void {
    this.selected = this.selected === id ? null : id
    if (this.selected) this.open = true
    this.render()
    this.onChange(this.selected)
  }

  private render(): void {
    const items = FACILITY_DEFINITIONS.map((facility) => {
      const cost = facility.required.map((item) => `${item.count}${itemLabel(item.itemId)}`).join(' ')
      const active = this.selected === facility.id ? ' is-active' : ''
      return `<button type="button" class="build-card${active}" data-id="${facility.id}">
        <strong>${facility.label}</strong>
        <span>${facility.width}×${facility.depth}</span>
        <span>${cost}</span>
      </button>`
    }).join('')

    this.root.innerHTML = `
      <button type="button" class="build-toggle${this.open ? ' is-open' : ''}" data-action="toggle">建造</button>
      <div class="build-panel${this.open ? ' is-open' : ''}">
        ${items}
        <button type="button" class="build-card build-card-danger${this.selected === 'demolish' ? ' is-active' : ''}" data-id="demolish">
          <strong>拆除</strong>
          <span>点选建筑</span>
          <span>材料退回仓库</span>
        </button>
      </div>
    `

    this.root.querySelector('[data-action="toggle"]')?.addEventListener('click', () => this.toggle())
    this.root.querySelectorAll<HTMLButtonElement>('[data-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.id
        if (id === 'demolish') this.select('demolish')
        else if (id) this.select(id)
      })
    })
  }
}

function itemLabel(id: string): string {
  if (id === 'wood') return '木'
  if (id === 'scrap') return '废铁'
  return id
}
