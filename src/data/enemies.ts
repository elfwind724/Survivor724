export interface EnemyDefinition {
  id: 'wanderer' | 'runner'
  health: number
  moveSpeed: number
  damage: number
  attackRange: number
  attackCooldown: number
}

export const ENEMY_DEFINITIONS: Record<EnemyDefinition['id'], EnemyDefinition> = {
  wanderer: { id: 'wanderer', health: 70, moveSpeed: 2.1, damage: 8, attackRange: 1.4, attackCooldown: 1.1 },
  runner: { id: 'runner', health: 45, moveSpeed: 3.4, damage: 6, attackRange: 1.3, attackCooldown: 0.85 },
}

export const NIGHT_HORDE = { wanderers: 10, runners: 3 }
