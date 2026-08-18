import { AnimationClip } from 'three'
import { describe, expect, it } from 'vitest'
import { clipScore, locomotionFromSpeed, pickArmedPose, pickCharacterClip } from '@/render/CharacterClips'

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

  it('uses gun hold and shoot clips when the survivor is armed', () => {
    const clips = [
      clip('CharacterArmature|Idle_Neutral'),
      clip('CharacterArmature|Idle_Gun'),
      clip('CharacterArmature|Idle_Gun_Pointing'),
      clip('CharacterArmature|Idle_Gun_Shoot'),
      clip('CharacterArmature|Run_Shoot'),
      clip('CharacterArmature|Walk'),
    ]
    expect(pickCharacterClip([...clips, clip('CharacterArmature|Interact'), clip('HumanArmature|Man_Sitting')], 'interact')?.name).toContain('Interact')
    expect(pickCharacterClip([clip('HumanArmature|Man_Sitting'), clip('CharacterArmature|Idle')], 'sit')?.name).toContain('Sitting')
    expect(pickCharacterClip(clips, 'aim')?.name).toBe('CharacterArmature|Idle_Gun_Pointing')
    expect(pickCharacterClip(clips, 'shoot')?.name).toBe('CharacterArmature|Idle_Gun_Shoot')
    expect(pickCharacterClip(clips, 'idleGun')?.name).toBe('CharacterArmature|Idle_Gun')
    expect(pickArmedPose(0, false, { aim: true, shoot: true })).toBe('aim')
    expect(pickArmedPose(0, true, { aim: true, shoot: true })).toBe('shoot')
    expect(pickArmedPose(3.2, true, { runShoot: true, shoot: true })).toBe('runShoot')
    expect(clipScore('CharacterArmature|Idle_Gun', 'idle')).toBe(0)
  })
})
