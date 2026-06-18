import { Extension, Mark, Node, mergeAttributes } from '@tiptap/core'
import { EditorContent, NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, type Editor, type NodeViewProps } from '@tiptap/react'
import Suggestion, { type SuggestionProps } from '@tiptap/suggestion'
import { PluginKey } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { openUrl } from '../../openUrl'

/* ── Log Block node ──────────────────────────────────────────────── */

const todayIso = () => new Date().toISOString().slice(0, 10)

const LogBlockView = ({ node, updateAttributes }: NodeViewProps) => {
  const { date } = node.attrs as { date: string }

  const label = (() => {
    try {
      const d = new Date(`${date}T12:00:00`)
      return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    } catch {
      return date
    }
  })()

  return (
    <NodeViewWrapper as="div" className="log-block">
      <div className="log-block-header" contentEditable={false}>
        <span className="log-block-icon">◈</span>
        <span className="log-block-label">{label}</span>
        <input
          type="date"
          className="log-block-date-picker"
          value={date}
          title="Change log date"
          onChange={(e) => updateAttributes({ date: e.target.value })}
        />
      </div>
      <NodeViewContent className="log-block-content" />
    </NodeViewWrapper>
  )
}

const LogBlock = Node.create({
  name: 'logBlock',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      date: {
        default: todayIso(),
        parseHTML: (el) => el.getAttribute('data-log-date') ?? todayIso(),
        renderHTML: (attrs) => ({ 'data-log-date': attrs.date }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-log-block]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-log-block': 'true', class: 'log-block' }), 0]
  },

  addNodeView() {
    return ReactNodeViewRenderer(LogBlockView)
  },
})

/* ── Diagram node (Mermaid) ──────────────────────────────────────── */

declare global {
  interface Window {
    __mermaid?: {
      render: (id: string, definition: string) => Promise<{ svg: string }>
    }
  }
}

let diagramCounter = 0

const DiagramNodeView = ({ node, updateAttributes, selected }: NodeViewProps) => {
  const { code, title } = node.attrs as { code: string; title: string }
  const [editing, setEditing] = useState(!code)
  const [draft, setDraft] = useState(code || '')
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const id = useRef(`mermaid-${++diagramCounter}`)
  // Keep a ref to the latest svg so the visibility handler can check without
  // needing svg in its dependency array (which would re-subscribe on every render)
  const svgRef = useRef<string | null>(null)

  const render = useCallback(async (src: string) => {
    const mermaid = window.__mermaid
    if (!mermaid) { setError('Mermaid loading…'); return }
    // Give each render a unique id so Mermaid doesn't collide with a stale element
    id.current = `mermaid-${++diagramCounter}`
    try {
      const { svg: rendered } = await mermaid.render(id.current, src)
      setSvg(rendered)
      svgRef.current = rendered
      setError(null)
    } catch (e) {
      setError(String(e))
      setSvg(null)
      svgRef.current = null
    }
  }, [])

  // Render on mount / code or editing change
  useEffect(() => {
    if (code && !editing) render(code)
  }, [code, editing, render])

  // Re-render when the notes view becomes visible again (view switches, display:none lifted)
  useEffect(() => {
    const handler = (e: Event) => {
      const ev = e as CustomEvent<string>
      if (ev.detail === 'notes' && code && !editing && !svgRef.current) {
        render(code)
      }
    }
    window.addEventListener('bilo:view-active', handler)
    return () => window.removeEventListener('bilo:view-active', handler)
  }, [code, editing, render])

  const commit = () => {
    if (draft.trim()) {
      updateAttributes({ code: draft.trim() })
      setEditing(false)
    }
  }

  return (
    <NodeViewWrapper as="div" className={`diagram-block${selected ? ' diagram-selected' : ''}`} contentEditable={false}>
      <div className="diagram-toolbar">
        {/* Editable chart title — click to rename */}
        <input
          className="diagram-title-input"
          value={title}
          onChange={(e) => updateAttributes({ title: e.target.value })}
          placeholder="Chart title…"
          spellCheck={false}
        />
        <button type="button" className="diagram-edit-btn" onClick={() => setEditing((v) => !v)}>
          {editing ? 'preview' : 'edit'}
        </button>
      </div>
      {editing ? (
        <div className="diagram-editor-area">
          <textarea
            className="diagram-textarea"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`flowchart LR\n  A --> B --> C`}
            rows={6}
            spellCheck={false}
          />
          <button type="button" className="diagram-render-btn" onClick={commit}>
            Render ↵
          </button>
        </div>
      ) : (
        <div
          className="diagram-preview"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted mermaid SVG output
          dangerouslySetInnerHTML={{ __html: svg ?? '' }}
          onClick={() => setEditing(true)}
          title="Click to edit"
        />
      )}
      {error && <p className="diagram-error">{error}</p>}
    </NodeViewWrapper>
  )
}

const DiagramNode = Node.create({
  name: 'diagram',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      code: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-diagram-code') ?? '',
        renderHTML: (attrs) => ({ 'data-diagram-code': attrs.code }),
      },
      title: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-diagram-title') ?? '',
        renderHTML: (attrs) => attrs.title ? { 'data-diagram-title': attrs.title } : {},
      },
    }
  },

  parseHTML() { return [{ tag: 'div[data-diagram-block]' }] },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-diagram-block': 'true', class: 'diagram-block' })]
  },

  addNodeView() { return ReactNodeViewRenderer(DiagramNodeView) },
})

/* ── Doodle (freehand sketch) node ──────────────────────────────── */

const DoodleNodeView = ({ node, updateAttributes, selected }: NodeViewProps) => {
  const { dataUrl, title } = node.attrs as { dataUrl: string; title: string }
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [drawing, setDrawing] = useState(false)
  const [isEditing, setIsEditing] = useState(!dataUrl)
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen')
  const [strokeWidth, setStrokeWidth] = useState(2)
  const lastPos = useRef<{ x: number; y: number } | null>(null)

  // Restore saved drawing when entering edit mode
  useEffect(() => {
    if (!isEditing || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    if (dataUrl) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0)
      img.src = dataUrl
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
  }, [isEditing, dataUrl])

  const getPos = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if ('touches' in e) {
      const t = e.touches[0]
      return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY }
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
  }

  const startDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    setDrawing(true)
    lastPos.current = getPos(e)
  }

  const doDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    if (!drawing || !canvasRef.current) return
    const ctx = canvasRef.current.getContext('2d')!
    const pos = getPos(e)
    ctx.beginPath()
    ctx.moveTo(lastPos.current!.x, lastPos.current!.y)
    ctx.lineTo(pos.x, pos.y)
    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.strokeStyle = 'rgba(0,0,0,1)'
      ctx.lineWidth = strokeWidth * 6
    } else {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = '#111'
      ctx.lineWidth = strokeWidth
    }
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
    lastPos.current = pos
  }

  const endDraw = () => { setDrawing(false); lastPos.current = null }

  const clearCanvas = () => {
    if (!canvasRef.current) return
    canvasRef.current.getContext('2d')!.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
  }

  const saveSketch = () => {
    if (!canvasRef.current) return
    updateAttributes({ dataUrl: canvasRef.current.toDataURL('image/png') })
    setIsEditing(false)
  }

  return (
    <NodeViewWrapper as="div" className={`doodle-block${selected ? ' doodle-selected' : ''}`} contentEditable={false}>
      <div className="doodle-toolbar">
        <input
          className="doodle-title-input"
          value={title}
          onChange={(e) => updateAttributes({ title: e.target.value })}
          placeholder="Sketch title…"
          spellCheck={false}
        />
        {isEditing ? (
          <>
            <button type="button" className={`doodle-tool-btn${tool === 'pen' ? ' active' : ''}`} onClick={() => setTool('pen')}>pen</button>
            <button type="button" className={`doodle-tool-btn${tool === 'eraser' ? ' active' : ''}`} onClick={() => setTool('eraser')}>erase</button>
            <input
              type="range" min={1} max={12} value={strokeWidth}
              onChange={(e) => setStrokeWidth(Number(e.target.value))}
              className="doodle-size-slider"
              title="Stroke width"
            />
            <button type="button" className="doodle-clear-btn" onClick={clearCanvas}>clear</button>
            <button type="button" className="doodle-save-btn" onClick={saveSketch}>done ↵</button>
          </>
        ) : (
          <button type="button" className="doodle-edit-btn" onClick={() => setIsEditing(true)}>edit</button>
        )}
      </div>

      {isEditing ? (
        <canvas
          ref={canvasRef}
          className="doodle-canvas"
          width={680}
          height={320}
          onMouseDown={startDraw}
          onMouseMove={doDraw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={doDraw}
          onTouchEnd={endDraw}
          style={{ cursor: tool === 'eraser' ? 'cell' : 'crosshair' }}
        />
      ) : dataUrl ? (
        <img
          src={dataUrl}
          alt={title || 'Sketch'}
          className="doodle-preview"
          onClick={() => setIsEditing(true)}
          title="Click to edit"
        />
      ) : (
        <div className="doodle-empty" onClick={() => setIsEditing(true)}>Click to draw</div>
      )}
    </NodeViewWrapper>
  )
}

const DoodleNode = Node.create({
  name: 'doodle',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      dataUrl: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-doodle-url') ?? '',
        renderHTML: (attrs) => attrs.dataUrl ? { 'data-doodle-url': attrs.dataUrl } : {},
      },
      title: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-doodle-title') ?? '',
        renderHTML: (attrs) => attrs.title ? { 'data-doodle-title': attrs.title } : {},
      },
    }
  },

  parseHTML() { return [{ tag: 'div[data-doodle-block]' }] },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-doodle-block': 'true', class: 'doodle-block' })]
  },

  addNodeView() { return ReactNodeViewRenderer(DoodleNodeView) },
})

/* ── Calculator node ─────────────────────────────────────────────── */

const CalcNodeView = ({ deleteNode }: NodeViewProps) => {
  const [display, setDisplay] = useState('0')
  const [expr, setExpr] = useState('')
  const [hasResult, setHasResult] = useState(false)
  const [focused, setFocused] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const press = (val: string) => {
    if (hasResult && /[0-9.]/.test(val)) {
      setExpr(val); setDisplay(val); setHasResult(false); return
    }
    if (hasResult) setHasResult(false)

    if (val === '=') {
      try {
        const safe = expr.replace(/[^0-9+\-*/.() ]/g, '')
        // biome-ignore lint/security/noGlobalEval: calculator expression, input sanitised
        const result = Function(`'use strict'; return (${safe})`)() as number
        const str = Number.isFinite(result) ? String(parseFloat(result.toFixed(10))) : 'Error'
        setDisplay(str); setExpr(str); setHasResult(true)
      } catch {
        setDisplay('Error'); setExpr(''); setHasResult(true)
      }
      return
    }
    if (val === 'C') { setExpr(''); setDisplay('0'); setHasResult(false); return }
    if (val === '⌫') {
      const next = expr.slice(0, -1) || '0'
      setExpr(expr.slice(0, -1)); setDisplay(next); return
    }
    const next = expr === '0' && /[0-9]/.test(val) ? val : expr + val
    setExpr(next); setDisplay(next)
  }

  // Keyboard handler — mirrors the button grid
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const map: Record<string, string> = {
      'Enter': '=', 'Return': '=',
      'Backspace': '⌫', 'Delete': '⌫',
      'Escape': 'C',
    }
    const k = map[e.key] ?? e.key
    if (/^[0-9+\-*/.()%]$/.test(k) || ['=', '⌫', 'C'].includes(k)) {
      e.preventDefault()
      e.stopPropagation()    // prevent ProseMirror from consuming the key
      press(k)
    }
  }

  const rows = [
    ['C', '⌫', '%', '÷'],
    ['7', '8', '9', '×'],
    ['4', '5', '6', '−'],
    ['1', '2', '3', '+'],
    ['0', '.', '='],
  ]

  const toOp = (k: string) => ({ '÷': '/', '×': '*', '−': '-', '%': '%' }[k] ?? k)

  return (
    <NodeViewWrapper
      as="div"
      className={`calc-block${focused ? ' calc-block--focused' : ''}`}
      contentEditable={false}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: calculator needs focus for keyboard input
      tabIndex={0}
      ref={wrapRef}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onKeyDown={handleKeyDown}
      onMouseDown={(e: React.MouseEvent) => {
        e.preventDefault()  // stop ProseMirror text-selection
        wrapRef.current?.focus()
      }}
    >
      <div className="calc-header">
        <span className="calc-label">calc</span>
        <button type="button" className="calc-close" onClick={deleteNode} title="Remove">✕</button>
      </div>
      <div className="calc-display">{display}</div>
      <div className="calc-keys">
        {rows.map((row, ri) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static calculator layout
          <div key={ri} className="calc-row">
            {row.map((k) => (
              <button
                key={k}
                type="button"
                className={`calc-key${k === '=' ? ' calc-key--eq' : ''}${['C', '⌫'].includes(k) ? ' calc-key--fn' : ''}${['÷','×','−','+','%'].includes(k) ? ' calc-key--op' : ''}`}
                onClick={() => press(toOp(k))}
              >
                {k}
              </button>
            ))}
          </div>
        ))}
      </div>
    </NodeViewWrapper>
  )
}

const CalcNode = Node.create({
  name: 'calculator',
  group: 'block',
  atom: true,
  draggable: true,
  parseHTML() { return [{ tag: 'div[data-calc-block]' }] },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-calc-block': 'true' })]
  },
  addNodeView() { return ReactNodeViewRenderer(CalcNodeView) },
})

/* ── Image node ──────────────────────────────────────────────────── */

const ImageNodeView = ({ node, updateAttributes, deleteNode }: NodeViewProps) => {
  const { src, alt, width } = node.attrs as { src: string; alt: string; width: number | null }
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState(false)

  // Drag-to-resize: track mouse on the resize handle
  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startW = wrapperRef.current?.offsetWidth ?? 400

    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX
      const newW = Math.max(80, Math.min(startW + delta, 860))
      updateAttributes({ width: Math.round(newW) })
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [updateAttributes])

  const imgStyle: React.CSSProperties = {
    width: width ? `${width}px` : '100%',
    maxWidth: '100%',
    display: 'block',
  }

  return (
    <NodeViewWrapper as="div" className="image-block" contentEditable={false}>
      <div
        ref={wrapperRef}
        className={`image-block-inner${hovered ? ' image-hovered' : ''}`}
        style={{ display: 'inline-block', position: 'relative', maxWidth: '100%', width: width ? `${width}px` : undefined }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <img src={src} alt={alt || ''} style={imgStyle} draggable={false} />
        {hovered && (
          <>
            <button
              type="button"
              className="image-delete-btn"
              onClick={deleteNode}
              title="Remove image"
            >✕</button>
            <div
              className="image-resize-handle"
              title="Drag to resize"
              onMouseDown={startResize}
            />
          </>
        )}
      </div>
    </NodeViewWrapper>
  )
}

const ImageNode = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src:   { default: '' },
      alt:   { default: '' },
      width: { default: null, parseHTML: (el) => el.getAttribute('data-width') ? Number(el.getAttribute('data-width')) : null, renderHTML: (a) => a.width ? { 'data-width': a.width } : {} },
    }
  },

  parseHTML() { return [{ tag: 'img[src]' }] },

  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(HTMLAttributes, { class: 'image-block-img' })]
  },

  addNodeView() { return ReactNodeViewRenderer(ImageNodeView) },
})

/* ── PDF attachment node ─────────────────────────────────────────── */

const PdfNodeView = ({ node, deleteNode }: NodeViewProps) => {
  const { filename, dataUrl, size } = node.attrs as { filename: string; dataUrl: string; size: number }
  const [open, setOpen] = useState(false)
  // Convert data URL to object URL once for performance (avoids huge inline src strings)
  const objectUrl = useRef<string | null>(null)

  const getObjectUrl = () => {
    if (objectUrl.current) return objectUrl.current
    try {
      const base64 = dataUrl.split(',')[1]
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const blob = new Blob([bytes], { type: 'application/pdf' })
      objectUrl.current = URL.createObjectURL(blob)
      return objectUrl.current
    } catch {
      return dataUrl
    }
  }

  const fmt = (bytes: number) =>
    bytes > 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`

  return (
    <NodeViewWrapper as="div" className="pdf-block" contentEditable={false}>
      {/* Header card */}
      <div className="pdf-block-header">
        <button
          type="button"
          className="pdf-toggle-btn"
          onClick={() => setOpen((v) => !v)}
          title={open ? 'Collapse PDF' : 'View PDF inline'}
        >
          <span className="pdf-icon">PDF</span>
          <span className="pdf-filename">{filename}</span>
          <span className="pdf-size">{fmt(size)}</span>
          <span className="pdf-chevron">{open ? '▲' : '▼'}</span>
        </button>
        <button type="button" className="pdf-delete-btn" onClick={deleteNode} title="Remove">✕</button>
      </div>

      {/* Inline PDF viewer */}
      {open && (
        <div className="pdf-viewer-wrap">
          <object
            data={getObjectUrl()}
            type="application/pdf"
            width="100%"
            height="600"
            className="pdf-embed-object"
          >
            {/* Fallback if the browser can't render inline */}
            <p className="pdf-fallback">
              Your browser can't display PDFs inline.{' '}
              <a href={getObjectUrl()} download={filename}>Download the file</a>.
            </p>
          </object>
        </div>
      )}
    </NodeViewWrapper>
  )
}

const PdfNode = Node.create({
  name: 'pdfAttachment',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      filename: { default: '' },
      dataUrl:  { default: '' },
      size:     { default: 0 },
    }
  },

  parseHTML() { return [{ tag: 'div[data-pdf-block]' }] },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-pdf-block': 'true', class: 'pdf-block-static' })]
  },

  addNodeView() { return ReactNodeViewRenderer(PdfNodeView) },
})

/* ── Jira link detection ─────────────────────────────────────────── */

// Regex that matches any Jira browse URL: .../browse/LM-1234
const JIRA_URL_RE = /https?:\/\/[^/\s]+\/browse\/([A-Z]+-\d+)/g

type JiraChip = {
  key: string
  summary: string
  status: string
  statusCategory: string
  url: string
  loading?: boolean
  error?: string
}

// Session cache so we don't re-fetch the same ticket
const jiraChipCache = new Map<string, JiraChip>()

async function fetchJiraChip(url: string, key: string): Promise<JiraChip> {
  if (jiraChipCache.has(key)) return jiraChipCache.get(key)!

  const rawSettings = localStorage.getItem('bilo-ai-runtime-settings')
  if (!rawSettings) {
    return { key, summary: '', status: '', statusCategory: 'todo', url, error: 'No Jira settings — configure in Settings → Jira' }
  }

  let s: Record<string, string>
  try { s = JSON.parse(rawSettings) } catch { return { key, summary: '', status: '', statusCategory: 'todo', url, error: 'Invalid settings' } }

  if (!s.jiraBaseUrl || !s.jiraEmail || !s.jiraApiToken) {
    return { key, summary: '', status: '', statusCategory: 'todo', url, error: 'Fill in Settings → Jira (base URL, email, token)' }
  }

  try {

    const result = await invoke<JiraChip>('fetch_jira_ticket', {
      baseUrl: s.jiraBaseUrl,
      email: s.jiraEmail,
      apiToken: s.jiraApiToken,
      ticketKey: key,
      ticketUrl: url,
    })
    jiraChipCache.set(key, result)
    return result
  } catch (e) {
    return { key, summary: '', status: '', statusCategory: 'todo', url, error: String(e) }
  }
}

/* ── Jira inline node ────────────────────────────────────────────── */

const JiraTicketNodeView = ({ node }: NodeViewProps) => {
  const { ticketKey, summary, status, statusCategory, url } = node.attrs as {
    ticketKey: string; summary: string; status: string; statusCategory: string; url: string
  }

  const dotColor = statusCategory === 'done' ? '#22c55e' : statusCategory === 'inProgress' ? '#f59e0b' : '#6b7280'

  return (
    <NodeViewWrapper as="span" contentEditable={false}>
      <span
        className={`jira-inline-chip jira-cat-${statusCategory}`}
        role="link"
        tabIndex={0}
        title={`Click to open ${ticketKey} in Jira`}
        onClick={() => openUrl(url)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openUrl(url) }}
      >
        <span className="jira-ic-dot" style={{ background: dotColor }} />
        <span className="jira-ic-key">{ticketKey}</span>
        {summary && <span className="jira-ic-summary">{summary}</span>}
        {status && <span className="jira-ic-status">{status}</span>}
      </span>
    </NodeViewWrapper>
  )
}

const JiraTicketNode = Node.create({
  name: 'jiraTicket',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      ticketKey: { default: '' },
      summary: { default: '' },
      status: { default: '' },
      statusCategory: { default: 'todo' },
      url: { default: '' },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-jira-ticket]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-jira-ticket': 'true', class: 'jira-inline-chip' })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(JiraTicketNodeView)
  },
})

/* ── Slash command definitions ─────────────────────────────────── */

type SlashCommand = {
  label: string
  description: string
  command: (editor: Editor, range: { from: number; to: number }) => void
}

const buildCommands = (
  onOrganize?: () => void,
  onAiQueryTrigger?: () => void,
  onJiraTrigger?: (insertPos: number, position: { top: number; left: number }) => void,
): SlashCommand[] => [
  {
    label: '/h1',
    description: 'Large heading',
    command: (editor, range) =>
      editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run(),
  },
  {
    label: '/h2',
    description: 'Medium heading',
    command: (editor, range) =>
      editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run(),
  },
  {
    label: '/h3',
    description: 'Small heading',
    command: (editor, range) =>
      editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run(),
  },
  {
    label: '/list',
    description: 'Bullet list',
    command: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    label: '/ordered',
    description: 'Numbered list',
    command: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    label: '/todo',
    description: 'Task / checklist',
    command: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    label: '/table',
    description: 'Insert 3×3 table',
    command: (editor, range) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run(),
  },
  {
    label: '/code',
    description: 'Code block',
    command: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    label: '/divider',
    description: 'Horizontal rule',
    command: (editor, range) =>
      editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
  {
    label: '/quote',
    description: 'Blockquote',
    command: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    label: '/log',
    description: 'Dated log entry — shows on calendar',
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).insertContent({
        type: 'logBlock',
        attrs: { date: todayIso() },
        content: [{ type: 'paragraph' }],
      }).run()
    },
  },
  {
    label: '/diagram',
    description: 'Insert a Mermaid diagram block',
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).insertContent({
        type: 'diagram',
        attrs: { code: '' },
      }).run()
    },
  },
  {
    label: '/calculate',
    description: 'Insert an inline calculator',
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).insertContent({ type: 'calculator' }).run()
    },
  },
  {
    label: '/doodle',
    description: 'Insert a freehand sketch canvas',
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).insertContent({
        type: 'doodle',
        attrs: { dataUrl: '', title: '' },
      }).run()
    },
  },
  {
    label: '/image',
    description: 'Insert image (from file picker)',
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).run()
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*'
      input.onchange = () => {
        const file = input.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = () => {
          editor.chain().focus().insertContent({
            type: 'image',
            attrs: { src: reader.result as string, alt: file.name },
          }).run()
        }
        reader.readAsDataURL(file)
      }
      input.click()
    },
  },
  {
    label: '/pdf',
    description: 'Attach a PDF file',
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).run()
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'application/pdf'
      input.onchange = () => {
        const file = input.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = () => {
          editor.chain().focus().insertContent({
            type: 'pdfAttachment',
            attrs: { filename: file.name, dataUrl: reader.result as string, size: file.size },
          }).run()
        }
        reader.readAsDataURL(file)
      }
      input.click()
    },
  },
  ...(onOrganize
    ? [
        {
          label: '/organize',
          description: 'AI: organize this note',
          command: (_editor: Editor, _range: { from: number; to: number }) => {
            onOrganize()
          },
        },
      ]
    : []),
  ...(onAiQueryTrigger
    ? [
        {
          label: '/ai',
          description: 'Ask AI a question about your notes',
          command: (_editor: Editor, range: { from: number; to: number }) => {
            _editor.chain().focus().deleteRange(range).run()
            onAiQueryTrigger()
          },
        },
      ]
    : []),
  ...(onJiraTrigger
    ? [
        {
          label: '/jira',
          description: 'Embed a Jira ticket inline',
          command: (editor: Editor, range: { from: number; to: number }) => {
            editor.chain().focus().deleteRange(range).run()
            const coords = editor.view.coordsAtPos(range.from)
            onJiraTrigger(range.from, { top: coords.bottom + 8, left: coords.left })
          },
        },
      ]
    : []),
]

/* ── AI bubble toolbar (floating on text selection) ─────────────── */

type EnhanceContext = { text: string; from: number; to: number }

type AIBubbleToolbarProps = {
  editor: Editor | null
  onEnhance: (ctx: EnhanceContext) => void
}

const BUBBLE_H = 32

const AIBubbleToolbar = ({ editor, onEnhance }: AIBubbleToolbarProps) => {
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)
  const [ctx, setCtx] = useState<EnhanceContext | null>(null)

  useEffect(() => {
    if (!editor) return

    const update = () => {
      const { from, to, empty } = editor.state.selection
      if (empty || from === to) {
        setCoords(null)
        setCtx(null)
        return
      }
      try {
        const text = editor.state.doc.textBetween(from, to, ' ').trim()
        if (!text) { setCoords(null); setCtx(null); return }

        const startC = editor.view.coordsAtPos(from)
        const endC   = editor.view.coordsAtPos(to)

        // Centre horizontally on the selection, clamped to viewport
        const midX = (startC.left + endC.left) / 2
        const btnW = 90   // approximate button width
        const clampedLeft = Math.max(btnW / 2 + 8, Math.min(midX, window.innerWidth - btnW / 2 - 8))

        // Prefer above; flip below if near top
        const wantTop = startC.top - BUBBLE_H - 6
        const top = wantTop < 8 ? endC.bottom + 6 : wantTop

        setCoords({ top, left: clampedLeft })
        setCtx({ text, from, to })
      } catch {
        setCoords(null)
        setCtx(null)
      }
    }

    editor.on('selectionUpdate', update)
    editor.on('blur', () => { setCoords(null); setCtx(null) })
    return () => { editor.off('selectionUpdate', update) }
  }, [editor])

  if (!coords || !ctx) return null

  return (
    <button
      type="button"
      className="ai-bubble-enhance"
      style={{ position: 'fixed', top: coords.top, left: coords.left, transform: 'translateX(-50%)', zIndex: 200 }}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onEnhance(ctx)}
    >
      Enhance
    </button>
  )
}

/* ── Slash command Tiptap extension ────────────────────────────── */

type SlashMenuProps = {
  open: boolean
  query: string
  position: { top: number; left: number }
  items: SlashCommand[]
  selectedIndex: number
  onSelect: (cmd: SlashCommand) => void
}

type SlashCallbacks = {
  onStart: (items: SlashCommand[], position: DOMRect | null, query: string, props: unknown) => void
  onUpdate: (items: SlashCommand[], position: DOMRect | null, query: string, props: unknown) => void
  onExit: () => void
  onKeyDown: (event: KeyboardEvent) => boolean
}

const slashPluginKey = new PluginKey('slashCommands')

function makeSlashExtension(callbacksRef: React.MutableRefObject<SlashCallbacks>, commands: SlashCommand[]) {
  return Extension.create({
    name: 'slashCommands',
    addProseMirrorPlugins() {
      return [
        Suggestion({
          pluginKey: slashPluginKey,
          editor: this.editor,
          char: '/',
          allowSpaces: false,
          startOfLine: false,
          items: ({ query }: { query: string }) => {
            const q = query.toLowerCase()
            return commands.filter(
              (c) =>
                c.label.toLowerCase().includes(q) ||
                c.description.toLowerCase().includes(q),
            )
          },
          render: () => ({
            onStart: (props: SuggestionProps<SlashCommand>) => {
              callbacksRef.current.onStart(
                props.items,
                props.clientRect?.() ?? null,
                props.query,
                props,
              )
            },
            onUpdate: (props: SuggestionProps<SlashCommand>) => {
              callbacksRef.current.onUpdate(
                props.items,
                props.clientRect?.() ?? null,
                props.query,
                props,
              )
            },
            onKeyDown: ({ event }: { event: KeyboardEvent }) =>
              callbacksRef.current.onKeyDown(event),
            onExit: () => callbacksRef.current.onExit(),
          }),
          command: ({
            editor,
            range,
            props,
          }: {
            editor: Editor
            range: { from: number; to: number }
            props: SlashCommand
          }) => {
            props.command(editor, range)
          },
        }),
      ]
    },
  })
}

/* ── @ Reminder Tiptap extension ───────────────────────────────── */

/** A date preset or sentinel for the custom picker */
type AtOption = {
  label: string          // display label
  sublabel?: string      // secondary info e.g. "9:00 AM"
  getDate?: () => Date   // undefined means "Custom…"
  isCustom?: true
}

const nextWeekday = (weekday: number): Date => {
  const d = new Date()
  const diff = (weekday - d.getDay() + 7) % 7 || 7
  d.setDate(d.getDate() + diff)
  d.setHours(9, 0, 0, 0)
  return d
}

const AT_OPTIONS: AtOption[] = [
  {
    label: 'Today',
    sublabel: '5:00 PM',
    getDate: () => { const d = new Date(); d.setHours(17, 0, 0, 0); return d },
  },
  {
    label: 'Tomorrow',
    sublabel: '9:00 AM',
    getDate: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d },
  },
  {
    label: 'This Friday',
    sublabel: '9:00 AM',
    getDate: () => nextWeekday(5),
  },
  {
    label: 'Next Monday',
    sublabel: '9:00 AM',
    getDate: () => nextWeekday(1),
  },
  {
    label: 'Pick date & time…',
    isCustom: true,
  },
]

const formatReminderBadge = (d: Date): string => {
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  const isToday = d.toDateString() === today.toDateString()
  const isTomorrow = d.toDateString() === tomorrow.toDateString()
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (isToday) return `Today ${time}`
  if (isTomorrow) return `Tomorrow ${time}`
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + time
}

const atPluginKey = new PluginKey('atReminder')

type AtMenuState = {
  open: boolean
  query: string
  position: { top: number; left: number }
  commandProps: unknown
}

type AtCallbacks = {
  onStart: (position: DOMRect | null, query: string, props: unknown) => void
  onUpdate: (position: DOMRect | null, query: string) => void
  onExit: () => void
  onKeyDown: (event: KeyboardEvent) => boolean
}

const ReminderMark = Mark.create({
  name: 'reminderBadge',
  addAttributes() {
    return { 'data-date': { default: '' } }
  },
  parseHTML() {
    return [{ tag: 'span[data-reminder]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', { ...HTMLAttributes, 'data-reminder': 'true', class: 'reminder-badge' }, 0]
  },
})

function makeAtExtension(
  callbacksRef: React.MutableRefObject<AtCallbacks>,
  onReminder: (title: string, date: Date) => void,
  onCustomReminder: (range: { from: number; to: number }, position: { top: number; left: number }, lineText: string) => void,
) {
  return Extension.create({
    name: 'atReminder',
    addProseMirrorPlugins() {
      return [
        Suggestion({
          pluginKey: atPluginKey,
          editor: this.editor,
          char: '@',
          allowSpaces: false,
          items: ({ query }: { query: string }) => {
            const q = query.toLowerCase()
            return AT_OPTIONS.filter((o) => o.label.toLowerCase().startsWith(q) || q === '')
          },
          render: () => ({
            onStart: (props: SuggestionProps<AtOption>) => {
              callbacksRef.current.onStart(props.clientRect?.() ?? null, props.query, props)
            },
            onUpdate: (props: SuggestionProps<AtOption>) => {
              callbacksRef.current.onUpdate(props.clientRect?.() ?? null, props.query)
            },
            onKeyDown: ({ event }: { event: KeyboardEvent }) => callbacksRef.current.onKeyDown(event),
            onExit: () => callbacksRef.current.onExit(),
          }),
          command: ({
            editor,
            range,
            props,
          }: {
            editor: Editor
            range: { from: number; to: number }
            props: AtOption
          }) => {
            if (props.isCustom) {
              // Delete the @text and open the custom date picker
              editor.chain().focus().deleteRange(range).run()
              const coords = editor.view.coordsAtPos(range.from)
              const resolvedPos = editor.state.doc.resolve(range.from)
              const lineText = resolvedPos.node().textContent
              onCustomReminder(
                { from: range.from, to: range.from },
                { top: coords.bottom + 8, left: coords.left },
                lineText,
              )
              return
            }
            const date = props.getDate!()
            const badgeLabel = `@${formatReminderBadge(date)}`
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .insertContent(`<span data-reminder="true" class="reminder-badge" data-date="${date.toISOString()}">${badgeLabel}</span>\u00A0`)
              .run()
            const resolvedPos = editor.state.doc.resolve(range.from)
            const lineText = resolvedPos.node().textContent
            onReminder(lineText || badgeLabel, date)
          },
        }),
      ]
    },
  })
}

/* ── Slash menu React component ────────────────────────────────── */

const SlashMenu = ({ open, position, items, selectedIndex, onSelect }: SlashMenuProps) => {
  if (!open || items.length === 0) return null

  return (
    <div
      className="slash-menu"
      style={{ position: 'fixed', top: position.top, left: position.left }}
    >
      {items.map((item, index) => (
        <button
          key={item.label}
          type="button"
          className={`slash-menu-item ${index === selectedIndex ? 'selected' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault()
            onSelect(item)
          }}
        >
          <span className="slash-menu-label">{item.label}</span>
          <span className="slash-menu-desc">{item.description}</span>
        </button>
      ))}
    </div>
  )
}

type AtMenuProps = {
  state: AtMenuState
  selectedIndex: number
  onSelect: (opt: AtOption) => void
}

const AtMenu = ({ state, selectedIndex, onSelect }: AtMenuProps) => {
  if (!state.open) return null
  const items = AT_OPTIONS.filter(
    (o) => o.label.toLowerCase().startsWith(state.query.toLowerCase()) || state.query === '',
  )
  if (!items.length) return null

  return (
    <div
      className="slash-menu at-menu"
      style={{ position: 'fixed', top: state.position.top, left: state.position.left }}
    >
      {items.map((opt, index) => (
        <button
          key={opt.label}
          type="button"
          className={`slash-menu-item ${index === selectedIndex ? 'selected' : ''}`}
          onMouseDown={(e) => { e.preventDefault(); onSelect(opt) }}
        >
          <span className="slash-menu-label">{opt.isCustom ? '🗓' : '⏰'} {opt.label}</span>
          {opt.sublabel && <span className="slash-menu-desc">{opt.sublabel}</span>}
        </button>
      ))}
    </div>
  )
}

/* ── Convert plain text ↔ HTML helpers ────────────────────────── */

import { textToHtml } from './editorUtils'

/* ── Main TiptapEditor component ───────────────────────────────── */

type TiptapEditorProps = {
  content: string
  onChange: (html: string) => void
  onOrganize?: () => void
  onAiQueryTrigger?: (ctx?: EnhanceContext) => void
  disabled?: boolean
  editorRef?: React.MutableRefObject<Editor | null>
  aiSettings?: { acpApiKey?: string; jiraBaseUrl?: string; jiraEmail?: string; jiraApiToken?: string }
}

export const TiptapEditor = ({
  content,
  onChange,
  onOrganize,
  onAiQueryTrigger,
  disabled = false,
  editorRef,
}: TiptapEditorProps) => {
  const [menuState, setMenuState] = useState<{
    open: boolean
    query: string
    position: { top: number; left: number }
    items: SlashCommand[]
    selectedIndex: number
    commandProps: unknown
  }>({
    open: false,
    query: '',
    position: { top: 0, left: 0 },
    items: [],
    selectedIndex: 0,
    commandProps: null,
  })

  const [atMenuState, setAtMenuState] = useState<AtMenuState>({
    open: false,
    query: '',
    position: { top: 0, left: 0 },
    commandProps: null,
  })
  const [atSelectedIndex, setAtSelectedIndex] = useState(0)

  // Stable ref so the paste handler (created once) can call the latest insertJiraNode
  const insertJiraNodeRef = useRef<(url: string, insertPos: number) => void>(() => {})

  // Jira URL input overlay state
  const [jiraInput, setJiraInput] = useState<{
    open: boolean
    position: { top: number; left: number }
    insertPos: number
    value: string
    loading: boolean
    error: string
  }>({ open: false, position: { top: 0, left: 0 }, insertPos: 0, value: '', loading: false, error: '' })
  const jiraInputRef = useRef<HTMLInputElement>(null)

  const handleJiraTrigger = useCallback((insertPos: number, position: { top: number; left: number }) => {
    setJiraInput({ open: true, position, insertPos, value: '', loading: false, error: '' })
    setTimeout(() => jiraInputRef.current?.focus(), 50)
  }, [])

  const commandsRef = useRef(buildCommands(onOrganize, onAiQueryTrigger, handleJiraTrigger))
  const menuStateRef = useRef(menuState)
  menuStateRef.current = menuState
  const atMenuStateRef = useRef(atMenuState)
  atMenuStateRef.current = atMenuState

  const callbacksRef = useRef<SlashCallbacks>({
    onStart: () => {},
    onUpdate: () => {},
    onExit: () => {},
    onKeyDown: () => false,
  })

  const atCallbacksRef = useRef<AtCallbacks>({
    onStart: () => {},
    onUpdate: () => {},
    onExit: () => {},
    onKeyDown: () => false,
  })

  callbacksRef.current = {
    onStart: (items, rect, query, props) => {
      setMenuState({
        open: true,
        query,
        position: rect
          ? { top: rect.bottom + 4, left: rect.left }
          : { top: 0, left: 0 },
        items,
        selectedIndex: 0,
        commandProps: props,
      })
    },
    onUpdate: (items, rect, query, props) => {
      setMenuState((prev) => ({
        ...prev,
        query,
        items,
        selectedIndex: 0,
        commandProps: props, // keep range in sync as user types
        position: rect
          ? { top: rect.bottom + 4, left: rect.left }
          : prev.position,
      }))
    },
    onExit: () => {
      setMenuState((prev) => ({ ...prev, open: false }))
    },
    onKeyDown: (event) => {
      const state = menuStateRef.current
      if (!state.open) return false

      if (event.key === 'ArrowDown') {
        setMenuState((prev) => ({
          ...prev,
          selectedIndex: Math.min(prev.selectedIndex + 1, prev.items.length - 1),
        }))
        return true
      }
      if (event.key === 'ArrowUp') {
        setMenuState((prev) => ({
          ...prev,
          selectedIndex: Math.max(prev.selectedIndex - 1, 0),
        }))
        return true
      }
      if (event.key === 'Enter') {
        const item = state.items[state.selectedIndex]
        if (item && editor) {
          const props = state.commandProps as { command: (props: SlashCommand) => void }
          props.command(item)
          setMenuState((prev) => ({ ...prev, open: false }))
        }
        return true
      }
      if (event.key === 'Escape') {
        setMenuState((prev) => ({ ...prev, open: false }))
        return true
      }
      return false
    },
  }

  atCallbacksRef.current = {
    onStart: (rect, query, props) => {
      setAtMenuState({
        open: true,
        query,
        position: rect
          ? { top: rect.bottom + 4, left: rect.left }
          : { top: 0, left: 0 },
        commandProps: props,
      })
      setAtSelectedIndex(0)
    },
    onUpdate: (rect, query) => {
      setAtMenuState((prev) => ({
        ...prev,
        query,
        position: rect ? { top: rect.bottom + 4, left: rect.left } : prev.position,
      }))
      setAtSelectedIndex(0)
    },
    onExit: () => {
      setAtMenuState((prev) => ({ ...prev, open: false }))
    },
    onKeyDown: (event) => {
      const state = atMenuStateRef.current
      if (!state.open) return false
      const visibleItems = AT_OPTIONS.filter(
        (o) => o.label.toLowerCase().startsWith(state.query.toLowerCase()) || state.query === '',
      )
      if (event.key === 'ArrowDown') {
        setAtSelectedIndex((i) => Math.min(i + 1, visibleItems.length - 1))
        return true
      }
      if (event.key === 'ArrowUp') {
        setAtSelectedIndex((i) => Math.max(i - 1, 0))
        return true
      }
      if (event.key === 'Enter') {
        const opt = visibleItems[atSelectedIndex]
        if (opt) {
          const props = state.commandProps as { command: (props: AtOption) => void }
          props.command(opt)
          setAtMenuState((prev) => ({ ...prev, open: false }))
        }
        return true
      }
      if (event.key === 'Escape') {
        setAtMenuState((prev) => ({ ...prev, open: false }))
        return true
      }
      return false
    },
  }

  // Custom date picker state (shown when "Pick date & time…" is chosen)
  const [customReminderState, setCustomReminderState] = useState<{
    open: boolean
    position: { top: number; left: number }
    insertPos: number
    lineText: string
    value: string  // datetime-local value e.g. "2026-06-10T09:00"
  } | null>(null)
  const customDateInputRef = useRef<HTMLInputElement>(null)

  const fireReminder = useCallback((title: string, date: Date) => {
    invoke('create_reminder', {
      title,
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
    }).catch((e) => console.warn('create_reminder failed:', e))
  }, [])

  const handleReminderCreate = useCallback((title: string, date: Date) => {
    fireReminder(title, date)
  }, [fireReminder])

  // Stable ref so atExtension (created once) can always call the latest handler
  const customReminderRef = useRef<(range: { from: number; to: number }, pos: { top: number; left: number }, lineText: string) => void>(() => {})

  const handleCustomReminder = useCallback((
    range: { from: number; to: number },
    position: { top: number; left: number },
    lineText: string,
  ) => {
    // Pre-fill with tomorrow 9am
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(9, 0, 0, 0)
    const pad = (n: number) => String(n).padStart(2, '0')
    const localValue = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}T${pad(tomorrow.getHours())}:${pad(tomorrow.getMinutes())}`
    setCustomReminderState({ open: true, position, insertPos: range.from, lineText, value: localValue })
    setTimeout(() => customDateInputRef.current?.focus(), 50)
  }, [])

  customReminderRef.current = handleCustomReminder

  const slashExtension = useRef(makeSlashExtension(callbacksRef, commandsRef.current))
  const atExtension = useRef(makeAtExtension(atCallbacksRef, handleReminderCreate, (range, pos, line) => customReminderRef.current(range, pos, line)))

  const initialHtml = content.startsWith('<') || !content.trim()
    ? (content || '<p></p>')
    : textToHtml(content)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false, // we handle clicks ourselves to use window.open
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' },
      }),
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
      TaskList,
      TaskItem.configure({ nested: true }),
      ReminderMark,
      LogBlock,
      JiraTicketNode,
      DiagramNode,
      DoodleNode,
      CalcNode,
      ImageNode,
      PdfNode,
      slashExtension.current,
      atExtension.current,
    ],
    content: initialHtml,
    editable: !disabled,
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML()
      if (html !== '<p></p>') {
        onChange(html)
      }
    },
    editorProps: {
        handlePaste: (view, event) => {
          // Check for image files in clipboard
          const items = Array.from(event.clipboardData?.items ?? [])
          const imageItem = items.find((i) => i.type.startsWith('image/'))
          if (imageItem) {
            event.preventDefault()
            const file = imageItem.getAsFile()
            if (file) {
              const reader = new FileReader()
              reader.onload = () => {
                const { schema } = view.state
                const node = schema.nodes.image?.create({ src: reader.result, alt: file.name })
                if (node) {
                  const tr = view.state.tr.replaceSelectionWith(node)
                  view.dispatch(tr)
                }
              }
              reader.readAsDataURL(file)
            }
            return true
          }
          // Jira URL paste
          const text = event.clipboardData?.getData('text/plain') ?? ''
          JIRA_URL_RE.lastIndex = 0
          const match = JIRA_URL_RE.exec(text.trim())
          if (!match) return false
          event.preventDefault()
          const insertPos = view.state.selection.from
          insertJiraNodeRef.current(text.trim(), insertPos)
          return true
        },
        handleDrop: (view, event) => {
          const files = Array.from(event.dataTransfer?.files ?? [])
          const imageFile = files.find((f) => f.type.startsWith('image/'))
          const pdfFile = files.find((f) => f.type === 'application/pdf')

          if (imageFile) {
            event.preventDefault()
            const reader = new FileReader()
            reader.onload = () => {
              const coords = view.posAtCoords({ left: event.clientX, top: event.clientY })
              const pos = coords?.pos ?? view.state.doc.content.size
              const { schema } = view.state
              const node = schema.nodes.image?.create({ src: reader.result, alt: imageFile.name })
              if (node) view.dispatch(view.state.tr.insert(pos, node))
            }
            reader.readAsDataURL(imageFile)
            return true
          }

          if (pdfFile) {
            event.preventDefault()
            const reader = new FileReader()
            reader.onload = () => {
              const coords = view.posAtCoords({ left: event.clientX, top: event.clientY })
              const pos = coords?.pos ?? view.state.doc.content.size
              const { schema } = view.state
              const node = schema.nodes.pdfAttachment?.create({
                filename: pdfFile.name,
                dataUrl: reader.result,
                size: pdfFile.size,
              })
              if (node) view.dispatch(view.state.tr.insert(pos, node))
            }
            reader.readAsDataURL(pdfFile)
            return true
          }

          return false
        },
    },
  })

  // insertJiraNode defined here (after useEditor) so `editor` is in scope
  const insertJiraNode = useCallback(async (url: string, insertPos: number) => {
    if (!editor) return
    JIRA_URL_RE.lastIndex = 0
    const match = JIRA_URL_RE.exec(url)
    if (!match) {
      setJiraInput((p) => ({ ...p, error: 'Not a valid Jira URL (needs /browse/KEY-123)', loading: false }))
      return
    }
    const key = match[1]
    setJiraInput((p) => ({ ...p, loading: true, error: '' }))
    const chip = await fetchJiraChip(url, key)
    setJiraInput((p) => ({ ...p, open: false, loading: false }))
    editor
      .chain()
      .focus()
      .insertContentAt(insertPos, {
        type: 'jiraTicket',
        attrs: {
          ticketKey: chip.key,
          summary: chip.error ? chip.key : chip.summary,
          status: chip.status,
          statusCategory: chip.statusCategory,
          url,
        },
      })
      .run()
  }, [editor])

  // Keep ref current so paste handler (created during useEditor) always calls latest
  insertJiraNodeRef.current = insertJiraNode

  const confirmCustomReminder = useCallback(() => {
    if (!customReminderState || !editor) return
    const { value, insertPos, lineText } = customReminderState
    if (!value) return
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return
    const badgeLabel = `@${formatReminderBadge(date)}`
    editor
      .chain()
      .focus()
      .insertContentAt(insertPos, `<span data-reminder="true" class="reminder-badge" data-date="${date.toISOString()}">${badgeLabel}</span>\u00A0`)
      .run()
    fireReminder(lineText || badgeLabel, date)
    setCustomReminderState(null)
  }, [customReminderState, editor, fireReminder])

  useEffect(() => {
    if (editorRef) editorRef.current = editor ?? null
  }, [editor, editorRef])

  /* ── Enhance bubble — opens /ai bar with selection context ───── */
  const handleEnhance = useCallback((ctx: EnhanceContext) => {
    onAiQueryTrigger?.(ctx)
  }, [onAiQueryTrigger])

  useEffect(() => {
    editor?.setEditable(!disabled)
  }, [disabled, editor])

  const prevContent = useRef(content)
  useEffect(() => {
    if (!editor) return
    if (content === prevContent.current) return
    prevContent.current = content

    const current = editor.getHTML()
    const next = content.startsWith('<') || !content.trim()
      ? (content || '<p></p>')
      : textToHtml(content)

    if (current !== next) {
      editor.commands.setContent(next, { emitUpdate: false })
    }
  }, [content, editor])

  const handleSelect = useCallback(
    (cmd: SlashCommand) => {
      if (!editor) return
      const props = menuState.commandProps as { command: (props: SlashCommand) => void }
      props.command(cmd)
      setMenuState((prev) => ({ ...prev, open: false }))
    },
    [editor, menuState.commandProps],
  )

  const handleAtSelect = useCallback(
    (opt: AtOption) => {
      if (!editor) return
      const props = atMenuState.commandProps as { command: (props: AtOption) => void }
      props.command(opt)
      setAtMenuState((prev) => ({ ...prev, open: false }))
    },
    [editor, atMenuState.commandProps],
  )

  // Jira link tooltip state
  const [jiraChip, setJiraChip] = useState<JiraChip | null>(null)
  const [chipPos, setChipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const chipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleEditorClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement
      const anchor = target.closest('a')
      if (!anchor) return
      const href = anchor.getAttribute('href')
      if (!href) return

      e.preventDefault()

      // Detect Jira URL — show chip immediately, fetch in background
      JIRA_URL_RE.lastIndex = 0
      const match = JIRA_URL_RE.exec(href)
      if (match) {
        const key = match[1]
        const rect = anchor.getBoundingClientRect()
        setChipPos({ x: rect.left, y: rect.bottom + 4 })
        // Show a loading chip right away so the user gets instant feedback
        setJiraChip({ key, summary: 'Loading…', status: '', statusCategory: 'todo', url: href, loading: true })
        fetchJiraChip(href, key).then((chip) => setJiraChip(chip))
      }

      // Open in system browser via Tauri bridge
      openUrl(href)
    },
    [],
  )

  const dismissChip = useCallback(() => {
    if (chipTimerRef.current) clearTimeout(chipTimerRef.current)
    chipTimerRef.current = setTimeout(() => setJiraChip(null), 200)
  }, [])

  return (
    <>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: link clicks handled here */}
      <div className="tiptap-editor-wrap" onClick={handleEditorClick}>
        <EditorContent editor={editor} className="tiptap-editor" />
      </div>

      {/* Jira URL input overlay (shown after /jira command) */}
      {jiraInput.open && (
        <div
          className="jira-url-overlay"
          style={{ position: 'fixed', top: jiraInput.position.top, left: jiraInput.position.left }}
        >
          <div className="jira-url-overlay-inner">
            <input
              ref={jiraInputRef}
              className="jira-url-input"
              type="text"
              placeholder="Paste Jira link…"
              value={jiraInput.value}
              onChange={(e) => setJiraInput((p) => ({ ...p, value: e.target.value, error: '' }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  insertJiraNode(jiraInput.value.trim(), jiraInput.insertPos)
                } else if (e.key === 'Escape') {
                  setJiraInput((p) => ({ ...p, open: false }))
                  editor?.commands.focus()
                }
              }}
              disabled={jiraInput.loading}
              autoFocus
            />
            <button
              type="button"
              className="jira-url-go"
              disabled={jiraInput.loading || !jiraInput.value.trim()}
              onMouseDown={(e) => {
                e.preventDefault()
                insertJiraNode(jiraInput.value.trim(), jiraInput.insertPos)
              }}
            >
              {jiraInput.loading ? '…' : '↵'}
            </button>
          </div>
          {jiraInput.error && <div className="jira-url-error">{jiraInput.error}</div>}
        </div>
      )}

      {jiraChip && (
        <div
          className="jira-link-chip"
          style={{ position: 'fixed', left: chipPos.x, top: chipPos.y }}
          onMouseLeave={dismissChip}
        >
          {!jiraChip.loading && !jiraChip.error && (
            <span className={`jira-dot ${jiraChip.statusCategory}`} />
          )}
          <a
            href={jiraChip.url}
            className="jira-chip-key"
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => { e.preventDefault(); openUrl(jiraChip.url) }}
          >
            {jiraChip.key}
          </a>
          {jiraChip.error ? (
            <span className="jira-chip-error">{jiraChip.error}</span>
          ) : (
            <>
              <span className="jira-chip-summary">{jiraChip.summary}</span>
              {jiraChip.status && <span className="jira-chip-status">{jiraChip.status}</span>}
            </>
          )}
          <button type="button" className="jira-chip-close" onClick={() => setJiraChip(null)}>×</button>
        </div>
      )}
      {/* Enhance bubble — single button that opens /ai bar with selection context */}
      <AIBubbleToolbar
        editor={editor ?? null}
        onEnhance={handleEnhance}
      />

      <SlashMenu
        open={menuState.open}
        query={menuState.query}
        position={menuState.position}
        items={menuState.items}
        selectedIndex={menuState.selectedIndex}
        onSelect={handleSelect}
      />
      <AtMenu
        state={atMenuState}
        selectedIndex={atSelectedIndex}
        onSelect={handleAtSelect}
      />

      {customReminderState?.open && (
        <div
          className="reminder-picker-overlay"
          style={{ position: 'fixed', top: customReminderState.position.top, left: customReminderState.position.left }}
        >
          <div className="reminder-picker-label">Set reminder date &amp; time</div>
          <div className="reminder-picker-row">
            <input
              ref={customDateInputRef}
              type="datetime-local"
              className="reminder-datetime-input"
              value={customReminderState.value}
              onChange={(e) => setCustomReminderState((p) => p ? { ...p, value: e.target.value } : null)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { setCustomReminderState(null); editor?.commands.focus() }
                if (e.key === 'Enter') { e.preventDefault(); confirmCustomReminder() }
              }}
            />
            <button type="button" className="reminder-picker-confirm" onMouseDown={(e) => { e.preventDefault(); confirmCustomReminder() }}>
              Set
            </button>
          </div>
        </div>
      )}
    </>
  )
}
