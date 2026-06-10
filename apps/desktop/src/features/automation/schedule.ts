export type RunHistoryEntry = {
  timestamp: number
  dateKey: string
  status: 'success' | 'failed'
  path?: string
  message?: string
  trigger: 'manual' | 'auto'
}

export type AutomationSchedule = {
  enabled: boolean
  time: string
  lastRunAt: number | null
  outputDir: string
  runHistory: RunHistoryEntry[]
}

export const defaultSchedule: AutomationSchedule = {
  enabled: true,
  time: '18:00',
  lastRunAt: null,
  outputDir: 'workspace/worklogs',
  runHistory: [],
}

export const formatLastRun = (timestamp: number | null): string =>
  timestamp ? new Date(timestamp).toLocaleString() : 'Never'

export const normalizeTime = (value: string): string => {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return defaultSchedule.time
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return defaultSchedule.time
  if (hours > 23 || minutes > 59) return defaultSchedule.time
  return `${`${hours}`.padStart(2, '0')}:${`${minutes}`.padStart(2, '0')}`
}

export const shouldRunNow = (
  now: Date,
  scheduleTime: string,
  lastRunAt: number | null,
) => {
  const current = `${`${now.getHours()}`.padStart(2, '0')}:${`${now.getMinutes()}`.padStart(2, '0')}`
  if (current !== scheduleTime) return false
  if (!lastRunAt) return true

  const last = new Date(lastRunAt)
  return !(
    last.getFullYear() === now.getFullYear() &&
    last.getMonth() === now.getMonth() &&
    last.getDate() === now.getDate() &&
    last.getHours() === now.getHours() &&
    last.getMinutes() === now.getMinutes()
  )
}
