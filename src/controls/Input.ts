export class Input {
  private readonly down = new Set<string>()
  mouseX = 0
  mouseY = 0
  mouseDeltaX = 0

  constructor() {
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('mousemove', this.onMouseMove)
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('mousemove', this.onMouseMove)
  }

  isDown(code: string): boolean {
    return this.down.has(code)
  }

  axis(positive: string, negative: string): number {
    return (this.isDown(positive) ? 1 : 0) + (this.isDown(negative) ? -1 : 0)
  }

  consumeMouseDeltaX(): number {
    const value = this.mouseDeltaX
    this.mouseDeltaX = 0
    return value
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'Tab') event.preventDefault()
    this.down.add(event.code)
  }

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.down.delete(event.code)
  }

  private readonly onMouseMove = (event: MouseEvent): void => {
    this.mouseX = event.clientX
    this.mouseY = event.clientY
    this.mouseDeltaX += event.movementX
  }
}
