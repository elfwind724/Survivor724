import { game, GameState } from '@/core/Game'
import type { VehicleHomePersistenceState } from '@/managers/VehicleHomeManager'
import type { CompanionsPersistenceState } from '@/data/companions'
import type { OpenRoadThreatPersistenceState } from '@/managers/OpenRoadThreatManager'
import type { JourneyStoryPersistenceState } from '@/data/journeyStory'
import type { ChapterOnePersistenceState } from '@/data/chapterOne'
import { normalizeWeaponInstance, type WeaponInstance } from '@/data/weapons'
import { ITEMS } from '@/systems/Inventory'

interface SavedItem { id: string; count: number; weapon?: WeaponInstance }

interface SaveData {
  version?: number
  worldSeed: number
  world?: { harvestedKeys?: string[] }
  gameState?: GameState.DRIVING | GameState.WALKING | GameState.RV_INTERIOR
  elapsedSeconds?: number
  vehicle: {
    x: number
    z: number
    rotation?: number
    fuel: number
    durability: number
    speed: number
    stats: any
    autopilot: boolean
  }
  player: {
    hunger: number
    thirst: number
    health: number
    x: number
    z: number
    rotation?: number
    bodyTemp?: number
    sick?: boolean
    awaySeconds?: number
  }
  upgrades: Record<string, number>
  inventory: {
    bag: SavedItem[]
    hotbar: Array<SavedItem | null>
    trunk: SavedItem[]
    equipment: Record<string, SavedItem | string | null>
    selectedHotbar?: number
  }
  camp?: Record<string, any> | null
  events?: {
    interactedRows?: number[]
    survivorMemory?: { helped?: number; traded?: number; walkedAway?: number; ambushesSurvived?: number }
  }
  dungeon?: { completedBlocks?: number[] }
  roadHorde?: { completedZones?: number[] }
  raiderCamp?: { completedCells?: number[] }
  vehicleHome?: VehicleHomePersistenceState
  companions?: CompanionsPersistenceState
  openRoadThreats?: OpenRoadThreatPersistenceState
  journeyStory?: JourneyStoryPersistenceState
  chapterOne?: ChapterOnePersistenceState
  weather: string
  timestamp: number
}

const SAVE_KEY = 'survival_highway_save'
const AUTO_SAVE_INTERVAL = 30
const SAVE_VERSION = 11

export class SaveSystem {
  private timer = 0

  constructor() {
    console.log(`[SaveSystem] Ready — journey persistence v${SAVE_VERSION}`)
  }

  save(): void {
    const state = game.getState()
    if (state !== GameState.DRIVING && state !== GameState.WALKING && state !== GameState.RV_INTERIOR) return

    const vehicle = game.getManager('vehicle') as any
    const player = game.getManager('player') as any
    const upgrades = game.getManager('upgrades') as any
    const inv = game.getManager('inventory') as any
    const weather = game.getManager('weather') as any
    const camp = game.getManager('camp') as any
    const events = game.getManager('events') as any
    const dungeon = game.getManager('dungeon') as any
    const roadHorde = game.getManager('roadHorde') as any
    const raiderCamp = game.getManager('raiderCamp') as any
    const world = game.getManager('world') as any
    const vehicleHome = game.getManager('vehicleHome') as any
    const companions = game.getManager('companions') as any
    const openRoadThreats = game.getManager('openRoadThreats') as any
    const journeyStory = game.getManager('journeyStory') as any
    const chapterOne = game.getManager('chapterOne') as any
    if (!vehicle || !player) return

    const pressure = player.getSurvivalPressure?.()
    const data: SaveData = {
      version: SAVE_VERSION,
      worldSeed: world?.getWorldSeed?.() ?? 0,
      world: world?.getPersistenceState?.() ?? { harvestedKeys: [] },
      gameState: state,
      elapsedSeconds: game.getElapsed(),
      vehicle: {
        x: vehicle.position.x,
        z: vehicle.position.z,
        rotation: vehicle.rotation ?? 0,
        fuel: vehicle.fuel,
        durability: vehicle.durability,
        speed: vehicle.speed,
        stats: { ...vehicle.stats },
        autopilot: vehicle.autopilot ?? false,
      },
      player: {
        hunger: player.stats?.hunger ?? 80,
        thirst: player.stats?.thirst ?? 80,
        health: player.stats?.health ?? 100,
        x: player.position.x,
        z: player.position.z,
        rotation: player.rotation ?? 0,
        bodyTemp: player.bodyTemp ?? 36.6,
        sick: player.sick ?? false,
        awaySeconds: pressure?.awaySeconds ?? 0,
      },
      upgrades: upgrades?.getAllLevels?.() ?? {},
      inventory: {
        bag: [],
        hotbar: [],
        trunk: [],
        equipment: {},
        selectedHotbar: inv?.selectedHotbar ?? 0,
      },
      camp: camp?.getPersistenceState?.() ?? null,
      events: events?.getPersistenceState?.() ?? { interactedRows: [] },
      dungeon: dungeon?.getPersistenceState?.() ?? { completedBlocks: [] },
      roadHorde: roadHorde?.getPersistenceState?.() ?? { completedZones: [] },
      raiderCamp: raiderCamp?.getPersistenceState?.() ?? { completedCells: [] },
      vehicleHome: vehicleHome?.getPersistenceState?.(),
      companions: companions?.getPersistenceState?.(),
      openRoadThreats: openRoadThreats?.getPersistenceState?.(),
      journeyStory: journeyStory?.getPersistenceState?.(),
      chapterOne: chapterOne?.getPersistenceState?.(),
      weather: weather?.getWeather?.() ?? 'clear',
      timestamp: Date.now(),
    }

    if (inv) {
      for (const slot of inv.bag.slots) {
        if (slot.item) data.inventory.bag.push({ id: slot.item.id, count: slot.count, weapon: slot.weapon })
      }
      // Preserve all nine indices. The old save compacted empty slots and
      // moved every shortcut left after Continue.
      data.inventory.hotbar = inv.hotbar.map((slot: any) => slot.item
        ? { id: slot.item.id, count: slot.count, weapon: slot.weapon }
        : null)
      for (const slot of inv.trunk.slots) {
        if (slot.item) data.inventory.trunk.push({ id: slot.item.id, count: slot.count, weapon: slot.weapon })
      }
      for (const [key, slot] of Object.entries(inv.equipment.slots) as any) {
        data.inventory.equipment[key] = slot.item ? { id: slot.item.id, count: 1, weapon: slot.weapon } : null
      }
    }

    localStorage.setItem(SAVE_KEY, JSON.stringify(data))
    console.log(`[Save] Game saved v${SAVE_VERSION}`)
  }

  load(): boolean {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return false

    try {
      const data = JSON.parse(raw) as SaveData
      const vehicle = game.getManager('vehicle') as any
      const player = game.getManager('player') as any
      const upgrades = game.getManager('upgrades') as any
      const hud = game.getManager('hud') as any
      const inv = game.getManager('inventory') as any
      const weather = game.getManager('weather') as any
      const camp = game.getManager('camp') as any
      const events = game.getManager('events') as any
      const dungeon = game.getManager('dungeon') as any
      const roadHorde = game.getManager('roadHorde') as any
      const raiderCamp = game.getManager('raiderCamp') as any
      const vehicleHome = game.getManager('vehicleHome') as any
      const companions = game.getManager('companions') as any
      const openRoadThreats = game.getManager('openRoadThreats') as any
      const journeyStory = game.getManager('journeyStory') as any
      const chapterOne = game.getManager('chapterOne') as any
      if (!vehicle || !player || !data.vehicle || !data.player) return false

      const world = game.getManager('world') as any
      if (world && data.worldSeed) world.setWorldSeed?.(data.worldSeed)
      world?.restorePersistenceState?.(data.world)
      game.restoreElapsed(data.elapsedSeconds ?? 0)

      vehicle.position.x = Number(data.vehicle.x) || 0
      vehicle.position.z = Number(data.vehicle.z) || 0
      vehicle.rotation = Number(data.vehicle.rotation) || 0
      if ((data.version ?? 1) >= 7) vehicle.stats = { ...vehicle.stats, ...(data.vehicle.stats ?? {}) }
      else vehicle.migrateLegacyDrivingTuning?.(data.upgrades)
      vehicle.fuel = Math.max(0, Math.min(vehicle.stats.maxFuel, Number(data.vehicle.fuel) || 0))
      vehicle.durability = Math.max(0, Math.min(vehicle.stats.maxDurability, Number(data.vehicle.durability) || 0))
      vehicle.speed = 0
      vehicle.autopilot = data.vehicle.autopilot ?? false
      vehicle.mesh.position.copy(vehicle.position)
      vehicle.mesh.rotation.y = vehicle.rotation

      player.stats.hunger = Math.max(0, Math.min(100, Number(data.player.hunger) || 0))
      player.stats.thirst = Math.max(0, Math.min(100, Number(data.player.thirst) || 0))
      player.stats.health = Math.max(0, Math.min(100, Number(data.player.health) || 0))
      player.position.x = Number(data.player.x) || 0
      player.position.z = Number(data.player.z) || 0
      if (Number.isFinite(data.player.bodyTemp)) player.bodyTemp = data.player.bodyTemp
      player.sick = data.player.sick ?? false

      if (weather && data.weather) weather.setWeather?.(data.weather)
      upgrades?.restoreLevels?.(data.upgrades ?? {})

      if (inv && data.inventory) {
        const itemDefs = ITEMS
        const savedWeapon = (item: SavedItem, def: any) => normalizeWeaponInstance(item.weapon, item.id, def.quality)

        // Equipment first: backpack capacity must exist before bag contents are
        // restored, otherwise large bags silently lose their overflow items.
        for (const slot of Object.values(inv.equipment.slots) as any[]) {
          slot.item = null
          slot.count = 0
          slot.weapon = undefined
        }
        for (const [key, raw] of Object.entries(data.inventory.equipment ?? {})) {
          const item: SavedItem | null = typeof raw === 'string' ? { id: raw, count: 1 } : raw
          const def = item ? itemDefs[item.id] : null
          if (inv.equipment.slots[key]) inv.equipment.slots[key] = { item: def ?? null, count: def ? 1 : 0, weapon: item && def ? savedWeapon(item, def) : undefined }
        }
        inv.syncBagSize?.()
        inv.bag.slots.forEach((slot: any) => { slot.item = null; slot.count = 0 })
        inv.hotbar.forEach((slot: any, index: number) => { inv.hotbar[index] = { item: null, count: 0 } })
        inv.trunk.slots.forEach((slot: any) => { slot.item = null; slot.count = 0 })

        for (const item of data.inventory.bag ?? []) {
          const def = itemDefs[item.id]
          inv.addToBag(item.id, item.count, def?.type === 'weapon' ? [savedWeapon(item, def)] : [])
        }
        const savedHotbar = data.inventory.hotbar ?? []
        for (let index = 0; index < Math.min(9, savedHotbar.length); index++) {
          const item = savedHotbar[index]
          if (!item) continue
          const def = itemDefs[item.id] ?? null
          inv.hotbar[index] = { item: def, count: def ? item.count : 0, weapon: def?.type === 'weapon' ? savedWeapon(item, def) : undefined }
        }
        for (const item of data.inventory.trunk ?? []) {
          const def = itemDefs[item.id]
          inv.addToTrunk(item.id, item.count, def?.type === 'weapon' ? [savedWeapon(item, def)] : [])
        }
        inv.selectedHotbar = Math.max(0, Math.min(8, Math.floor(data.inventory.selectedHotbar ?? 0)))
        hud.renderAll?.()
      }

      // Restore world memories after the seed and inventories are ready.
      events?.restorePersistenceState?.(data.events)
      dungeon?.restorePersistenceState?.(data.dungeon)
      roadHorde?.restorePersistenceState?.(data.roadHorde)
      raiderCamp?.restorePersistenceState?.(data.raiderCamp)
      camp?.restorePersistenceState?.(data.camp)
      vehicleHome?.restorePersistenceState?.(data.vehicleHome)
      companions?.restorePersistenceState?.(data.companions)
      openRoadThreats?.restorePersistenceState?.(data.openRoadThreats)
      journeyStory?.restorePersistenceState?.(data.journeyStory)
      chapterOne?.restorePersistenceState?.(data.chapterOne)

      const targetState = data.gameState === GameState.RV_INTERIOR
        ? GameState.RV_INTERIOR
        : data.gameState === GameState.WALKING ? GameState.WALKING : GameState.DRIVING
      player.restoreTravelState?.(
        targetState === GameState.DRIVING,
        Number(data.player.rotation) || 0,
        Number(data.player.awaySeconds) || 0,
      )
      if (targetState === GameState.RV_INTERIOR) vehicleHome?.restoreInteriorSession?.()
      else game.setState(targetState)

      console.log(`[Save] Game loaded v${data.version ?? 1} —`, new Date(data.timestamp).toLocaleString())
      return true
    } catch (error) {
      console.error('[Save] Load failed:', error)
      return false
    }
  }

  hasSave(): boolean {
    return localStorage.getItem(SAVE_KEY) !== null
  }

  deleteSave(): void {
    localStorage.removeItem(SAVE_KEY)
  }

  /** A dead run is final. Reset the autosave clock and remove only the active
   * journey; settings and any future run-history records remain untouched. */
  endJourney(): void {
    this.timer = 0
    this.deleteSave()
    console.log('[Save] Journey ended — active save removed')
  }

  update(delta: number): void {
    const state = game.getState()
    if (state !== GameState.DRIVING && state !== GameState.WALKING && state !== GameState.RV_INTERIOR) return
    this.timer += delta
    if (this.timer >= AUTO_SAVE_INTERVAL) {
      this.timer = 0
      this.save()
    }
  }
}
