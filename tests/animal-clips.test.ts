import { AnimationClip } from 'three'
import { describe, expect, it } from 'vitest'
import { animalClipScore, animalPoseFrom, fallbackAnimalPose, pickAnimalClip } from '@/render/AnimalClips'
import { createInitialWorld } from '@/simulation/WorldState'
import { stepWildlife } from '@/world/Wildlife'

function clip(name: string): AnimationClip {
  return new AnimationClip(name, 1, [])
}

const QUATERNIUS = [
  clip('Walk'),
  clip('Idle'),
  clip('Eating'),
  clip('Gallop'),
  clip('Gallop_Jump'),
  clip('Death'),
  clip('AnimalArmature|Walk'),
  clip('AnimalArmature|Idle'),
  clip('AnimalArmature|Eating'),
  clip('AnimalArmature|Gallop'),
  clip('AnimalArmature|Death'),
]

describe('animal clips', () => {
  it('prefers AnimalArmature walk, gallop, eating, and death over short duplicate names', () => {
    expect(pickAnimalClip(QUATERNIUS, 'walk')?.name).toBe('AnimalArmature|Walk')
    expect(pickAnimalClip(QUATERNIUS, 'run')?.name).toBe('AnimalArmature|Gallop')
    expect(pickAnimalClip(QUATERNIUS, 'eat')?.name).toBe('AnimalArmature|Eating')
    expect(pickAnimalClip(QUATERNIUS, 'idle')?.name).toBe('AnimalArmature|Idle')
    expect(pickAnimalClip(QUATERNIUS, 'death')?.name).toBe('AnimalArmature|Death')
    expect(pickAnimalClip([...QUATERNIUS, clip('Attack'), clip('AnimalArmature|Attack')], 'attack')?.name).toBe('AnimalArmature|Attack')
    expect(animalClipScore('Gallop_Jump', 'run')).toBe(0)
    expect(animalClipScore('AnimalArmature|Gallop', 'run')).toBeGreaterThan(animalClipScore('Walk', 'run'))
  })

  it('maps graze to eat, wander to walk, flee to gallop', () => {
    expect(animalPoseFrom('graze', true, 0)).toBe('eat')
    expect(animalPoseFrom('wander', true, 1.2)).toBe('walk')
    expect(animalPoseFrom('flee', true, 4)).toBe('run')
    expect(animalPoseFrom('wander', false, 0)).toBe('death')
    expect(fallbackAnimalPose('run', { walk: true, idle: true })).toBe('walk')
    expect(fallbackAnimalPose('eat', { idle: true })).toBe('idle')
  })
})

describe('wildlife locomotion', () => {
  it('stands still while grazing instead of sliding every tick', () => {
    const world = createInitialWorld()
    const deer = world.wildlife.find((entry) => entry.kind === 'deer' && entry.alive)
    const hunter = world.survivors.find((entry) => entry.id === 'hunter')
    if (!deer || !hunter) throw new Error('missing deer')
    hunter.position = { x: -70, y: 0, z: 70 }
    deer.mood = 'graze'
    deer.destination = null
    deer.fleeTimer = 5
    const start = { x: deer.position.x, z: deer.position.z }
    for (let i = 0; i < 30; i += 1) stepWildlife(world, 0.1)
    expect(deer.mood).toBe('graze')
    expect(Math.hypot(deer.position.x - start.x, deer.position.z - start.z)).toBeLessThan(0.05)
  })
})
