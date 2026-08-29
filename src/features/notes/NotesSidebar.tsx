import { useEffect, useRef, useState } from 'react'
import type { Note, Section } from './model'

type NotesSidebarProps = {
  notes: Note[]
  sections: Section[]
  activeNoteId: string | null
  activeView: 'notes' | 'calendar' | 'settings'
  onSelectNote: (noteId: string) => void
  onDeleteNote: (noteId: string) => void
  onNewNote: (sectionId?: string | null) => void
  onNewSection: () => void
  onRenameSection: (id: string, name: string) => void
  onDeleteSection: (id: string) => void
  onToggleCalendar: (id: string) => void
  onMoveNote: (noteId: string, sectionId: string | null) => void
  onOpenCalendar: () => void
  onOpenSettings: () => void
  onOpenSearch: () => void
  sidebarPinned?: boolean
  onTogglePin?: () => void
  updateAvailable?: boolean
}

type NoteItemProps = {
  note: Note
  isActive: boolean
  sections: Section[]
  onSelect: () => void
  onDelete: () => void
  onMove: (sectionId: string | null) => void
}

const NoteItem = ({ note, isActive, sections, onSelect, onDelete, onMove }: NoteItemProps) => {
  const [showMove, setShowMove] = useState(false)

  return (
    <li className={isActive ? 'active' : ''}>
      <button type="button" className="note-select-btn" onClick={onSelect}>
        <strong>{note.title || 'Untitled'}</strong>
        <span>{new Date(note.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
      </button>

      <div className="note-item-actions">
        <button
          type="button"
          className="note-action-btn"
          onClick={() => setShowMove((v) => !v)}
          aria-label="Move to section"
          title="Move"
        >
          ⇄
        </button>
        <button
          type="button"
          className="note-action-btn danger"
          onClick={onDelete}
          aria-label="Delete note"
          title="Delete"
        >
          ×
        </button>
      </div>

      {showMove ? (
        <div className="move-popover">
          <button
            type="button"
            className={note.sectionId === null ? 'active' : ''}
            onClick={() => { onMove(null); setShowMove(false) }}
          >
            Unsorted
          </button>
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              className={note.sectionId === s.id ? 'active' : ''}
              onClick={() => { onMove(s.id); setShowMove(false) }}
            >
              {s.name}
            </button>
          ))}
        </div>
      ) : null}
    </li>
  )
}

type SectionHeaderProps = {
  section: Section
  collapsed: boolean
  onCollapse: () => void
  onRename: (name: string) => void
  onDelete: () => void
  onNewNote: () => void
  onToggleCalendar: () => void
}

const SectionHeader = ({ section, collapsed, onCollapse, onRename, onDelete, onNewNote, onToggleCalendar }: SectionHeaderProps) => {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(section.name)
  const [menuOpen, setMenuOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handleClick = (e: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  const commitRename = () => {
    setEditing(false)
    if (draft.trim() && draft.trim() !== section.name) {
      onRename(draft.trim())
    } else {
      setDraft(section.name)
    }
  }

  const startEditing = () => {
    setDraft(section.name)
    setEditing(true)
    setMenuOpen(false)
    requestAnimationFrame(() => inputRef.current?.select())
  }

  return (
    <div className="section-group-header" ref={headerRef}>
      {editing ? (
        <input
          ref={inputRef}
          className="section-name-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename()
            if (e.key === 'Escape') { setEditing(false); setDraft(section.name) }
          }}
          autoFocus
        />
      ) : (
        <button type="button" className="section-name-btn" onClick={onCollapse} onDoubleClick={startEditing}>
          <span className="section-chevron">{collapsed ? '▶' : '▼'}</span>
          {section.name}
        </button>
      )}

      <div className="section-header-actions">
        <button
          type="button"
          className="section-action-btn section-menu-btn"
          onClick={() => setMenuOpen((v) => !v)}
          title="Section options"
        >
          •••
        </button>
      </div>

      {menuOpen && (
        <div ref={menuRef} className="section-menu">
          <button type="button" onClick={() => { onNewNote(); setMenuOpen(false) }}>+ New note</button>
          <button type="button" onClick={() => { startEditing(); setMenuOpen(false) }}>Rename</button>
          <button
            type="button"
            className={`section-cal-btn ${section.showOnCalendar ? 'cal-on' : ''}`}
            onClick={() => { onToggleCalendar(); setMenuOpen(false) }}
          >
            {section.showOnCalendar ? '◈ Hide from calendar' : '◈ Show on calendar'}
          </button>
          <div className="section-menu-divider" />
          <button
            type="button"
            className="section-menu-delete"
            onClick={() => { onDelete(); setMenuOpen(false) }}
          >
            Delete section
          </button>
        </div>
      )}
    </div>
  )
}

export const NotesSidebar = ({
  notes,
  sections,
  activeNoteId,
  activeView,
  onSelectNote,
  onDeleteNote,
  onNewNote,
  onNewSection,
  onRenameSection,
  onDeleteSection,
  onToggleCalendar,
  onMoveNote,
  onOpenCalendar,
  onOpenSettings,
  onOpenSearch,
  sidebarPinned = false,
  onTogglePin,
  updateAvailable = false,
}: NotesSidebarProps) => {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const toggleCollapse = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const unsorted = notes.filter((n) => n.sectionId === null)

  return (
    <section className="notes-sidebar-section">
      <div className="sidebar-topbar">
        <div className="sidebar-view-tabs">
          <button
            type="button"
            className={`sidebar-tab ${activeView === 'notes' ? 'active' : ''}`}
            onClick={() => activeView !== 'notes' && onSelectNote(activeNoteId ?? '')}
          >
            Notes
          </button>
          <button
            type="button"
            className={`sidebar-tab ${activeView === 'calendar' ? 'active' : ''}`}
            onClick={onOpenCalendar}
          >
            Calendar
          </button>
        </div>
        <div className="sidebar-topbar-actions">
          <button type="button" className="sidebar-search-btn" onClick={onOpenSearch} title="Search (⌘K)" aria-label="Search">
            ⌕
          </button>
          <button
            type="button"
            className={`sidebar-icon-btn sidebar-pin-btn${sidebarPinned ? ' active' : ''}`}
            onClick={onTogglePin}
            title={sidebarPinned ? 'Unpin sidebar (keep floating)' : 'Pin sidebar open'}
            aria-label={sidebarPinned ? 'Unpin sidebar' : 'Pin sidebar'}
          >
            {sidebarPinned ? '▣' : '▤'}
          </button>
          <button type="button" className="new-note-btn" onClick={() => onNewNote(null)}>+</button>
        </div>
      </div>

      <div className="notes-scroll">
        {unsorted.length > 0 ? (
          <ul className="notes-list">
            {unsorted.map((note) => (
              <NoteItem
                key={note.id}
                note={note}
                isActive={note.id === activeNoteId}
                sections={sections}
                onSelect={() => onSelectNote(note.id)}
                onDelete={() => onDeleteNote(note.id)}
                onMove={(sectionId) => onMoveNote(note.id, sectionId)}
              />
            ))}
          </ul>
        ) : null}

        {sections.map((section) => {
          const sectionNotes = notes.filter((n) => n.sectionId === section.id)
          const isCollapsed = collapsed.has(section.id)
          return (
            <div key={section.id} className={`section-group ${isCollapsed ? 'collapsed' : ''}`}>
              <SectionHeader
                section={section}
                collapsed={isCollapsed}
                onCollapse={() => toggleCollapse(section.id)}
                onRename={(name) => onRenameSection(section.id, name)}
                onDelete={() => onDeleteSection(section.id)}
                onNewNote={() => onNewNote(section.id)}
                onToggleCalendar={() => onToggleCalendar(section.id)}
              />
              {!isCollapsed && (
                sectionNotes.length > 0 ? (
                  <ul className="notes-list">
                    {sectionNotes.map((note) => (
                      <NoteItem
                        key={note.id}
                        note={note}
                        isActive={note.id === activeNoteId}
                        sections={sections}
                        onSelect={() => onSelectNote(note.id)}
                        onDelete={() => onDeleteNote(note.id)}
                        onMove={(sectionId) => onMoveNote(note.id, sectionId)}
                      />
                    ))}
                  </ul>
                ) : (
                  <p className="section-empty">Empty</p>
                )
              )}
            </div>
          )
        })}
      </div>

      <div className="sidebar-footer">
        <button type="button" className="sidebar-footer-btn" onClick={onNewSection} title="New section">
          + Section
        </button>
        <button type="button" className="sidebar-footer-btn settings-gear" onClick={onOpenSettings} title={updateAvailable ? 'Settings — update available' : 'Settings'}>
          ⚙
          {updateAvailable && <span className="settings-gear-dot" aria-label="Update available" />}
        </button>
      </div>
    </section>
  )
}
