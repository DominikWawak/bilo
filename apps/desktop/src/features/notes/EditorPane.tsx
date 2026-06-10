import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { TiptapEditor } from './TiptapEditor'
import { htmlToText, markdownToHtml, aiResponseToTiptapHtml } from './editorUtils'
import type { Note, Section } from './model'
import type { AIServiceSettings } from '../ai/aiService'

type EnhanceContext = { text: string; from: number; to: number }

const formatNoteDate = (timestamp: number): string => {
  const d = new Date(timestamp)
  const date = d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  return `${date} · ${time}`
}

type EditorPaneProps = {
  note: Note
  sections: Section[]
  aiSettings: AIServiceSettings
  personalContext?: string
  onBodyChange: (value: string) => void
  onTitleChange?: (title: string) => void
  onOrganizeRequest?: () => void
  onAiQuery?: (question: string) => Promise<string>
  organizePreviewBody?: string | null
  organizeError?: string | null
  onAcceptOrganize?: () => void
  onDismissOrganize?: () => void
  disabled?: boolean
}


/* ── AI Query Bar ──────────────────────────────────────────────── */

type AIQueryBarProps = {
  onSubmit: (q: string) => void
  onClose: () => void
  isLoading: boolean
  enhanceCtx?: EnhanceContext | null
}

const AIQueryBar = ({ onSubmit, onClose, isLoading, enhanceCtx }: AIQueryBarProps) => {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && value.trim()) {
      e.preventDefault()
      onSubmit(value.trim())
    }
    if (e.key === 'Escape') {
      onClose()
    }
  }

  const snippet = enhanceCtx
    ? (enhanceCtx.text.length > 60 ? enhanceCtx.text.slice(0, 60) + '…' : enhanceCtx.text)
    : null

  return (
    <div className={`ai-query-bar${isLoading ? ' ai-query-bar--loading' : ''}${enhanceCtx ? ' ai-query-bar--enhance' : ''}`}>
      <span className="ai-query-prompt">{enhanceCtx ? '✦' : '/ai'}</span>
      {snippet && !isLoading && (
        <span className="ai-query-context-chip" title={enhanceCtx?.text}>"{snippet}"</span>
      )}
      <input
        ref={inputRef}
        autoFocus
        type="text"
        className="ai-query-input"
        placeholder={isLoading ? '' : enhanceCtx ? 'What should I do with this? (↵ send · Esc close)' : 'Ask about your notes… (↵ send · Esc close)'}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isLoading}
      />
      {isLoading ? (
        <button
          type="button"
          className="ai-query-cancel"
          onClick={onClose}
          title="Cancel (Esc)"
        >
          Cancel
        </button>
      ) : (
        <button type="button" className="ai-query-close" onClick={onClose} title="Close (Esc)">✕</button>
      )}
    </div>
  )
}

/* ── EditorPane ────────────────────────────────────────────────── */

export const EditorPane = ({
  note,
  sections: _sections,
  aiSettings,
  personalContext,
  onBodyChange,
  onTitleChange,
  onOrganizeRequest,
  onAiQuery,
  organizePreviewBody = null,
  organizeError = null,
  onAcceptOrganize,
  onDismissOrganize,
  disabled = false,
}: EditorPaneProps) => {
  const editorRef = useRef<Editor | null>(null)
  const titleInputRef = useRef<HTMLTextAreaElement>(null)
  const [aiQueryOpen, setAiQueryOpen] = useState(false)
  const [aiQueryLoading, setAiQueryLoading] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [aiAnswer, setAiAnswer] = useState<string | null>(null)
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const findInputRef = useRef<HTMLInputElement>(null)
  const [localTitle, setLocalTitle] = useState(note.title === 'Untitled' ? '' : note.title)
  // Enhance context: set when user clicks Enhance on a selection
  const [enhanceCtx, setEnhanceCtx] = useState<EnhanceContext | null>(null)

  // When the active note changes: sync title and clear stale positional enhance context.
  // We intentionally keep aiQueryLoading/aiAnswer alive so the user can come back
  // to the result after switching notes and back.
  useEffect(() => {
    setLocalTitle(note.title === 'Untitled' ? '' : note.title)
    // Positional context (from/to) is specific to the previous note's editor — clear it
    setEnhanceCtx(null)
    // Close the find bar if open
    setFindOpen(false)
    setFindQuery('')
  }, [note.id])

  useEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        e.stopPropagation()
        setFindOpen(true)
        setTimeout(() => findInputRef.current?.select(), 30)
      }
      if (e.key === 'Escape' && findOpen) {
        setFindOpen(false)
        setFindQuery('')
      }
    }
    window.addEventListener('keydown', onKeydown, true)
    return () => window.removeEventListener('keydown', onKeydown, true)
  }, [findOpen])

  const doFind = useCallback((q: string, backwards = false) => {
    if (!q) return
    // @ts-expect-error window.find is non-standard but works in Chromium/WebKit
    window.find(q, false, backwards, true, false, true, false)
  }, [])

  const closeFindBar = () => {
    setFindOpen(false)
    setFindQuery('')
    editorRef.current?.commands.focus()
  }

  const handleWheel = useCallback((e: React.WheelEvent<HTMLElement>) => {
    if (!e.ctrlKey) return
    e.preventDefault()
    setZoom((prev) => Math.min(2.5, Math.max(0.5, prev - e.deltaY * 0.002)))
  }, [])


  const handleAiQuerySubmit = async (question: string) => {
    if (!onAiQuery) return
    setAiQueryLoading(true)
    setAiAnswer(null)
    const ctx = enhanceCtx
    try {
      // Prepend selected text as context when enhancing a selection
      const fullQuestion = ctx
        ? `Selected text:\n"""\n${ctx.text}\n"""\n\nInstruction: ${question}`
        : question
      const answer = await onAiQuery(fullQuestion)
      setAiAnswer(answer.trim())
    } catch (e) {
      setAiAnswer(`Error: ${String(e)}`)
    } finally {
      setAiQueryLoading(false)
      setAiQueryOpen(false)
    }
  }

  const closeAiQuery = () => {
    setAiQueryOpen(false)
    setEnhanceCtx(null)
    setAiQueryLoading(false)
  }

  const insertAiAnswer = () => {
    if (!aiAnswer) return
    const editor = editorRef.current
    if (editor) {
      const html = aiResponseToTiptapHtml(aiAnswer)
      editor.chain().focus('end').insertContent(html).run()
    }
    setAiAnswer(null)
    setEnhanceCtx(null)
  }

  const replaceWithAiAnswer = () => {
    if (!aiAnswer || !enhanceCtx) return
    const editor = editorRef.current
    if (editor) {
      const { from, to } = enhanceCtx
      const html = aiResponseToTiptapHtml(aiAnswer)
      // setTextSelection re-selects the original range, then insertContent
      // replaces the active selection with the new content in one atomic op
      editor
        .chain()
        .focus()
        .setTextSelection({ from, to })
        .insertContent(html)
        .run()
    }
    setAiAnswer(null)
    setEnhanceCtx(null)
  }

  return (
    <section className="editor-pane minimal" onWheel={handleWheel}>
      {/* Scrollable writing surface */}
      <div className="editor-scroll">
        {/* In-note find bar (Cmd+F) */}
        {findOpen && (
          <div className="note-find-bar">
            <input
              ref={findInputRef}
              className="note-find-input"
              placeholder="Find in note…"
              value={findQuery}
              autoFocus
              onChange={(e) => {
                setFindQuery(e.target.value)
                if (e.target.value) doFind(e.target.value)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  doFind(findQuery, e.shiftKey)
                }
                if (e.key === 'Escape') closeFindBar()
              }}
            />
            <button type="button" className="note-find-nav" onClick={() => doFind(findQuery, true)} title="Previous (Shift+Enter)">↑</button>
            <button type="button" className="note-find-nav" onClick={() => doFind(findQuery)} title="Next (Enter)">↓</button>
            <button type="button" className="note-find-close" onClick={closeFindBar}>✕</button>
          </div>
        )}

        <div className="note-title-area">
          <textarea
            ref={titleInputRef}
            className="note-title-input"
            placeholder="Untitled"
            value={localTitle}
            rows={1}
            disabled={disabled}
            onChange={(e) => {
              const val = e.target.value.replace(/\n/g, '')
              setLocalTitle(val)
              onTitleChange?.(val)
              // Auto-resize
              const el = titleInputRef.current
              if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px` }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                editorRef.current?.commands.focus()
              }
            }}
          />
          <time className="note-timestamp" dateTime={new Date(note.updatedAt).toISOString()}>
            {formatNoteDate(note.updatedAt)}
          </time>
        </div>
        <div className="editor-zoom-canvas" style={{ zoom }}>
          <TiptapEditor
            content={note.body}
            onChange={onBodyChange}
            onOrganize={onOrganizeRequest}
            onAiQueryTrigger={onAiQuery ? (ctx) => {
              setEnhanceCtx(ctx ?? null)
              setAiQueryOpen(true)
            } : undefined}
            disabled={disabled}
            editorRef={editorRef}
          />
        </div>
      </div>

      {/* Fixed bottom zone — never zooms, always visible */}
      <div className="editor-bottom-bar">
        {/* /ai query bar */}
        {aiQueryOpen && (
          <AIQueryBar
            onSubmit={handleAiQuerySubmit}
            onClose={closeAiQuery}
            isLoading={aiQueryLoading}
            enhanceCtx={enhanceCtx}
          />
        )}

        {/* /ai answer panel */}
        {aiAnswer !== null && !aiQueryOpen && (
          <div className="ai-answer-panel">
            <div className="ai-answer-header">
              <span>{enhanceCtx ? 'Enhancement' : 'Answer'}</span>
              <div className="ai-answer-actions">
                {enhanceCtx ? (
                  <>
                    <button type="button" className="organize-accept" onClick={replaceWithAiAnswer}>Replace</button>
                    <button type="button" className="organize-accept ai-answer-insert" onClick={insertAiAnswer}>Insert</button>
                  </>
                ) : (
                  <button type="button" className="organize-accept" onClick={insertAiAnswer}>Insert</button>
                )}
                <button type="button" className="organize-discard" onClick={() => { setAiAnswer(null); setEnhanceCtx(null) }}>✕</button>
              </div>
            </div>
            <div className="ai-answer-body">{aiAnswer}</div>
          </div>
        )}

        {/* AI suggestion bars */}
        {organizePreviewBody !== null && organizePreviewBody !== '…' && (
          <div className="organize-bar">
            <div className="organize-bar-header">
              <span>AI suggestion</span>
              <div className="organize-bar-actions">
                <button type="button" className="organize-accept" onClick={onAcceptOrganize}>Accept</button>
                <button type="button" className="organize-discard" onClick={onDismissOrganize}>Discard</button>
              </div>
            </div>
            <div className="organize-bar-body">
              <div
                className="organize-bar-preview"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: AI output rendered as markdown preview
                dangerouslySetInnerHTML={{ __html: markdownToHtml(organizePreviewBody) }}
              />
            </div>
          </div>
        )}
        {organizePreviewBody === '…' && (
          <div className="organize-bar organize-bar--thinking">
            <div className="organize-bar-header"><span>Thinking…</span></div>
          </div>
        )}
        {organizeError !== null && (
          <div className="organize-bar organize-bar--error">
            <div className="organize-bar-header">
              <span>AI unavailable</span>
              <button type="button" className="organize-discard" onClick={onDismissOrganize}>✕</button>
            </div>
            <div className="organize-bar-body">
              <p className="organize-error-msg">{organizeError}</p>
            </div>
          </div>
        )}

        {/* Thin spacer — keeps bottom-bar visible even with no buttons */}
        <div className="editor-actions-spacer" />
      </div>
    </section>
  )
}
