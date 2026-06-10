import { describe, expect, it } from 'vitest'
import type { Note } from '../notes/model'
import { buildWorklogMarkdown } from './worklog'

const createNote = (title: string, body: string): Note => ({
  id: `note-${title}`,
  title,
  body,
  linkedDateKey: '2026-06-02',
  sectionId: null,
  updatedAt: Date.now(),
})

describe('buildWorklogMarkdown', () => {
  it('returns fallback when no notes linked', () => {
    const markdown = buildWorklogMarkdown('2026-06-02', [])
    expect(markdown).toContain('# Worklog 2026-06-02')
    expect(markdown).toContain('No linked notes yet.')
  })

  it('returns summary bullets for linked notes', () => {
    const markdown = buildWorklogMarkdown('2026-06-02', [
      createNote('API cleanup', 'Normalized TODO blocks and removed duplicates'),
      createNote('Standup prep', 'Created status summary from work notes'),
    ])

    expect(markdown).toContain('- API cleanup')
    expect(markdown).toContain('- Standup prep')
    expect(markdown).toContain('## Summary')
  })

  it('trims overly long note body snippets for standup readability', () => {
    const longBody = 'a'.repeat(260)
    const markdown = buildWorklogMarkdown('2026-06-02', [
      createNote('Long note', longBody),
    ])
    expect(markdown).toContain('- Long note')
    expect(markdown).toContain(`- ${'a'.repeat(180)}`)
    expect(markdown).not.toContain(`- ${'a'.repeat(220)}`)
  })
})
