import { marked } from 'marked'

export const htmlToText = (html: string): string => {
  if (!html || !html.trim()) return ''
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Extract just the first meaningful line of text from HTML (for note titles) */
export const htmlFirstLine = (html: string): string => {
  if (!html || !html.trim()) return ''
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    // Walk block elements in order and return the first non-empty text
    const selectors = 'h1, h2, h3, h4, p, li, td, blockquote > p'
    const els = doc.querySelectorAll(selectors)
    for (const el of Array.from(els)) {
      const text = (el.textContent ?? '').trim()
      if (text) return text.slice(0, 80)
    }
    return htmlToText(html).slice(0, 80)
  } catch {
    return html.replace(/<[^>]+>/g, '').trim().slice(0, 80)
  }
}

/** Extract a short plain-text snippet (2-3 lines worth) from HTML for previews */
export const htmlSnippet = (html: string, maxLen = 140): string => {
  if (!html || !html.trim()) return ''
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const selectors = 'p, li, h1, h2, h3, h4, td'
    const els = doc.querySelectorAll(selectors)
    const lines: string[] = []
    for (const el of Array.from(els)) {
      const text = (el.textContent ?? '').trim()
      if (text) {
        lines.push(text)
        if (lines.join(' ').length >= maxLen) break
      }
    }
    const result = lines.join(' · ')
    return result.length > maxLen ? result.slice(0, maxLen) + '…' : result
  } catch {
    return htmlToText(html).slice(0, maxLen)
  }
}

export const markdownToHtml = (markdown: string): string => {
  if (!markdown.trim()) return '<p></p>'
  if (/^\s*<[a-zA-Z]/.test(markdown)) return markdown
  return marked.parse(markdown, { async: false }) as string
}

export const textToHtml = markdownToHtml

/**
 * Convert AI-returned markdown to Tiptap-compatible HTML.
 * Specifically handles `- [ ] task` and `- [x] task` patterns which must be
 * transformed to Tiptap's TaskList/TaskItem HTML (data-type attributes) so
 * they render as real interactive checkboxes rather than plain text.
 */
export const aiResponseToTiptapHtml = (text: string): string => {
  if (!text.trim()) return ''

  const lines = text.split('\n')
  const output: string[] = []
  let inTaskList = false

  for (const line of lines) {
    // Match `- [ ] text`, `* [ ] text`, `- [x] text`, `- [X] text` etc.
    const taskMatch = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)/)
    if (taskMatch) {
      if (!inTaskList) {
        output.push('<ul data-type="taskList">')
        inTaskList = true
      }
      const checked = taskMatch[1].toLowerCase() === 'x'
      const content = taskMatch[2].trim()
      output.push(`<li data-type="taskItem" data-checked="${checked}"><p>${content}</p></li>`)
    } else {
      if (inTaskList) {
        output.push('</ul>')
        inTaskList = false
      }
      output.push(line)
    }
  }

  if (inTaskList) output.push('</ul>')

  const joined = output.join('\n')
  // markdownToHtml passes raw HTML blocks through, converting only markdown parts
  return markdownToHtml(joined)
}
