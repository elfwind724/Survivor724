import { GameApp } from '@/app/GameApp'
import './style.css'

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas')
const hud = document.querySelector<HTMLElement>('#debug-hud')

if (!canvas || !hud) {
  throw new Error('Missing #game-canvas or #debug-hud')
}

const app = new GameApp(canvas, hud)
app.start()
