import type { AnimationClip } from 'three'

export type Locomotion = 'idle' | 'walk' | 'run'

export function clipScore(name: string, kind: Locomotion): number {
  const n = name.toLowerCase()
  if (kind === 'idle') {
    if (n.includes('idle_neutral')) return 3
    if (/(^|\|)idle$/.test(n)) return 2
    if (n.includes('idle') && !n.includes('gun') && !n.includes('sword')) return 1
    return 0
  }
  if (kind === 'walk') {
    if (n.includes('walk_back') || n.includes('walk_left') || n.includes('walk_right')) return 0
    if (/(^|\|)walk$/.test(n)) return 2
    if (n.includes('walk')) return 1
    return 0
  }
  if (n.includes('run_back') || n.includes('run_left') || n.includes('run_right') || n.includes('run_shoot')) return 0
  if (/(^|\|)run$/.test(n)) return 2
  if (n.includes('run')) return 1
  return 0
}

export function pickCharacterClip(clips: readonly AnimationClip[], kind: Locomotion): AnimationClip | null {
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
