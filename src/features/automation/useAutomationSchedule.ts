import { useCallback, useMemo, useState } from 'react'
import { defaultSchedule, normalizeTime, type AutomationSchedule } from './schedule'

const STORAGE_KEY = 'bilo-automation-schedule'

const readSchedule = (): AutomationSchedule => {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return defaultSchedule
  try {
    const parsed = JSON.parse(raw) as Partial<AutomationSchedule>
    return {
      enabled: parsed.enabled ?? defaultSchedule.enabled,
      time: normalizeTime(parsed.time ?? defaultSchedule.time),
      lastRunAt: parsed.lastRunAt ?? null,
      outputDir: parsed.outputDir ?? defaultSchedule.outputDir,
      runHistory: parsed.runHistory ?? defaultSchedule.runHistory,
    }
  } catch {
    return defaultSchedule
  }
}

export const useAutomationSchedule = () => {
  const [schedule, setSchedule] = useState<AutomationSchedule>(() => readSchedule())

  const update = useCallback((patch: Partial<AutomationSchedule>) => {
    setSchedule((current) => {
      const next = {
        ...current,
        ...patch,
        time: normalizeTime(patch.time ?? current.time),
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  return useMemo(
    () => ({
      schedule,
      update,
    }),
    [schedule, update],
  )
}
