import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { SearchPalette } from './features/search/SearchPalette'
import { SettingsPanel } from './features/ai/SettingsPanel'
import { organizeNote, aiQuery, summarizeCursorChat, type NoteContext } from './features/ai/aiService'
import { useAIRuntimeSettings } from './features/ai/useAIRuntimeSettings'
import { CalendarView } from './features/calendar/CalendarView'
import { htmlToText, htmlFirstLine, markdownToHtml } from './features/notes/editorUtils'
import { EditorPane } from './features/notes/EditorPane'
import { NotesSidebar } from './features/notes/NotesSidebar'
import { createEmptyNote, createEmptySection, type Note } from './features/notes/model'
import { useNotesStore } from './features/notes/useNotesStore'
import { useSectionsStore } from './features/notes/useSectionsStore'
import { TaskStatusBar } from './features/tasks/TaskStatusBar'
import { useTaskQueue } from './features/tasks/useTaskQueue'
import { invoke } from '@tauri-apps/api/core'

type ActiveView = 'notes' | 'calendar' | 'settings'

type ChatConversation = {
  date: string
  file_name: string
  raw_summary: string
}

function App() {
  const { notes, upsertNote, removeNote, createNote } = useNotesStore()
  const { sections, createSection, renameSection, removeSection, toggleCalendar } = useSectionsStore()
  const { settings: aiSettings, update: updateAiSettings } = useAIRuntimeSettings()

  const { tasks, startTask, finishTask } = useTaskQueue()

  const [activeNoteId, setActiveNoteId] = useState<string | null>(() => {
    if (notes.length > 0) return notes[0].id
    // First launch — no notes yet; createNote runs after mount via useEffect below
    return null
  })
  const [activeView, setActiveView] = useState<ActiveView>('notes')
  const [organizePreviewBody, setOrganizePreviewBody] = useState<string | null>(null)
  const [organizeError, setOrganizeError] = useState<string | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [importProgress, setImportProgress] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarPinned, setSidebarPinned] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(280)
  const isResizing = useRef(false)

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isResizing.current = true
    const startX = e.clientX
    const startW = sidebarWidth
    const onMove = (ev: MouseEvent) => {
      if (!isResizing.current) return
      const next = Math.min(480, Math.max(200, startW + ev.clientX - startX))
      setSidebarWidth(next)
    }
    const onUp = () => {
      isResizing.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [sidebarWidth])
  const [searchOpen, setSearchOpen] = useState(false)

  const activeNote = useMemo(
    () => notes.find((note) => note.id === activeNoteId) ?? null,
    [activeNoteId, notes],
  )


  const calendarSectionIds = useMemo(
    () => new Set(sections.filter((s) => s.showOnCalendar).map((s) => s.id)),
    [sections],
  )
  const calendarNotes = useMemo(
    () => notes.filter((n) =>
      // Notes in calendar-enabled sections
      (n.sectionId !== null && calendarSectionIds.has(n.sectionId)) ||
      // Notes explicitly pinned to a calendar date via the + button
      n.linkedDateKey !== null
    ),
    [notes, calendarSectionIds],
  )

  // Shared AI settings object passed to all service calls
  const aiServiceSettings = useMemo(() => ({
    acpApiKey: aiSettings.acpApiKey,
    kiroApiKey: aiSettings.kiroApiKey,
    preferredAgent: aiSettings.preferredAgent,
  }), [aiSettings.acpApiKey, aiSettings.kiroApiKey, aiSettings.preferredAgent])

  const buildNoteContext = (): NoteContext => {
    const section = sections.find((s) => s.id === activeNote?.sectionId)
    const siblings = notes
      .filter((n) => n.sectionId === activeNote?.sectionId && n.id !== activeNote?.id)
      .slice(0, 3)
      .map((n) => ({ title: n.title || 'Untitled', snippet: htmlToText(n.body).slice(0, 120) }))
    return {
      sectionName: section?.name,
      siblingNotes: siblings.length ? siblings : undefined,
      personalContext: aiSettings.personalContext || undefined,
    }
  }

  const buildQueryContext = (): NoteContext => {
    // Only send the current note as context — keeps prompts short and responses fast
    const noteText = activeNote
      ? `${activeNote.title && activeNote.title !== 'Untitled' ? activeNote.title + '\n\n' : ''}${htmlToText(activeNote.body)}`
      : ''
    return {
      personalContext: aiSettings.personalContext || undefined,
      todayDate: new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
      allNotesSummary: noteText.trim() ? `Current note:\n${noteText.slice(0, 2000)}` : undefined,
    }
  }

  // Auto-create a note on first launch so the editor is never disabled
  useEffect(() => {
    if (notes.length === 0) {
      const note = createNote(null)
      setActiveNoteId(note.id)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onKeydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        const note = createNote(null)
        setActiveNoteId(note.id)
        setActiveView('notes')
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen((o) => !o)
      }
      if (event.key === 'Escape') {
        if (searchOpen) setSearchOpen(false)
        else if (activeView === 'settings') setActiveView('notes')
        else if (sidebarOpen) setSidebarOpen(false)
      }
    }
    window.addEventListener('keydown', onKeydown)
    return () => window.removeEventListener('keydown', onKeydown)
  }, [createNote, sidebarOpen, activeView, searchOpen])

  // Notify mounted components (e.g. DiagramNodeView) when a view becomes active
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('bilo:view-active', { detail: activeView }))
  }, [activeView])

  const handleNewNote = (sectionId?: string | null) => {
    const note = createNote(sectionId ?? null)
    setActiveNoteId(note.id)
    setActiveView('notes')
  }

  const handleNewNoteForDate = (dateKey: string) => {
    const note = createNote(null)
    upsertNote({ ...note, linkedDateKey: dateKey, calendarOnly: true })
    setActiveNoteId(note.id)
    setActiveView('notes')
  }

  const handleDeleteNote = (noteId: string) => {
    const deletingActive = noteId === activeNoteId
    removeNote(noteId)
    if (deletingActive) {
      const remaining = notes.filter((n) => n.id !== noteId)
      if (remaining.length > 0) {
        setActiveNoteId(remaining[0].id)
      } else {
        const note = createNote(null)
        setActiveNoteId(note.id)
      }
    }
  }

  const handleUpdateActiveNote = (patch: Partial<Note>) => {
    if (!activeNote) return
    const update: Partial<Note> = { ...patch }
    // Auto-derive title from body only when the caller hasn't set a title explicitly
    // AND the current title was itself auto-derived (i.e. it still matches the first line of the old body)
    if ('body' in patch && typeof patch.body === 'string' && !('title' in patch)) {
      const previouslyDerived = htmlFirstLine(activeNote.body)
      const titleWasAutoDerived =
        activeNote.title === 'Untitled' || activeNote.title === previouslyDerived
      if (titleWasAutoDerived) {
        const derived = htmlFirstLine(patch.body)
        update.title = derived || 'Untitled'
      }
    }
    upsertNote({ ...activeNote, ...update, updatedAt: Date.now() })
  }

  const handleMoveNote = (noteId: string, sectionId: string | null) => {
    const note = notes.find((n) => n.id === noteId)
    if (!note) return
    upsertNote({ ...note, sectionId, updatedAt: note.updatedAt })
  }

  const handleSelectNoteFromCalendar = (noteId: string) => {
    setActiveNoteId(noteId)
    setActiveView('notes')
    setSidebarOpen(false)
  }

  const dismissOrganize = () => {
    setOrganizePreviewBody(null)
    setOrganizeError(null)
  }

  const handleOrganizeRequest = async () => {
    if (!activeNote) return
    const plainText = htmlToText(activeNote.body)
    if (!plainText.trim()) return
    setOrganizeError(null)
    setOrganizePreviewBody('…')
    startTask('organize', 'AI — organizing note…')
    try {
      const result = await organizeNote(
        plainText,
        aiServiceSettings,
        buildNoteContext(),
      )
      setOrganizePreviewBody(result)
      finishTask('organize')
    } catch (e) {
      setOrganizePreviewBody(null)
      setOrganizeError(String(e).replace(/^Error:\s*/i, ''))
      finishTask('organize', 'Organize failed')
    }
  }

  const handleAcceptOrganize = () => {
    if (!activeNote || organizePreviewBody === null || organizePreviewBody === '…') return
    handleUpdateActiveNote({ body: markdownToHtml(organizePreviewBody) })
    setOrganizePreviewBody(null)
  }

  const handleAiQuery = async (question: string): Promise<string> => {
    // The /ai bar shows its own loading state — no task pill needed here
    return aiQuery(question, aiServiceSettings, buildQueryContext())
  }

  const handleImportCursor = async () => {
    if (isImporting) return
    const dir = aiSettings.cursorTranscriptsDir.trim() || '~/.cursor/projects'
    setIsImporting(true)
    startTask('import-cursor', 'Reading Cursor chats…')
    try {
      const conversations = await invoke<ChatConversation[]>('import_cursor_chats', { dir })
      if (!conversations.length) {
        finishTask('import-cursor', 'No conversations found')
        return
      }

      let cursorSection = sections.find((s) => s.name === 'Cursor')
      if (!cursorSection) {
        cursorSection = createEmptySection('Cursor')
        createSection('Cursor')
        cursorSection = { ...cursorSection, id: cursorSection.id }
      }

      for (let i = 0; i < conversations.length; i++) {
        const conv = conversations[i]
        startTask('import-cursor', `Summarizing ${i + 1} / ${conversations.length}…`)

        let bullets = conv.raw_summary
        if (aiSettings.acpApiKey) {
          try {
            bullets = await summarizeCursorChat(conv.raw_summary, aiServiceSettings)
          } catch { /* fall through */ }
        }

        const existingNote = notes.find((n) => n.linkedDateKey === conv.date && n.sectionId === cursorSection!.id)
        if (existingNote) continue

        const newNote = createNote(cursorSection!.id)
        upsertNote({
          ...newNote,
          title: `${conv.date} · Cursor session`,
          body: markdownToHtml(bullets),
          linkedDateKey: conv.date,
          updatedAt: Date.now(),
        })
      }
      finishTask('import-cursor')
      setImportProgress(`Imported ${conversations.length} conversation(s).`)
      setTimeout(() => setImportProgress(null), 3000)
    } catch (e) {
      finishTask('import-cursor', `Import failed: ${String(e)}`)
      setImportProgress(`Import failed: ${String(e)}`)
      setTimeout(() => setImportProgress(null), 5000)
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <main className={`app-shell${sidebarPinned ? ' sidebar-pinned' : ''}`}>
      <button
        type="button"
        className="corner-toggle"
        onClick={() => {
          if (sidebarPinned) { setSidebarPinned(false); setSidebarOpen(false) }
          else setSidebarOpen((open) => !open)
        }}
        aria-label="Toggle sidebar"
      >
        {(sidebarOpen || sidebarPinned) ? '✕' : '≡'}
      </button>

      <div
        className={`sidebar-backdrop ${sidebarOpen && !sidebarPinned ? 'visible' : ''}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      <aside
        className={`sidebar-drawer ${(sidebarOpen || sidebarPinned) ? 'open' : ''}`}
        style={{ width: sidebarWidth }}
      >
        <NotesSidebar
          notes={notes.filter((n) => !n.calendarOnly)}
          sections={sections}
          activeNoteId={activeNoteId}
          activeView={activeView}
          onSelectNote={(id) => { setActiveNoteId(id); setActiveView('notes'); if (!sidebarPinned) setSidebarOpen(false) }}
          onDeleteNote={handleDeleteNote}
          onNewNote={handleNewNote}
          onNewSection={() => createSection('Section')}
          onRenameSection={renameSection}
          onDeleteSection={removeSection}
          onToggleCalendar={toggleCalendar}
          onMoveNote={handleMoveNote}
          onOpenCalendar={() => { setActiveView('calendar'); if (!sidebarPinned) setSidebarOpen(false) }}
          onOpenSettings={() => { setActiveView('settings'); if (!sidebarPinned) setSidebarOpen(false) }}
          onOpenSearch={() => { setSearchOpen(true); if (!sidebarPinned) setSidebarOpen(false) }}
          sidebarPinned={sidebarPinned}
          onTogglePin={() => { setSidebarPinned(p => !p); setSidebarOpen(true) }}
        />
        {importProgress && (
          <div className="import-progress">{importProgress}</div>
        )}
        <div className="sidebar-resize-handle" onMouseDown={startResize} aria-hidden="true" />
      </aside>

      {searchOpen && (
        <SearchPalette
          notes={notes}
          sections={sections}
          onSelect={(id) => { setActiveNoteId(id); setActiveView('notes'); setSidebarOpen(false) }}
          onClose={() => setSearchOpen(false)}
        />
      )}

      <section className="workspace blank-sheet" data-view={activeView}>
        {activeView === 'settings' ? (
          <SettingsPanel
            settings={aiSettings}
            onUpdateSettings={updateAiSettings}
            onClose={() => setActiveView('notes')}
            onImportCursor={() => void handleImportCursor()}
            isImporting={isImporting}
            onNotesImported={() => window.location.reload()}
          />
        ) : (
          <>
            {/* Calendar — always mounted, hidden when not active */}
            <div style={{ display: activeView === 'calendar' ? 'contents' : 'none' }}>
              <CalendarView
                notes={calendarNotes}
                onSelectNote={handleSelectNoteFromCalendar}
                onClose={() => setActiveView('notes')}
                onNewNote={handleNewNoteForDate}
              />
            </div>

            {/* Editor — always mounted so AI state survives view switches */}
            <div style={{ display: activeView === 'notes' ? 'contents' : 'none' }}>
              {activeNote ? (
                <EditorPane
                  note={activeNote}
                  sections={sections}
                  aiSettings={aiServiceSettings}
                  personalContext={aiSettings.personalContext}
                  onBodyChange={(body) => handleUpdateActiveNote({ body })}
                  onTitleChange={(title) => handleUpdateActiveNote({ title: title.trim() || 'Untitled' })}
                  onOrganizeRequest={() => void handleOrganizeRequest()}
                  onAiQuery={handleAiQuery}
                  organizePreviewBody={organizePreviewBody}
                  organizeError={organizeError}
                  onAcceptOrganize={handleAcceptOrganize}
                  onDismissOrganize={dismissOrganize}
                />
              ) : (
                <EditorPane
                  key="empty"
                  note={createEmptyNote()}
                  sections={[]}
                  aiSettings={aiServiceSettings}
                  onBodyChange={() => undefined}
                  disabled
                />
              )}
            </div>
          </>
        )}
      </section>

      {/* Global background task indicator */}
      <TaskStatusBar tasks={tasks} />
    </main>
  )
}

export default App
