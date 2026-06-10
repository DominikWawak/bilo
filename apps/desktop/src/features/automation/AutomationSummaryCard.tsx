import { useCallback, useEffect, useRef, useState } from 'react'
import { writeWorklogFile } from '../ai/runtimeApi'
import { toDateKey } from '../calendar/date'
import type { Note } from '../notes/model'
import { formatLastRun, shouldRunNow, type RunHistoryEntry } from './schedule'
import { useAutomationSchedule } from './useAutomationSchedule'
import { buildWorklogMarkdown } from './worklog'

type AutomationSummaryCardProps = {
  selectedDateKey: string
  notes: Note[]
}

export const AutomationSummaryCard = ({
  selectedDateKey,
  notes,
}: AutomationSummaryCardProps) => {
  const { schedule, update } = useAutomationSchedule()
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [historyFilter, setHistoryFilter] = useState<'all' | 'success' | 'failed'>(
    'all',
  )
  const autoRunInFlightRef = useRef(false)
  const linkedNotes = notes.filter((note) => note.linkedDateKey === selectedDateKey)
  const filteredHistory = schedule.runHistory
    .filter((entry) => historyFilter === 'all' || entry.status === historyFilter)
    .slice(0, 8)

  const saveWorklog = useCallback(
    async (dateKey: string, inputNotes: Note[], trigger: 'manual' | 'auto') => {
      const markdown = buildWorklogMarkdown(dateKey, inputNotes)
      const now = Date.now()

      try {
        const path = await writeWorklogFile(dateKey, markdown, schedule.outputDir)
        const entry: RunHistoryEntry = {
          timestamp: now,
          dateKey,
          status: 'success',
          path,
          trigger,
        }
        update({
          lastRunAt: now,
          runHistory: [entry, ...schedule.runHistory].slice(0, 20),
        })
        setStatusMessage(`Worklog saved: ${path}`)
        return
      } catch (error) {
        if (trigger === 'manual') {
          const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
          const url = URL.createObjectURL(blob)
          const anchor = document.createElement('a')
          anchor.href = url
          anchor.download = `${dateKey}.worklog.md`
          anchor.click()
          URL.revokeObjectURL(url)
        }

        const message = String(error)
        const entry: RunHistoryEntry = {
          timestamp: now,
          dateKey,
          status: 'failed',
          message,
          trigger,
        }
        update({
          runHistory: [entry, ...schedule.runHistory].slice(0, 20),
        })
        setStatusMessage(
          trigger === 'manual'
            ? `File write failed, downloaded instead. ${message}`
            : `Auto-run failed: ${message}`,
        )
      }
    },
    [schedule.outputDir, schedule.runHistory, update],
  )

  const checkAndRunAuto = useCallback(() => {
    if (!schedule.enabled) return
    if (autoRunInFlightRef.current) return

    const now = new Date()
    if (!shouldRunNow(now, schedule.time, schedule.lastRunAt)) return

    autoRunInFlightRef.current = true
    const todayKey = toDateKey(now)
    const todayNotes = notes.filter((note) => note.linkedDateKey === todayKey)
    void saveWorklog(todayKey, todayNotes, 'auto').finally(() => {
      autoRunInFlightRef.current = false
    })
  }, [notes, saveWorklog, schedule.enabled, schedule.lastRunAt, schedule.time])

  useEffect(() => {
    const startupCheck = window.setTimeout(() => checkAndRunAuto(), 0)

    const timer = window.setInterval(checkAndRunAuto, 30_000)
    const onFocus = () => checkAndRunAuto()
    const onVisibility = () => {
      if (!document.hidden) checkAndRunAuto()
    }

    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      window.clearTimeout(startupCheck)
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [checkAndRunAuto])

  const handleExport = () => {
    void saveWorklog(selectedDateKey, linkedNotes, 'manual')
  }

  const handleClearHistory = () => {
    update({ runHistory: [] })
  }

  return (
    <section className="panel">
      <h2>Automation</h2>
      <p>Daily worklog generator baseline.</p>
      <label className="field-label">
        <span>Schedule time</span>
        <input
          type="time"
          value={schedule.time}
          onChange={(event) => update({ time: event.target.value })}
        />
      </label>
      <label className="field-checkbox">
        <input
          type="checkbox"
          checked={schedule.enabled}
          onChange={(event) => update({ enabled: event.target.checked })}
        />
        <span>Enable daily summary automation</span>
      </label>
      <label className="field-label">
        <span>Output dir</span>
        <input
          type="text"
          value={schedule.outputDir}
          onChange={(event) => update({ outputDir: event.target.value })}
        />
      </label>
      <ul className="compact-list">
        <li>Target time: {schedule.time}</li>
        <li>Automation: {schedule.enabled ? 'enabled' : 'disabled'}</li>
        <li>Last run: {formatLastRun(schedule.lastRunAt)}</li>
        <li>Linked notes: {linkedNotes.length}</li>
        <li>Output format: Markdown worklog</li>
      </ul>
      <button type="button" onClick={handleExport}>
        Export daily worklog
      </button>
      {statusMessage ? <p>{statusMessage}</p> : null}
      <div className="history-controls">
        <select
          value={historyFilter}
          onChange={(event) =>
            setHistoryFilter(event.target.value as 'all' | 'success' | 'failed')
          }
        >
          <option value="all">All runs</option>
          <option value="success">Success only</option>
          <option value="failed">Failed only</option>
        </select>
        <button type="button" onClick={handleClearHistory}>
          Clear history
        </button>
      </div>
      <ul className="compact-list">
        {filteredHistory.map((entry) => (
          <li key={`${entry.timestamp}-${entry.trigger}-${entry.status}`}>
            {new Date(entry.timestamp).toLocaleTimeString()} {entry.trigger} {entry.status}
            {entry.path ? ` (${entry.path})` : ''}
          </li>
        ))}
      </ul>
    </section>
  )
}
