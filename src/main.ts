import { GameApp } from '@/app/GameApp'
import './style.css'

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas')
const hud = document.querySelector<HTMLElement>('#debug-hud')
const minimap = document.querySelector<HTMLCanvasElement>('#minimap')
const buildMenu = document.querySelector<HTMLElement>('#build-menu')
const defenseBar = document.querySelector<HTMLElement>('#defense-bar')

if (!canvas || !hud || !minimap || !buildMenu || !defenseBar) {
  throw new Error('Missing required layout roots')
}

const app = new GameApp(canvas, hud, minimap, buildMenu, defenseBar)
app.start()
