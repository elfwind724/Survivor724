export interface WeaponDefinition {
  id: string
  damage: number
  range: number
  cooldown: number
}

export const WEAPONS: readonly WeaponDefinition[] = [
  { id: 'rifle', damage: 34, range: 32, cooldown: 0.65 },
  { id: 'pistol', damage: 18, range: 16, cooldown: 0.4 },
]

export function weaponForTools(tools: string[]): WeaponDefinition {
  if (tools.includes('rifle')) return WEAPONS[0]!
  return WEAPONS[1]!
}
