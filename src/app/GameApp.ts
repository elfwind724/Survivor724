import { DebugRenderer } from '@/render/DebugRenderer'
import { stepWorld } from '@/simulation/SimStep'
import { createInitialWorld } from '@/simulation/WorldState'
import type { WorldState } from '@/simulation/types'
import { DebugHud } from '@/ui/DebugHud'
import { GameLoop } from './GameLoop'

export class GameApp {
  private readonly world: WorldState
  private readonly renderer: DebugRenderer
  private readonly hud: DebugHud
  private readonly loop: GameLoop

  constructor(canvas: HTMLCanvasElement, hudRoot: HTMLElement) {
    this.world = createInitialWorld()
    this.renderer = new DebugRenderer(canvas)
    this.hud = new DebugHud(hudRoot)
    this.loop = new GameLoop(this.step, this.draw)
    this.renderer.sync(this.world)
    this.hud.render(this.world)
  }

  start(): void {
    this.loop.start()
  }

  stop(): void {
    this.loop.stop()
    this.renderer.dispose()
  }

  private readonly step = (dt: number): void => {
    stepWorld(this.world, dt)
  }

  private readonly draw = (_alpha: number): void => {
    this.renderer.sync(this.world)
    this.renderer.draw()
    this.hud.render(this.world)
  }
}
