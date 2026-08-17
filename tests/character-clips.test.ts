import { AnimationClip } from 'three'
import { describe, expect, it } from 'vitest'
import { clipScore, locomotionFromSpeed, pickCharacterClip } from '@/render/CharacterClips'

function clip(name: string): AnimationClip {
  return new AnimationClip(name, 1, [])
}

describe('character clips', () => {
  it('prefers idle/walk/run armature clips from Quaternius names', () => {
    const clips = [
      clip('CharacterArmature|Idle_Gun'),
      clip('CharacterArmature|Idle_Neutral'),
      clip('CharacterArmature|Walk'),
      clip('CharacterArmature|Walk_Back'),
      clip('CharacterArmature|Run'),
      clip('CharacterArmature|Run_Shoot'),
    ]
    expect(pickCharacterClip(clips, 'idle')?.name).toBe('CharacterArmature|Idle_Neutral')
    expect(pickCharacterClip(clips, 'walk')?.name).toBe('CharacterArmature|Walk')
    expect(pickCharacterClip(clips, 'run')?.name).toBe('CharacterArmature|Run')
    expect(clipScore('CharacterArmature|Walk_Back', 'walk')).toBe(0)
  })

  it('picks walk when the survivor is moving', () => {
    expect(locomotionFromSpeed(0)).toBe('idle')
    expect(locomotionFromSpeed(1.2)).toBe('walk')
    expect(locomotionFromSpeed(3.2)).toBe('run')
  })
})
