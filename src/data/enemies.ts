export interface EnemyDefinition {
  id: 'wanderer' | 'runner'
  health: number
  moveSpeed: number
  damage: number
  attackRange: number
  attackCooldown: number
}

export const ENEMY_DEFINITIONS: Record<EnemyDefinition['id'], EnemyDefinition> = {
  wanderer: { id: 'wanderer', health: 88, moveSpeed: 2.35, damage: 10, attackRange: 1.45, attackCooldown: 1.05 },
  runner: { id: 'runner', health: 56, moveSpeed: 3.85, damage: 8, attackRange: 1.35, attackCooldown: 0.78 },
}

export const NIGHT_HORDE = { wanderers: 18, runners: 8 }

export function hordeCounts(dayIndex: number): { wanderers: number; runners: number } {
  const night = Math.max(1, dayIndex)
  return {
    wanderers: NIGHT_HORDE.wanderers + (night - 1) * 4,
    runners: NIGHT_HORDE.runners + (night - 1) * 2,
  }
}
