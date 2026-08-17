export class InputSystem {
  private keys = new Map<string, boolean>()
  private prevKeys = new Map<string, boolean>()
  private justPressed = new Set<string>()
  private justReleased = new Set<string>()

  private mouseX = 0
  private mouseY = 0
  private prevMouseX = 0
  private prevMouseY = 0
  private mouseDown = false
  private prevMouseDown = false
  private mouseJustClicked = false
  private mouseJustReleased = false
  private rightMouseDown = false
  private prevRightMouseDown = false
  private rightMouseJustClicked = false
  private rightMouseJustReleased = false

  private onKeyDown: (e: KeyboardEvent) => void
  private onKeyUp: (e: KeyboardEvent) => void
  private onMouseMove: (e: MouseEvent) => void
  private onMouseDown: (e: MouseEvent) => void
  private onMouseUp: (e: MouseEvent) => void

  private preventDefaults = new Set([
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'Space', 'Tab',
  ])

  constructor() {
    this.onKeyDown = (e: KeyboardEvent) => {
      if (this.preventDefaults.has(e.code)) e.preventDefault()
      this.keys.set(e.code, true)
    }

    this.onKeyUp = (e: KeyboardEvent) => {
      this.keys.set(e.code, false)
    }

    this.onMouseMove = (e: MouseEvent) => {
      this.mouseX = e.clientX
      this.mouseY = e.clientY
    }

    this.onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) this.mouseDown = true
      if (e.button === 2) this.rightMouseDown = true
    }

    this.onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) this.mouseDown = false
      if (e.button === 2) this.rightMouseDown = false
    }

    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('mousemove', this.onMouseMove)
    window.addEventListener('mousedown', this.onMouseDown)
    window.addEventListener('mouseup', this.onMouseUp)
  }

  beginFrame(): void {
    this.justPressed.clear()
    this.justReleased.clear()

    for (const [key, down] of this.keys) {
      const prev = this.prevKeys.get(key) ?? false
      if (down && !prev) this.justPressed.add(key)
      if (!down && prev) this.justReleased.add(key)
    }

    this.prevKeys = new Map(this.keys)

    this.mouseJustClicked = this.mouseDown && !this.prevMouseDown
    this.mouseJustReleased = !this.mouseDown && this.prevMouseDown
    this.prevMouseDown = this.mouseDown

    this.rightMouseJustClicked = this.rightMouseDown && !this.prevRightMouseDown
    this.rightMouseJustReleased = !this.rightMouseDown && this.prevRightMouseDown
    this.prevRightMouseDown = this.rightMouseDown

    this.prevMouseX = this.mouseX
    this.prevMouseY = this.mouseY
  }

  isDown(key: string): boolean {
    return this.keys.get(key) ?? false
  }

  /** Inject a virtual key state (mobile touch controls). Merges into the same
   *  key table as physical input, so isDown/wasPressed/getAxis all work. */
  injectKey(code: string, down: boolean): void {
    this.keys.set(code, down)
  }

  wasPressed(key: string): boolean {
    return this.justPressed.has(key)
  }

  /** Like wasPressed, but consumes the press — later readers this frame see false.
   *  Use for keys owned by exactly one action per frame (e.g. E interact). */
  consumePress(key: string): boolean {
    if (this.justPressed.has(key)) {
      this.justPressed.delete(key)
      return true
    }
    return false
  }

  wasReleased(key: string): boolean {
    return this.justReleased.has(key)
  }

  getMousePosition(): { x: number; y: number } {
    return { x: this.mouseX, y: this.mouseY }
  }

  getMouseDelta(): { x: number; y: number } {
    return {
      x: this.mouseX - this.prevMouseX,
      y: this.mouseY - this.prevMouseY,
    }
  }

  isMouseDown(): boolean {
    return this.mouseDown
  }

  wasMousePressed(): boolean {
    return this.mouseJustClicked
  }

  wasMouseReleased(): boolean {
    return this.mouseJustReleased
  }

  isRightMouseDown(): boolean {
    return this.rightMouseDown
  }

  wasRightMousePressed(): boolean {
    return this.rightMouseJustClicked
  }

  wasRightMouseReleased(): boolean {
    return this.rightMouseJustReleased
  }

  getAxis(name: 'vertical' | 'horizontal'): number {
    if (name === 'vertical') {
      return (this.isDown('KeyW') || this.isDown('ArrowUp') ? 1 : 0) +
             (this.isDown('KeyS') || this.isDown('ArrowDown') ? -1 : 0)
    }
    if (name === 'horizontal') {
      return (this.isDown('KeyD') || this.isDown('ArrowRight') ? 1 : 0) +
             (this.isDown('KeyA') || this.isDown('ArrowLeft') ? -1 : 0)
    }
    return 0
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('mousemove', this.onMouseMove)
    window.removeEventListener('mousedown', this.onMouseDown)
    window.removeEventListener('mouseup', this.onMouseUp)
  }
}

export const input = new InputSystem()
