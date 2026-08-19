import type { AnimationClip } from 'three'

export type Locomotion = 'idle' | 'walk' | 'run'
export type CharacterPose = Locomotion | 'idleGun' | 'aim' | 'shoot' | 'runShoot' | 'sit' | 'interact' | 'attack'

export function clipScore(name: string, kind: CharacterPose): number {
  const n = name.toLowerCase()
  if (kind === 'idle') {
    if (n.includes('idle_neutral')) return 3
    if (/(^|\|)idle$/.test(n) || n.endsWith('man_idle')) return 2
    if (n.includes('idle') && !n.includes('gun') && !n.includes('sword')) return 1
    return 0
  }
  if (kind === 'walk') {
    if (n.includes('walk_back') || n.includes('walk_left') || n.includes('walk_right')) return 0
    if (/(^|\|)walk$/.test(n) || n.endsWith('man_walk')) return 2
    if (n.includes('walk')) return 1
    return 0
  }
  if (kind === 'run') {
    if (n.includes('run_back') || n.includes('run_left') || n.includes('run_right') || n.includes('run_shoot')) return 0
    if (/(^|\|)run$/.test(n) || n.endsWith('man_run')) return 2
    if (n.includes('run')) return 1
    return 0
  }
  if (kind === 'idleGun') {
    if (n.includes('idle_gun') && !n.includes('point') && !n.includes('shoot')) return 2
    if (n.includes('idle_gun')) return 1
    return 0
  }
  if (kind === 'aim') {
    if (n.includes('idle_gun_pointing')) return 2
    if (n.includes('pointing')) return 1
    return 0
  }
  if (kind === 'shoot') {
    if (n.includes('idle_gun_shoot')) return 2
    if (n.includes('gun_shoot') && !n.includes('run')) return 1
    return 0
  }
  if (kind === 'sit') {
    if (n.includes('sitting') || n.includes('sit')) return 2
    return 0
  }
  if (kind === 'interact') {
    if (n.includes('interact')) return 2
    if (n.includes('clap')) return 1
    return 0
  }
  if (kind === 'attack') {
    if (n.includes('punch')) return 3
    if (n.includes('attack')) return 2
    if (n.includes('kick')) return 1
    if (n.includes('sword_slash')) return 1
    return 0
  }
  if (n.includes('run_shoot')) return 2
  return 0
}

export function pickCharacterClip(clips: readonly AnimationClip[], kind: CharacterPose): AnimationClip | null {
  let best: AnimationClip | null = null
  let score = 0
  for (const clip of clips) {
    const next = clipScore(clip.name, kind)
    if (next > score) {
      best = clip
      score = next
    }
  }
  return best
}

export function locomotionFromSpeed(speed: number): Locomotion {
  if (speed > 2.6) return 'run'
  if (speed > 0.35) return 'walk'
  return 'idle'
}

export function pickArmedPose(
  speed: number,
  firing: boolean,
  available: Partial<Record<CharacterPose, unknown>>,
): CharacterPose {
  const move = locomotionFromSpeed(speed)
  if (firing && move === 'run' && available.runShoot) return 'runShoot'
  if (firing && available.shoot) return 'shoot'
  if (move === 'idle' && available.aim) return 'aim'
  if (move === 'idle' && available.idleGun) return 'idleGun'
  return move
}
