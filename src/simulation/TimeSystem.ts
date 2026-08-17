import type { DayPhase, TimeState, WorldState } from './types'

const DAWN_END = 60
const DAY_END = 60 + 11 * 60
const DUSK_END = DAY_END + 90
const NIGHT_END = DUSK_END + 6 * 60

export function createTimeState(dayLengthSeconds = 20 * 60): TimeState {
  return {
    dayIndex: 1,
    daySeconds: 0,
    dayLengthSeconds,
    timeScale: 1,
    phase: 'dawn',
  }
}

export function phaseAt(daySeconds: number): DayPhase {
  if (daySeconds < DAWN_END) return 'dawn'
  if (daySeconds < DAY_END) return 'day'
  if (daySeconds < DUSK_END) return 'dusk'
  if (daySeconds < NIGHT_END) return 'night'
  return 'aftermath'
}

export function advanceTime(world: WorldState, realDt: number): void {
  const time = world.time
  time.daySeconds += realDt * time.timeScale
  if (time.daySeconds >= time.dayLengthSeconds) {
    time.daySeconds -= time.dayLengthSeconds
    time.dayIndex += 1
  }
  time.phase = phaseAt(time.daySeconds)
}
