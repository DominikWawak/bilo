import { useState } from 'react'
import type { Note, Section } from './model'

export type GroupingSuggestion = {
  noteId: string
  suggestedSectionName: string
  reason: string
}

type Props = {
  suggestions: GroupingSuggestion[]
  notes: Note[]
  sections: Section[]
  onApply: (accepted: GroupingSuggestion[]) => void
  onDismiss: () => void
}

export const GroupingPreview = ({ suggestions, notes, sections, onApply, onDismiss }: Props) => {
  const [accepted, setAccepted] = useState<Set<string>>(
    () => new Set(suggestions.map((s) => s.noteId)),
  )

  const toggle = (noteId: string) => {
    setAccepted((prev) => {
      const next = new Set(prev)
      if (next.has(noteId)) next.delete(noteId)
      else next.add(noteId)
      return next
    })
  }

  const handleApply = () => {
    onApply(suggestions.filter((s) => accepted.has(s.noteId)))
  }

  const getNote = (id: string) => notes.find((n) => n.id === id)
  const getCurrentSection = (sectionId: string | null) =>
    sectionId ? (sections.find((s) => s.id === sectionId)?.name ?? 'Unknown') : 'Unsorted'

  return (
    <div className="grouping-overlay">
      <div className="grouping-modal">
        <div className="grouping-header">
          <span>AI grouping suggestions</span>
          <div className="grouping-actions">
            <button
              type="button"
              className="grouping-btn"
              onClick={() => setAccepted(new Set(suggestions.map((s) => s.noteId)))}
            >
              Select all
            </button>
            <button
              type="button"
              className="grouping-btn"
              onClick={() => setAccepted(new Set())}
            >
              Deselect all
            </button>
          </div>
        </div>

        <div className="grouping-list">
          {suggestions.map((s) => {
            const note = getNote(s.noteId)
            if (!note) return null
            const isAccepted = accepted.has(s.noteId)
            return (
              <div
                key={s.noteId}
                className={`grouping-row ${isAccepted ? 'accepted' : 'skipped'}`}
                onClick={() => toggle(s.noteId)}
              >
                <span className="grouping-check">{isAccepted ? '✓' : '○'}</span>
                <div className="grouping-row-content">
                  <span className="grouping-note-title">{note.title || 'Untitled'}</span>
                  <span className="grouping-arrow">
                    {getCurrentSection(note.sectionId)} → <strong>{s.suggestedSectionName}</strong>
                  </span>
                  <span className="grouping-reason">{s.reason}</span>
                </div>
              </div>
            )
          })}
        </div>

        <div className="grouping-footer">
          <button type="button" className="grouping-apply" onClick={handleApply} disabled={accepted.size === 0}>
            Apply {accepted.size} move{accepted.size !== 1 ? 's' : ''}
          </button>
          <button type="button" className="grouping-discard" onClick={onDismiss}>
            Discard
          </button>
        </div>
      </div>
    </div>
  )
}
