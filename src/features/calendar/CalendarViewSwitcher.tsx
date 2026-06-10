import { useState } from 'react'
import type { Note } from '../notes/model'
import { toDateLabel } from './date'

const views = ['Day', 'Week', 'Month'] as const

type CalendarViewSwitcherProps = {
  selectedDateKey: string
  notes: Note[]
  activeNoteId: string | null
  onDateChange: (dateKey: string) => void
  onAssignActiveNoteToDate: () => void
}

export const CalendarViewSwitcher = ({
  selectedDateKey,
  notes,
  activeNoteId,
  onDateChange,
  onAssignActiveNoteToDate,
}: CalendarViewSwitcherProps) => {
  const [view, setView] = useState<(typeof views)[number]>('Week')
  const selectedDateNotes = notes.filter(
    (note) => note.linkedDateKey === selectedDateKey,
  )

  return (
    <section className="panel">
      <h2>Calendar</h2>
      <p>{toDateLabel(selectedDateKey)}</p>
      <input
        type="date"
        value={selectedDateKey}
        onChange={(event) => {
          if (event.target.value) onDateChange(event.target.value)
        }}
      />
      <div className="pill-row">
        {views.map((item) => (
          <button
            key={item}
            type="button"
            className={item === view ? 'active' : ''}
            onClick={() => setView(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <ul className="compact-list">
        <li>View: {view}</li>
        <li>Notes linked to day: {selectedDateNotes.length}</li>
      </ul>
      <button
        type="button"
        onClick={onAssignActiveNoteToDate}
        disabled={!activeNoteId}
      >
        Link active note to date
      </button>
    </section>
  )
}
