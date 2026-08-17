export const SIM_HZ = 30
export const SIM_DT = 1 / SIM_HZ

export class GameLoop {
  private accumulator = 0
  private raf = 0
  private lastMs: number | null = null
  private running = false

  constructor(
    private readonly stepSimulation: (dt: number) => void,
    private readonly render: (alpha: number) => void,
  ) {}

  start(): void {
    if (this.running) return
    this.running = true
    this.lastMs = null
    this.raf = requestAnimationFrame(this.tick)
  }

  stop(): void {
    this.running = false
    cancelAnimationFrame(this.raf)
  }

  private readonly tick = (now: number): void => {
    if (!this.running) return
    if (this.lastMs === null) this.lastMs = now
    const elapsed = Math.min((now - this.lastMs) / 1000, 0.25)
    this.lastMs = now
    this.accumulator += elapsed

    while (this.accumulator >= SIM_DT) {
      this.stepSimulation(SIM_DT)
      this.accumulator -= SIM_DT
    }

    this.render(this.accumulator / SIM_DT)
    this.raf = requestAnimationFrame(this.tick)
  }
}
