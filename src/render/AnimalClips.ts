import type { AnimationClip } from 'three'
import type { WildlifeMood } from '@/simulation/types'

export type AnimalPose = 'idle' | 'walk' | 'run' | 'eat' | 'death' | 'attack'

export function animalClipScore(name: string, kind: AnimalPose): number {
  const n = name.toLowerCase()
  const armature = n.includes('armature|') ? 1 : 0
  if (kind === 'idle') {
    if (n.includes('hitreact') || n.includes('headlow') || n.includes('eating') || n.includes('death') || n.includes('attack')) return 0
    if (/(^|\|)idle$/.test(n)) return 4 + armature
    if (/(^|\|)idle_2$/.test(n)) return 2 + armature
    if (n.includes('idle')) return 1
    return 0
  }
  if (kind === 'eat') {
    if (n.includes('eating')) return 4 + armature
    if (n.includes('headlow')) return 2 + armature
    return 0
  }
  if (kind === 'walk') {
    if (n.includes('jump') || n.includes('gallop') || n.includes('run')) return 0
    if (/(^|\|)walk$/.test(n)) return 4 + armature
    if (n.includes('walk')) return 1
    return 0
  }
  if (kind === 'run') {
    if (n.includes('jump')) return 0
    if (/(^|\|)gallop$/.test(n)) return 4 + armature
    if (n.includes('gallop')) return 2 + armature
    if (/(^|\|)run$/.test(n) || n.includes('run')) return 1
    return 0
  }
  if (kind === 'attack') {
    if (n.includes('jump')) return 0
    if (/(^|\|)attack$/.test(n)) return 5 + armature
    if (n.includes('attack')) return 3 + armature
    return 0
  }
  if (kind === 'death') {
    if (/(^|\|)death$/.test(n)) return 4 + armature
    if (n.includes('death')) return 1
    return 0
  }
  return 0
}

export function pickAnimalClip(clips: readonly AnimationClip[], kind: AnimalPose): AnimationClip | null {
  let best: AnimationClip | null = null
  let score = 0
  for (const clip of clips) {
    const next = animalClipScore(clip.name, kind)
    if (next > score) {
      best = clip
      score = next
    }
  }
  return best
}

export function animalPoseFrom(mood: WildlifeMood, alive: boolean, speed: number): AnimalPose {
  if (!alive) return 'death'
  if (mood === 'graze') return 'eat'
  if (mood === 'flee') return speed > 0.2 ? 'run' : 'idle'
  if (speed > 0.28) return 'walk'
  return 'idle'
}

export function fallbackAnimalPose(
  wanted: AnimalPose,
  available: Partial<Record<AnimalPose, unknown>>,
): AnimalPose {
  if (available[wanted]) return wanted
  if (wanted === 'eat' && available.idle) return 'idle'
  if (wanted === 'run' && available.walk) return 'walk'
  if (wanted === 'attack' && available.idle) return 'idle'
  if (wanted === 'death' && available.idle) return 'idle'
  if (available.idle) return 'idle'
  if (available.walk) return 'walk'
  return wanted
}
