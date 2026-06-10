import { useEffect, useMemo, useRef, useState } from 'react'
import type { Note, Section } from '../notes/model'
import { buildIndex, highlightMatches, search, type SearchResult } from './searchEngine'

type Props = {
  notes: Note[]
  sections: Section[]
  onSelect: (noteId: string) => void
  onClose: () => void
}

const DEBOUNCE_MS = 80

export const SearchPalette = ({ notes, sections, onSelect, onClose }: Props) => {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Build full-text index once per notes change
  const index = useMemo(() => buildIndex(notes), [notes])

  // Debounce search query
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [query])

  const results = useMemo(
    () => search(debouncedQuery, index, sections),
    [debouncedQuery, index, sections],
  )

  // Reset selection when results change
  useEffect(() => setSelectedIndex(0), [results])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex((i) => Math.min(i + 1, results.length - 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex((i) => Math.max(i - 1, 0)) }
      else if (e.key === 'Enter') {
        const r = results[selectedIndex]
        if (r) { onSelect(r.note.id); onClose() }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [results, selectedIndex, onSelect, onClose])

  // Scroll selected item into view
  useEffect(() => {
    const item = listRef.current?.querySelector<HTMLElement>(`[data-idx="${selectedIndex}"]`)
    item?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  const tokens = debouncedQuery
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0)

  const formatDate = (ts: number) => {
    const d = new Date(ts)
    const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000)
    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays}d ago`
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div className="search-overlay" onClick={handleOverlayClick} role="presentation">
      <div className="search-palette" role="dialog" aria-label="Search notes">
        <div className="search-input-row">
          <span className="search-icon" aria-hidden="true">⌕</span>
          <input
            ref={inputRef}
            className="search-input"
            type="text"
            placeholder="Search notes…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button type="button" className="search-clear" onClick={() => setQuery('')} aria-label="Clear">×</button>
          )}
          <button type="button" className="search-esc" onClick={onClose}>esc</button>
        </div>

        {debouncedQuery && (
          <div className="search-results" ref={listRef} role="listbox">
            {results.length === 0 ? (
              <div className="search-empty">No results for &ldquo;{debouncedQuery}&rdquo;</div>
            ) : (
              results.map((r: SearchResult, i: number) => (
                <ResultRow
                  key={r.note.id}
                  result={r}
                  tokens={tokens}
                  idx={i}
                  selected={i === selectedIndex}
                  onSelect={() => { onSelect(r.note.id); onClose() }}
                  onHover={() => setSelectedIndex(i)}
                  formatDate={formatDate}
                />
              ))
            )}
          </div>
        )}

        {!debouncedQuery && (
          <div className="search-hint">
            <span>Search across {notes.length} note{notes.length !== 1 ? 's' : ''}</span>
            <span className="search-hint-keys">
              <kbd>↑↓</kbd> navigate · <kbd>↵</kbd> open · <kbd>esc</kbd> close
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

type RowProps = {
  result: SearchResult
  tokens: string[]
  idx: number
  selected: boolean
  onSelect: () => void
  onHover: () => void
  formatDate: (ts: number) => string
}

const ResultRow = ({ result, tokens, idx, selected, onSelect, onHover, formatDate }: RowProps) => {
  const { note, sectionName, bodySnippet } = result
  const titleHtml = highlightMatches(note.title, tokens)
  const snippetHtml = highlightMatches(bodySnippet, tokens)

  return (
    <div
      className={`search-result-row${selected ? ' selected' : ''}`}
      data-idx={idx}
      onClick={onSelect}
      onMouseEnter={onHover}
      role="option"
      aria-selected={selected}
    >
      <div className="search-result-top">
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized highlight */}
        <span className="search-result-title" dangerouslySetInnerHTML={{ __html: titleHtml }} />
        <span className="search-result-right">
          {sectionName && <span className="search-result-section">{sectionName}</span>}
          <span className="search-result-date">{formatDate(note.updatedAt)}</span>
        </span>
      </div>
      {snippetHtml && (
        // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized highlight
        <div className="search-result-snippet" dangerouslySetInnerHTML={{ __html: snippetHtml }} />
      )}
    </div>
  )
}
