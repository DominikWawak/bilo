import { useEffect, useMemo, useRef, useState } from 'react'
import type { Note } from '../notes/model'
import { htmlSnippet } from '../notes/editorUtils'

// A calendar entry — either a plain note, a log block, or a @reminder
type CalEntry = {
  noteId: string
  title: string
  snippet: string
  logHeading?: string   // set when this entry comes from a /log block inside a note
  isReminder?: boolean  // set when this is a @reminder badge
  reminderTime?: string // HH:MM for reminder entries
}

/** Parse @reminder badges from a note body — returns {date, label} pairs */
function extractReminders(body: string): Array<{ date: string; label: string }> {
  try {
    const doc = new DOMParser().parseFromString(body, 'text/html')
    const badges = doc.querySelectorAll('[data-reminder="true"]')
    const results: Array<{ date: string; label: string }> = []
    for (const badge of Array.from(badges)) {
      const isoDate = badge.getAttribute('data-date') ?? ''
      if (!isoDate) continue
      try {
        const d = new Date(isoDate)
        if (Number.isNaN(d.getTime())) continue
        const dateKey = dk(d)
        const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        const label = (badge.textContent ?? '').replace(/^@/, '').trim()
        results.push({ date: dateKey, label: label || timeStr })
      } catch { /* skip malformed */ }
    }
    return results
  } catch {
    return []
  }
}

/** Parse all /log blocks from a note body and return {date, heading, snippet} tuples */
function extractLogBlocks(body: string): Array<{ date: string; heading: string; snippet: string }> {
  try {
    const doc = new DOMParser().parseFromString(body, 'text/html')
    const blocks = doc.querySelectorAll('div[data-log-block]')
    const results: Array<{ date: string; heading: string; snippet: string }> = []
    for (const block of Array.from(blocks)) {
      const date = block.getAttribute('data-log-date') ?? ''
      if (!date) continue
      const headingEl = block.querySelector('h1,h2,h3,p')
      const heading = headingEl?.textContent?.trim() ?? ''
      // snippet = remaining paragraphs after the heading
      const allText = Array.from(block.querySelectorAll('p, li'))
        .map((el) => el.textContent?.trim() ?? '')
        .filter(Boolean)
        .join(' · ')
      const snippet = allText.slice(0, 120) + (allText.length > 120 ? '…' : '')
      results.push({ date, heading, snippet })
    }
    return results
  } catch {
    return []
  }
}

type CalView = 'year' | 'month' | 'week' | 'day'
const VIEW_ORDER: CalView[] = ['day', 'week', 'month', 'year']

// ── Date helpers ──────────────────────────────────────────────────────────────

const dk = (d: Date): string => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const today = (): string => dk(new Date())

const startOfWeek = (d: Date): Date => {
  const copy = new Date(d)
  copy.setHours(0, 0, 0, 0)
  const dow = copy.getDay() // 0=Sun
  copy.setDate(copy.getDate() - (dow === 0 ? 6 : dow - 1))
  return copy
}

const addDays = (d: Date, n: number): Date => {
  const copy = new Date(d)
  copy.setDate(copy.getDate() + n)
  return copy
}

const monthGridDays = (year: number, month: number): Date[] => {
  const first = new Date(year, month, 1)
  const dow = first.getDay()
  const offset = dow === 0 ? 6 : dow - 1
  const start = new Date(year, month, 1 - offset)
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  notes: Note[]
  onSelectNote: (id: string) => void
  onClose: () => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export const CalendarView = ({ notes, onSelectNote, onClose }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(900)
  const [manualView, setManualView] = useState<CalView | null>(null)
  const [cursor, setCursor] = useState(() => new Date())

  // Auto view from container width (year never auto-selects)
  const autoView: CalView =
    containerWidth >= 760 ? 'month' : containerWidth >= 460 ? 'week' : 'day'

  // Effective view: manual overrides auto; year is always manual
  const autoIdx = VIEW_ORDER.indexOf(autoView)
  const manualIdx = manualView ? VIEW_ORDER.indexOf(manualView) : autoIdx
  const effectiveIdx = manualView === 'year' ? VIEW_ORDER.indexOf('year') : Math.min(manualIdx, autoIdx)
  const view: CalView = VIEW_ORDER[effectiveIdx]

  const canZoomIn = effectiveIdx > 0
  const canZoomOut = true // always allow zoom-out to year

  const zoomIn = () => setManualView(VIEW_ORDER[Math.max(0, effectiveIdx - 1)])
  const zoomOut = () => {
    const next = effectiveIdx + 1
    if (next >= VIEW_ORDER.length) return
    setManualView(VIEW_ORDER[next])
  }

  // Resize observer
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Group notes by date key — log blocks get their own calendar entries
  const entriesByDate = useMemo(() => {
    const map = new Map<string, CalEntry[]>()

    const add = (dateKey: string, entry: CalEntry) => {
      const arr = map.get(dateKey) ?? []
      arr.push(entry)
      map.set(dateKey, arr)
    }

    for (const note of notes) {
      const logBlocks = extractLogBlocks(note.body)
      if (logBlocks.length > 0) {
        for (const { date, heading, snippet } of logBlocks) {
          add(date, { noteId: note.id, title: note.title || 'Untitled', logHeading: heading, snippet })
        }
      } else {
        const key = note.linkedDateKey ?? dk(new Date(note.updatedAt))
        const snippet = htmlSnippet(note.body, 120)
        add(key, { noteId: note.id, title: note.title || 'Untitled', snippet })
      }

      // Also add any @reminder badges as separate calendar entries
      const reminders = extractReminders(note.body)
      for (const { date, label } of reminders) {
        add(date, {
          noteId: note.id,
          title: note.title || 'Untitled',
          snippet: `Reminder: ${label}`,
          isReminder: true,
          reminderTime: label,
        })
      }
    }
    return map
  }, [notes])

  // Navigation
  const navigate = (dir: -1 | 1) => {
    setCursor((prev) => {
      const d = new Date(prev)
      if (view === 'year') d.setFullYear(d.getFullYear() + dir)
      else if (view === 'month') d.setMonth(d.getMonth() + dir)
      else if (view === 'week') d.setDate(d.getDate() + dir * 7)
      else d.setDate(d.getDate() + dir)
      return d
    })
  }

  const goToday = () => setCursor(new Date())

  // Period label
  const periodLabel = (() => {
    if (view === 'year') return `${cursor.getFullYear()}`
    if (view === 'month') return `${MONTH_NAMES[cursor.getMonth()]} ${cursor.getFullYear()}`
    if (view === 'week') {
      const ws = startOfWeek(cursor)
      const we = addDays(ws, 6)
      if (ws.getMonth() === we.getMonth()) {
        return `${MONTH_NAMES[ws.getMonth()]} ${ws.getDate()}–${we.getDate()}, ${ws.getFullYear()}`
      }
      return `${MONTH_NAMES[ws.getMonth()]} ${ws.getDate()} – ${MONTH_NAMES[we.getMonth()]} ${we.getDate()}, ${we.getFullYear()}`
    }
    return `${DAY_LABELS[(cursor.getDay() + 6) % 7]}, ${MONTH_NAMES[cursor.getMonth()]} ${cursor.getDate()}, ${cursor.getFullYear()}`
  })()

  const todayKey = today()

  return (
    <div className="cal-root" ref={containerRef}>
      {/* Header */}
      <div className="cal-header">
        <button type="button" className="cal-back-btn" onClick={onClose}>
          ← Notes
        </button>

        <div className="cal-nav">
          <button type="button" className="cal-nav-btn" onClick={() => navigate(-1)}>‹</button>
          <span className="cal-period">{periodLabel}</span>
          <button type="button" className="cal-nav-btn" onClick={() => navigate(1)}>›</button>
        </div>

        <div className="cal-controls">
          <button type="button" className="cal-today-btn" onClick={goToday}>Today</button>
          <div className="cal-zoom">
            <button
              type="button"
              className="cal-zoom-btn"
              onClick={zoomOut}
              disabled={!canZoomOut}
              title="Zoom out to month"
            >−</button>
            <span className="cal-view-label">{view}</span>
            <button
              type="button"
              className="cal-zoom-btn"
              onClick={zoomIn}
              disabled={!canZoomIn}
              title="Zoom in to day"
            >+</button>
          </div>
          {view !== 'month' && (
            <button
              type="button"
              className="cal-month-btn"
              onClick={() => setManualView(null)}
              title="Back to month"
            >month</button>
          )}
        </div>
      </div>

      {/* Calendar body */}
      <div className="cal-body">
        {view === 'year' && (
          <YearView
            cursor={cursor}
            entriesByDate={entriesByDate}
            todayKey={todayKey}
            onClickMonth={(d) => { setCursor(d); setManualView('month') }}
          />
        )}
        {view === 'month' && (
          <MonthView
            cursor={cursor}
            entriesByDate={entriesByDate}
            todayKey={todayKey}
            onSelectNote={onSelectNote}
            onClickDay={(d) => { setCursor(d); setManualView('day') }}
          />
        )}
        {view === 'week' && (
          <WeekView
            cursor={cursor}
            entriesByDate={entriesByDate}
            todayKey={todayKey}
            onSelectNote={onSelectNote}
            onClickDay={(d) => { setCursor(d); setManualView('day') }}
          />
        )}
        {view === 'day' && (
          <DayView
            cursor={cursor}
            entriesByDate={entriesByDate}
            todayKey={todayKey}
            onSelectNote={onSelectNote}
          />
        )}
      </div>
    </div>
  )
}

// ── Year view ─────────────────────────────────────────────────────────────────

type YearViewProps = {
  cursor: Date
  entriesByDate: Map<string, CalEntry[]>
  todayKey: string
  onClickMonth: (d: Date) => void
}

const YearView = ({ cursor, entriesByDate, todayKey, onClickMonth }: YearViewProps) => {
  const year = cursor.getFullYear()
  const todayYear = parseInt(todayKey.slice(0, 4))
  const todayMonth = parseInt(todayKey.slice(5, 7)) - 1

  return (
    <div className="cal-year-grid">
      {MONTH_NAMES.map((name, monthIdx) => {
        const days = monthGridDays(year, monthIdx)
        // Count entries for this month
        let dotCount = 0
        days.forEach(d => {
          if (d.getMonth() === monthIdx) {
            const key = dk(d)
            if (entriesByDate.has(key)) dotCount += entriesByDate.get(key)!.length
          }
        })
        const isCurrentMonth = year === todayYear && monthIdx === todayMonth
        return (
          <button
            key={name}
            type="button"
            className={`cal-year-month${isCurrentMonth ? ' cal-year-month--today' : ''}`}
            onClick={() => onClickMonth(new Date(year, monthIdx, 1))}
          >
            <div className="cal-year-month-name">{name}</div>
            <div className="cal-year-mini">
              {['M','T','W','T','F','S','S'].map((d, i) => (
                <span key={i} className="cal-year-dow">{d}</span>
              ))}
              {days.map((day, i) => {
                const inMonth = day.getMonth() === monthIdx
                const key = dk(day)
                const hasEntry = inMonth && entriesByDate.has(key)
                const isToday = key === todayKey
                return (
                  <span
                    key={i}
                    className={`cal-year-day${!inMonth ? ' cal-year-day--out' : ''}${isToday ? ' cal-year-day--today' : ''}${hasEntry ? ' cal-year-day--has' : ''}`}
                  >
                    {inMonth ? day.getDate() : ''}
                  </span>
                )
              })}
            </div>
            {dotCount > 0 && (
              <div className="cal-year-count">{dotCount} {dotCount === 1 ? 'entry' : 'entries'}</div>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ── Month view ────────────────────────────────────────────────────────────────

type MonthViewProps = {
  cursor: Date
  entriesByDate: Map<string, CalEntry[]>
  todayKey: string
  onSelectNote: (id: string) => void
  onClickDay: (d: Date) => void
}

const MonthView = ({ cursor, entriesByDate, todayKey, onSelectNote, onClickDay }: MonthViewProps) => {
  const days = monthGridDays(cursor.getFullYear(), cursor.getMonth())
  const curMonth = cursor.getMonth()

  return (
    <div className="cal-month">
      <div className="cal-weekday-row">
        {DAY_LABELS.map((d) => <span key={d} className="cal-weekday">{d}</span>)}
      </div>
      <div className="cal-month-grid">
        {days.map((d) => {
          const key = dk(d)
          const dayEntries = entriesByDate.get(key) ?? []
          const isToday = key === todayKey
          const isCurrentMonth = d.getMonth() === curMonth
          const overflow = dayEntries.length > 3 ? dayEntries.length - 3 : 0

          return (
            <div
              key={key}
              className={[
                'cal-day-cell',
                isToday ? 'cal-today' : '',
                !isCurrentMonth ? 'cal-other-month' : '',
              ].join(' ')}
              onClick={() => onClickDay(d)}
            >
              <span className="cal-day-num">{d.getDate()}</span>
              <div className="cal-day-notes">
                {dayEntries.slice(0, 3).map((e, i) => (
                  <button
                    key={`${e.noteId}-${i}`}
                    type="button"
                    className={`cal-note-pill${e.logHeading ? ' cal-log-pill' : ''}${e.isReminder ? ' cal-reminder-pill' : ''}`}
                    onClick={(ev) => { ev.stopPropagation(); onSelectNote(e.noteId) }}
                    title={e.isReminder ? `🔔 ${e.reminderTime}` : e.logHeading ? `${e.title} — ${e.logHeading}` : e.title}
                  >
                    {e.isReminder ? `🔔 ${e.reminderTime}` : e.logHeading ? `◈ ${e.logHeading}` : e.title}
                  </button>
                ))}
                {overflow > 0 && (
                  <span className="cal-overflow">+{overflow} more</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Week view ─────────────────────────────────────────────────────────────────

type WeekViewProps = {
  cursor: Date
  entriesByDate: Map<string, CalEntry[]>
  todayKey: string
  onSelectNote: (id: string) => void
  onClickDay: (d: Date) => void
}

const WeekView = ({ cursor, entriesByDate, todayKey, onSelectNote, onClickDay }: WeekViewProps) => {
  const ws = startOfWeek(cursor)
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i))

  return (
    <div className="cal-week">
      {days.map((d, i) => {
        const key = dk(d)
        const dayEntries = entriesByDate.get(key) ?? []
        const isToday = key === todayKey

        return (
          <div
            key={key}
            className={['cal-week-col', isToday ? 'cal-today' : ''].join(' ')}
            onClick={() => onClickDay(d)}
          >
            <div className="cal-week-col-header">
              <span className="cal-weekday">{DAY_LABELS[i]}</span>
              <span className={['cal-week-day-num', isToday ? 'cal-today-num' : ''].join(' ')}>
                {d.getDate()}
              </span>
            </div>
            <div className="cal-week-notes">
              {dayEntries.map((e, idx) => (
                <button
                  key={`${e.noteId}-${idx}`}
                  type="button"
                  className={`cal-note-block${e.logHeading ? ' cal-log-block' : ''}${e.isReminder ? ' cal-reminder-block' : ''}`}
                  onClick={(ev) => { ev.stopPropagation(); onSelectNote(e.noteId) }}
                >
                  <span className="cal-block-title">
                    {e.isReminder
                      ? <><span className="cal-reminder-icon">🔔</span> {e.reminderTime}</>
                      : e.logHeading
                        ? <><span className="cal-log-marker">◈</span> {e.logHeading}</>
                        : e.title}
                  </span>
                  {e.snippet && !e.isReminder && (
                    <span className="cal-block-snippet">{e.snippet}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Day view ──────────────────────────────────────────────────────────────────

type DayViewProps = {
  cursor: Date
  entriesByDate: Map<string, CalEntry[]>
  todayKey: string
  onSelectNote: (id: string) => void
}

const DayEntryCard = ({ entry, onSelectNote }: { entry: CalEntry; onSelectNote: (id: string) => void }) => {
  const [expanded, setExpanded] = useState(false)
  const hasSnippet = Boolean(entry.snippet) && !entry.isReminder

  const title = entry.isReminder
    ? <><span>🔔</span> {entry.reminderTime}</>
    : entry.logHeading
      ? <><span className="cal-log-marker">◈</span> {entry.logHeading || entry.title}</>
      : entry.title

  const cardClass = [
    'cal-day-card',
    entry.logHeading ? 'cal-log-entry' : '',
    entry.isReminder ? 'cal-reminder-entry' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={cardClass}>
      <div className="cal-day-card-header">
        <button
          type="button"
          className="cal-day-card-title-btn"
          onClick={() => onSelectNote(entry.noteId)}
        >
          {title}
        </button>
        {hasSnippet && (
          <button
            type="button"
            className="cal-day-card-toggle"
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? 'Collapse' : 'Preview'}
          >
            {expanded ? '▲' : '▼'}
          </button>
        )}
      </div>
      {expanded && hasSnippet && (
        <div className="cal-day-card-synopsis">
          {entry.snippet}
          <button
            type="button"
            className="cal-day-card-open-btn"
            onClick={() => onSelectNote(entry.noteId)}
          >
            Open note →
          </button>
        </div>
      )}
    </div>
  )
}

const DayView = ({ cursor, entriesByDate, todayKey, onSelectNote }: DayViewProps) => {
  const key = dk(cursor)
  const dayEntries = entriesByDate.get(key) ?? []
  const isToday = key === todayKey

  return (
    <div className="cal-day">
      <div className={['cal-day-header', isToday ? 'cal-today' : ''].join(' ')}>
        <span className="cal-day-full-label">
          {DAY_LABELS[(cursor.getDay() + 6) % 7]}, {MONTH_NAMES[cursor.getMonth()]} {cursor.getDate()}
        </span>
        {isToday && <span className="cal-today-badge">Today</span>}
      </div>
      <div className="cal-day-list">
        {dayEntries.length === 0 ? (
          <p className="cal-empty">No entries on this day</p>
        ) : (
          dayEntries.map((e, i) => (
            <DayEntryCard key={`${e.noteId}-${i}`} entry={e} onSelectNote={onSelectNote} />
          ))
        )}
      </div>
    </div>
  )
}
