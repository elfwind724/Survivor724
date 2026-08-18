import { GameApp } from '@/app/GameApp'
import './style.css'

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas')
const hud = document.querySelector<HTMLElement>('#game-hud')
const sheet = document.querySelector<HTMLElement>('#character-sheet')
const minimap = document.querySelector<HTMLCanvasElement>('#minimap')
const buildMenu = document.querySelector<HTMLElement>('#build-menu')
const roster = document.querySelector<HTMLElement>('#roster-panel')
const creative = document.querySelector<HTMLElement>('#creative-editor')
const defenseBar = document.querySelector<HTMLElement>('#defense-bar')
const sandbox = document.querySelector<HTMLElement>('#sandbox-panel')

if (!canvas || !hud || !sheet || !minimap || !buildMenu || !roster || !creative || !defenseBar || !sandbox) {
  throw new Error('Missing required layout roots')
}

const app = new GameApp(canvas, hud, sheet, minimap, buildMenu, roster, creative, defenseBar, sandbox)
app.start()
