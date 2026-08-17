import type { SurvivorState } from '@/simulation/types'
import { derivedStats } from './equipment'

export type WeaponClass = 'pistol' | 'revolver' | 'smg' | 'rifle' | 'shotgun' | 'sniper'

export interface WeaponDefinition {
  id: string
  label: string
  class: WeaponClass
  damage: number
  pellets: number
  range: number
  speed: number
  cooldown: number
  spread: number
  ammoCost: number
  assetId: string
  muzzle: number
}

export const WEAPONS: readonly WeaponDefinition[] = [
  { id: 'pistol', label: '手枪', class: 'pistol', damage: 16, pellets: 1, range: 18, speed: 48, cooldown: 0.42, spread: 0.045, ammoCost: 1, assetId: 'guns/pistol', muzzle: 0.18 },
  { id: 'revolver', label: '左轮', class: 'revolver', damage: 24, pellets: 1, range: 20, speed: 52, cooldown: 0.7, spread: 0.03, ammoCost: 1, assetId: 'guns/revolver', muzzle: 0.2 },
  { id: 'smg', label: '冲锋枪', class: 'smg', damage: 11, pellets: 1, range: 16, speed: 50, cooldown: 0.12, spread: 0.08, ammoCost: 1, assetId: 'guns/submachine-gun', muzzle: 0.28 },
  { id: 'rifle', label: '步枪', class: 'rifle', damage: 28, pellets: 1, range: 34, speed: 72, cooldown: 0.55, spread: 0.022, ammoCost: 1, assetId: 'guns/assault-rifle', muzzle: 0.42 },
  { id: 'shotgun', label: '霰弹枪', class: 'shotgun', damage: 9, pellets: 6, range: 12, speed: 38, cooldown: 0.9, spread: 0.16, ammoCost: 1, assetId: 'guns/shotgun', muzzle: 0.48 },
  { id: 'sniper', label: '狙击枪', class: 'sniper', damage: 52, pellets: 1, range: 56, speed: 96, cooldown: 1.35, spread: 0.008, ammoCost: 1, assetId: 'guns/sniper-rifle', muzzle: 0.62 },
]

export function weaponById(id: string): WeaponDefinition | undefined {
  return WEAPONS.find((entry) => entry.id === id)
}

export function equippedWeapon(survivor: SurvivorState): WeaponDefinition | undefined {
  const equipped = survivor.equipment.weapon
  if (equipped) return weaponById(equipped)
  for (const tool of survivor.carriedTools) {
    const weapon = weaponById(tool)
    if (weapon) return weapon
  }
  return undefined
}

export function fireProfile(survivor: SurvivorState) {
  const weapon = equippedWeapon(survivor)
  const stats = derivedStats(survivor.attributes, survivor.equipment)
  const level = Math.max(1, survivor.level)
  if (!weapon) {
    return {
      weapon: null,
      damage: 0,
      cooldown: 1,
      range: 0,
      speed: 0,
      spread: 0,
      pellets: 0,
      ammoCost: 0,
      muzzle: 0,
    }
  }
  const levelBonus = (level - 1) * 0.07
  const damage = Math.round(weapon.damage * (1 + levelBonus + stats.total.strength * 0.035))
  const cooldown = Math.max(0.08, weapon.cooldown / (1 + stats.total.agility * 0.018 + (level - 1) * 0.025))
  const range = weapon.range * (1 + (level - 1) * 0.035)
  const speed = weapon.speed * (1 + (level - 1) * 0.02)
  const spread = Math.max(0.004, weapon.spread * (1 - Math.min(0.55, stats.total.agility * 0.012 + (level - 1) * 0.03)))
  return { weapon, damage, cooldown, range, speed, spread, pellets: weapon.pellets, ammoCost: weapon.ammoCost, muzzle: weapon.muzzle }
}

export function muzzleOrigin(survivor: SurvivorState): { x: number; y: number; z: number } {
  const profile = fireProfile(survivor)
  const lookX = Math.sin(survivor.facingYaw)
  const lookZ = Math.cos(survivor.facingYaw)
  const rightX = lookZ
  const rightZ = -lookX
  const barrel = profile.weapon?.muzzle ?? 0.2
  return {
    x: survivor.position.x + lookX * (0.58 + barrel) + rightX * 0.22,
    y: 1.72,
    z: survivor.position.z + lookZ * (0.58 + barrel) + rightZ * 0.22,
  }
}

export function weaponForTools(tools: string[]): WeaponDefinition {
  return weaponById(tools.find((tool) => weaponById(tool)) ?? '') ?? WEAPONS[0]!
}
