import { useEffect } from 'react'
import { runAutoPush } from './autoSync'

const SETTINGS_CHANGED_EVENT = 'bilo:sync-settings-changed'

/**
 * Fire after the user saves sync settings so the auto-sync timer restarts with
 * the new interval.
 */
export function notifyAutoSyncSettingsChanged(): void {
  window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT))
}

/**
 * Runs a background push on the interval stored in `bilo-sync-interval`
 * ('manual' | '5' | '15' | '60' minutes). Reschedules itself whenever sync
 * settings are saved. Push-only — never auto-pulls.
 */
export function useAutoSync(): void {
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null

    const schedule = () => {
      if (timer) { clearInterval(timer); timer = null }
      const minutes = Number(localStorage.getItem('bilo-sync-interval') ?? 'manual')
      if (!Number.isFinite(minutes) || minutes <= 0) return // 'manual' — no timer
      timer = setInterval(() => { void runAutoPush().catch(() => { /* background: ignore */ }) }, minutes * 60_000)
    }

    schedule()
    window.addEventListener(SETTINGS_CHANGED_EVENT, schedule)
    return () => {
      if (timer) clearInterval(timer)
      window.removeEventListener(SETTINGS_CHANGED_EVENT, schedule)
    }
  }, [])
}
