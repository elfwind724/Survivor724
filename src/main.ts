import { GameApp } from '@/app/GameApp'
import './style.css'

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas')
const hud = document.querySelector<HTMLElement>('#debug-hud')
const minimap = document.querySelector<HTMLCanvasElement>('#minimap')
const buildMenu = document.querySelector<HTMLElement>('#build-menu')

if (!canvas || !hud || !minimap || !buildMenu) {
  throw new Error('Missing #game-canvas, #debug-hud, #minimap or #build-menu')
}

const app = new GameApp(canvas, hud, minimap, buildMenu)
app.start()
