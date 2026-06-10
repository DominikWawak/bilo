import type { Note, Section } from '../notes/model'

export type SearchResult = {
  note: Note
  sectionName: string | null
  score: number
  titleSnippet: string
  bodySnippet: string
  matchedQuery: string
}

// Strip HTML tags and decode basic HTML entities
const stripHtml = (html: string): string =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()

// Extract a snippet around the first match position
const snippet = (text: string, query: string, maxLen = 120): string => {
  const lc = text.toLowerCase()
  const lq = query.toLowerCase()
  const idx = lc.indexOf(lq)
  if (idx === -1) return text.slice(0, maxLen)
  const start = Math.max(0, idx - 40)
  const end = Math.min(text.length, idx + lq.length + 80)
  const s = (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '')
  return s
}

// Highlight matched tokens in a string with <mark> tags
export const highlightMatches = (text: string, tokens: string[]): string => {
  if (!tokens.length || !text) return text
  // Escape regex special chars
  const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const re = new RegExp(`(${escaped.join('|')})`, 'gi')
  return text.replace(re, '<mark>$1</mark>')
}

export type NoteIndex = Map<string, { plain: string; note: Note }>

export const buildIndex = (notes: Note[]): NoteIndex => {
  const idx: NoteIndex = new Map()
  for (const note of notes) {
    idx.set(note.id, { plain: stripHtml(note.body), note })
  }
  return idx
}

export const search = (
  query: string,
  index: NoteIndex,
  sections: Section[],
  limit = 12,
): SearchResult[] => {
  const raw = query.trim()
  if (!raw) return []

  const tokens = raw
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0)
  if (!tokens.length) return []

  const sectionMap = new Map(sections.map((s) => [s.id, s.name]))
  const results: SearchResult[] = []

  for (const { plain, note } of index.values()) {
    const titleLc = note.title.toLowerCase()
    const bodyLc = plain.toLowerCase()

    // All tokens must appear somewhere in title+body
    const allMatch = tokens.every(
      (t) => titleLc.includes(t) || bodyLc.includes(t),
    )
    if (!allMatch) continue

    // Score: title matches are worth more
    let score = 0
    for (const t of tokens) {
      if (titleLc.includes(t)) score += 10
      if (bodyLc.includes(t)) score += 1
    }
    // Boost exact phrase match in title
    if (tokens.length > 1 && titleLc.includes(raw.toLowerCase())) score += 20
    // Boost more recent notes slightly
    score += Math.min(5, (note.updatedAt - 1_000_000_000_000) / 1e12)

    const sectionName = note.sectionId ? (sectionMap.get(note.sectionId) ?? null) : null
    const firstToken = tokens[0]
    const bodySnip = snippet(plain, firstToken)

    results.push({
      note,
      sectionName,
      score,
      titleSnippet: note.title,
      bodySnippet: bodySnip,
      matchedQuery: raw,
    })
  }

  results.sort((a, b) => b.score - a.score)
  return results.slice(0, limit)
}
