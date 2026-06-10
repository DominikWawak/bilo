import type { Note } from '../notes/model'

const stripHtml = (html: string): string =>
  html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

export const buildWorklogMarkdown = (selectedDateKey: string, notes: Note[]) => {
  const header = `# Worklog ${selectedDateKey}`
  const items =
    notes.length === 0
      ? ['- No linked notes yet.']
      : notes.map((note) => {
          const plainBody = stripHtml(note.body)
          return `- ${note.title}\n  - ${plainBody.slice(0, 180) || 'No body yet.'}`
        })

  return `${header}\n\n## Summary\n${items.join('\n')}\n`
}
