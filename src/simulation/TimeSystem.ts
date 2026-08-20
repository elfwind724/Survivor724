import type { DayPhase, TimeState, WorldState } from './types'

export const DAWN_END = 60
export const DAY_END = 60 + 11 * 60
export const DUSK_END = DAY_END + 90
export const NIGHT_END = DUSK_END + 6 * 60

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

export function secondsUntilDusk(world: WorldState): number {
  return Math.max(0, DAY_END - world.time.daySeconds)
}

export function duskWarningLevel(world: WorldState): 0 | 1 | 2 | 3 {
  if (world.time.phase === 'dusk') return 3
  if (world.time.phase !== 'dawn' && world.time.phase !== 'day') return 0
  const daySpan = DAY_END - DAWN_END
  const left = secondsUntilDusk(world) / daySpan
  if (left <= 0.05) return 3
  if (left <= 0.15) return 2
  if (left <= 0.3) return 1
  return 0
}

export function duskWarningText(level: 0 | 1 | 2 | 3): string {
  if (level === 1) return '第一次黄昏警告 · 远的人该往回走'
  if (level === 2) return '第二次黄昏警告 · 做完这下就回 · H召回'
  if (level === 3) return '第三次黄昏警告 · 立刻回营'
  return ''
}

export function phaseLabel(phase: DayPhase): string {
  if (phase === 'dawn') return '黎明'
  if (phase === 'day') return '白昼'
  if (phase === 'dusk') return '黄昏'
  if (phase === 'night') return '夜间'
  return '清场'
}

export function formatMmSs(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  return `${minutes}:${rest.toString().padStart(2, '0')}`
}

export function hudTimeCaption(world: WorldState): string {
  if (world.time.phase === 'dawn' || world.time.phase === 'day') {
    return `距黄昏 ${formatMmSs(secondsUntilDusk(world))}`
  }
  if (world.time.phase === 'dusk') return '日落回营'
  if (world.gameOver) return '基地沦陷'
  if (world.paused) return '沙盘暂停'
  if (world.time.phase === 'night') {
    return world.enemies.length > 0 ? `尸潮 ${world.enemies.length}` : '夜间值守'
  }
  if (world.nightReport?.outcome === 'won' && world.time.phase === 'aftermath') {
    return `守住了 · 击杀 ${world.nightReport.kills}`
  }
  return '清场休整'
}

export function duskStatus(etaSeconds: number, remaining: number): 'green' | 'yellow' | 'red' {
  if (remaining <= 0) return 'red'
  if (etaSeconds <= remaining * 0.55) return 'green'
  if (etaSeconds <= remaining) return 'yellow'
  return 'red'
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
