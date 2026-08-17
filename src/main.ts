import { GameApp } from '@/app/GameApp'
import './style.css'

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas')
const hud = document.querySelector<HTMLElement>('#debug-hud')
const minimap = document.querySelector<HTMLCanvasElement>('#minimap')

if (!canvas || !hud || !minimap) {
  throw new Error('Missing #game-canvas, #debug-hud or #minimap')
}

const app = new GameApp(canvas, hud, minimap)
app.start()
