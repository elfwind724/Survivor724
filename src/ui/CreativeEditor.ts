import { ASSET_INDEX, type AssetCategory, type AssetEntry } from '@/data/assetIndex'
import { CREATIVE_TABS } from '@/data/worldDressing'
import { suggestedScale } from '@/render/ModelFit'
import { ThumbnailCache } from '@/render/ThumbnailCache'

export interface EditorBrush {
  assetId: string
  yaw: number
  scale: number
}

export class CreativeEditor {
  private open = false
  private tab: 'all' | AssetCategory = 'all'
  private query = ''
  private keepSearchFocus = false
  private brush: EditorBrush | null = null
  private hoverName = ''
  private readonly thumbs = new ThumbnailCache()

  constructor(
    private readonly root: HTMLElement,
    private readonly onChange: () => void,
  ) {
    this.root.classList.add('creative')
    this.root.addEventListener('pointerdown', (event) => event.stopPropagation())
    this.render()
  }

  isOpen(): boolean {
    return this.open
  }

  getBrush(): EditorBrush | null {
    return this.brush
  }

  toggle(): void {
    this.open = !this.open
    this.render()
    this.onChange()
  }

  openInventory(): void {
    this.open = true
    this.render()
    this.onChange()
  }

  close(): void {
    this.open = false
    this.render()
    this.onChange()
  }

  focusSearch(): void {
    if (!this.open) return
    this.keepSearchFocus = true
    this.render()
  }

  blurSearch(): void {
    this.keepSearchFocus = false
    const search = this.root.querySelector<HTMLInputElement>('.cr-search')
    search?.blur()
  }

  isSearchFocused(): boolean {
    return this.keepSearchFocus
  }

  clearBrush(): void {
    this.brush = null
    this.render()
    this.onChange()
  }

  rotate(delta = Math.PI / 2): void {
    if (!this.brush) return
    this.brush.yaw = (this.brush.yaw + delta) % (Math.PI * 2)
    this.onChange()
  }

  nudgeScale(factor: number): void {
    if (!this.brush) return
    this.brush.scale = Math.max(0.08, Math.min(80, this.brush.scale * factor))
    this.onChange()
  }

  private selectAsset(assetId: string, closeAfter: boolean): void {
    const entry = ASSET_INDEX.find((item) => item.id === assetId)
    if (!entry) return
    this.brush = { assetId, yaw: 0, scale: suggestedScale(entry) }
    if (closeAfter) this.open = false
    this.render()
    this.onChange()
  }

  render(): void {
    if (!this.open) {
      this.resetSearch()
      this.root.hidden = true
      this.root.innerHTML = ''
      return
    }
    this.root.hidden = false
    const items = this.visibleItems()
    const tabs = CREATIVE_TABS.map((tab) => {
      const active = this.tab === tab.id ? ' is-on' : ''
      return `<button type="button" class="cr-tab${active}" data-tab="${tab.id}">${tab.label}</button>`
    }).join('')
    const slots = items
      .map((entry) => {
        const on = this.brush?.assetId === entry.id ? ' is-on' : ''
        const thumb = this.thumbs.ask(entry.id)
        return `<button type="button" class="cr-slot${on}" data-asset="${entry.id}" title="${entry.name}">
          ${thumb ? `<img class="cr-thumb" data-thumb="${entry.id}" src="${thumb}" alt="">` : `<i class="cr-icon cr-icon-${entry.category}" data-thumb="${entry.id}"></i>`}
          <span>${shortName(entry)}</span>
        </button>`
      })
      .join('')
    this.root.innerHTML = `
      <div class="cr-overlay is-open" data-overlay>
        <div class="cr-panel" data-panel>
          <header class="cr-head">
            <strong>创造模式</strong>
            <span>点地即完成 · / 搜索 · 手中素材 R/Q 旋转，-/= 或滚轮缩放，右键拆除</span>
            <input class="cr-search" type="search" placeholder="搜索名字 · / 聚焦" value="${escapeAttr(this.query)}" autocomplete="off" spellcheck="false" tabindex="0" />
          </header>
          <div class="cr-tabs">${tabs}</div>
          <div class="cr-grid">${slots || '<p class="cr-empty">没有匹配的素材</p>'}</div>
          <footer class="cr-foot">${this.hoverName || this.brushLabel()}</footer>
        </div>
      </div>
    `

    this.root.querySelector('[data-overlay]')?.addEventListener('pointerdown', (event) => {
      if (event.target === event.currentTarget) this.close()
    })
    this.root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        this.tab = button.dataset.tab as typeof this.tab
        this.keepSearchFocus = false
        this.render()
      })
    })
    this.root.querySelectorAll<HTMLButtonElement>('[data-asset]').forEach((button) => {
      button.addEventListener('mouseenter', () => {
        const entry = ASSET_INDEX.find((item) => item.id === button.dataset.asset)
        this.hoverName = entry ? `${entry.name} · ${tabLabel(entry.category)}` : ''
        const foot = this.root.querySelector('.cr-foot')
        if (foot) foot.textContent = this.hoverName
      })
      button.addEventListener('click', () => {
        const id = button.dataset.asset
        if (id) this.selectAsset(id, true)
      })
    })
    const search = this.root.querySelector<HTMLInputElement>('.cr-search')
    const refocus = this.keepSearchFocus
    search?.addEventListener('pointerdown', () => {
      this.keepSearchFocus = true
    })
    search?.addEventListener('keydown', (event) => {
      if (event.code === 'Escape') return
      event.stopPropagation()
    })
    search?.addEventListener('input', () => {
      this.query = search.value
      this.keepSearchFocus = true
      this.render()
    })
    if (refocus) {
      this.keepSearchFocus = true
      search?.focus()
    }
  }

  private resetSearch(): void {
    this.query = ''
    this.keepSearchFocus = false
  }

  tickThumbs(): void {
    if (!this.open && !this.brush) return
    this.thumbs.tick()
    this.root.querySelectorAll<HTMLElement>('[data-thumb]').forEach((node) => {
      const id = node.dataset.thumb
      if (!id) return
      const url = this.thumbs.ask(id)
      if (!url) return
      if (node instanceof HTMLImageElement) {
        if (node.src !== url) node.src = url
        return
      }
      const img = document.createElement('img')
      img.className = 'cr-thumb'
      img.dataset.thumb = id
      img.src = url
      img.alt = ''
      node.replaceWith(img)
    })
  }

  private visibleItems(): AssetEntry[] {
    return ASSET_INDEX.filter((entry) => {
      if (entry.category === 'people') return false
      if (this.tab !== 'all' && entry.category !== this.tab) return false
      return matchesCreativeQuery(entry, this.query)
    })
  }

  private brushLabel(): string {
    if (!this.brush) return '未选择'
    const entry = ASSET_INDEX.find((item) => item.id === this.brush?.assetId)
    return entry ? `手持 ${entry.name}` : '未选择'
  }
}

function shortName(entry: AssetEntry): string {
  return entry.name.length > 10 ? `${entry.name.slice(0, 9)}…` : entry.name
}

function tabLabel(category: AssetCategory): string {
  return CREATIVE_TABS.find((tab) => tab.id === category)?.label ?? category
}

export function isEditableTarget(target: EventTarget | null | unknown): boolean {
  if (!target || typeof target !== 'object') return false
  const el = target as { tagName?: string; isContentEditable?: boolean }
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return el.isContentEditable === true
}

export function matchesCreativeQuery(entry: { name: string; id: string }, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return entry.name.toLowerCase().includes(q) || entry.id.toLowerCase().includes(q)
}

function escapeAttr(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    if (char === '&') return '&amp;'
    if (char === '<') return '&lt;'
    if (char === '>') return '&gt;'
    if (char === '"') return '&quot;'
    return '&#39;'
  })
}
