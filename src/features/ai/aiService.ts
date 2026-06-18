import { invoke } from '@tauri-apps/api/core'

export const ORGANIZE_SYSTEM_PROMPT = `You are an expert note organizer embedded in a minimalist writing app.
Your task is to reorganize messy, unstructured notes into clean, readable Markdown — without removing a single piece of information.

Rules:
1. PRESERVE ALL CONTENT — every idea, task, and detail must survive. Never delete anything.
2. GROUP RELATED IDEAS under headings (## Heading) when there are 3 or more related items.
3. FORMAT NATURALLY — prose stays as prose, tasks become checkboxes (- [ ]), lists become bullet points.
4. TABLE DATA — if you see column-like content, format it as a proper Markdown table.
5. REMOVE DUPLICATES — drop lines that are identical or nearly identical.
6. FIX OBVIOUS GRAMMAR only when clearly broken. Preserve the author's voice.
7. Return ONLY the organized note. No preamble, no "Here is your organized note:" prefix. Just the note.`.trim()

export const AI_QUERY_SYSTEM_PROMPT = `You are a personal knowledge assistant embedded in a minimalist note-taking app.
You have access to the user's notes. Answer questions concisely and factually based only on what is in those notes.
If the information is not in the notes, say so briefly.
Today's date is provided — use it to answer time-relative questions like "this week" or "yesterday".
Format answers as clean Markdown. Be direct — no filler phrases.
When creating task/todo lists always use checkbox syntax: - [ ] task (unchecked) or - [x] task (checked).`.trim()

export const CURSOR_SUMMARY_PROMPT = `You are summarizing a Cursor AI coding session log.
Output ONLY 3-5 bullet points. Each bullet = one concrete thing that was built, fixed, or decided.
Be specific: use file names and feature names. No filler. No "the user asked..." or "the assistant said...".
Start each bullet with a past-tense verb.
Example output:
- Added CalendarView component with month/week/day auto-resize
- Fixed markdown-to-HTML conversion using marked library
- Removed Ollama/OpenAI providers, simplified AI to llama.cpp only
- Created @ reminder syntax wired to Apple Reminders via osascript`.trim()

export type NoteContext = {
  sectionName?: string
  siblingNotes?: { title: string; snippet: string }[]
  personalContext?: string
  allNotesSummary?: string
  todayDate?: string
}

export type AIServiceSettings = {
  acpApiKey: string
  kiroApiKey?: string
  preferredAgent?: 'cursor' | 'kiro'
}

const buildContextBlock = (ctx: NoteContext): string => {
  const parts: string[] = []
  if (ctx.personalContext?.trim()) parts.push(`About me: ${ctx.personalContext.trim()}`)
  if (ctx.sectionName) parts.push(`Current section: ${ctx.sectionName}`)
  if (ctx.siblingNotes?.length) {
    parts.push(
      'Related notes:\n' +
        ctx.siblingNotes.map((n) => `- ${n.title}: ${n.snippet}`).join('\n'),
    )
  }
  if (ctx.todayDate) parts.push(`Today's date: ${ctx.todayDate}`)
  if (ctx.allNotesSummary?.trim()) {
    parts.push(`User's notes (newest first):\n${ctx.allNotesSummary}`)
  }
  if (!parts.length) return ''
  return `\n\n--- USER CONTEXT ---\n${parts.join('\n')}`
}

const llmCall = async (
  settings: AIServiceSettings,
  systemPrompt: string,
  userContent: string,
  _maxTokens = 2048,
): Promise<string> => {
  const agent = settings.preferredAgent ?? 'cursor'
  const totalChars = systemPrompt.length + userContent.length

  if (agent === 'kiro') {
    if (!settings.kiroApiKey) throw new Error('No Kiro API key set. Open Settings → AI.')
    console.log(`[bilo/ai] invoking kiro-agent  prompt_chars=${totalChars}`)
    const t0 = performance.now()
    const result = await invoke<string>('kiro_query', {
      systemPrompt,
      userPrompt: userContent,
      apiKey: settings.kiroApiKey,
    })
    console.log(`[bilo/ai] kiro-agent responded in ${Math.round(performance.now() - t0)}ms`)
    if (!result.trim()) throw new Error('Kiro returned an empty response')
    return result.trim()
  }

  // Default: Cursor ACP
  if (!settings.acpApiKey) throw new Error('No Cursor API key set. Open Settings → AI.')
  console.log(`[bilo/ai] invoking cursor-agent  prompt_chars=${totalChars}`)
  const t0 = performance.now()
  const result = await invoke<string>('acp_query', {
    systemPrompt,
    userPrompt: userContent,
    apiKey: settings.acpApiKey,
  })
  console.log(`[bilo/ai] cursor-agent responded in ${Math.round(performance.now() - t0)}ms  response_chars=${result.length}`)
  if (!result.trim()) throw new Error('Cursor ACP returned an empty response')
  return result.trim()
}

export const organizeNote = async (
  text: string,
  settings: AIServiceSettings,
  ctx: NoteContext = {},
): Promise<string> => {
  const systemPrompt = ORGANIZE_SYSTEM_PROMPT + buildContextBlock(ctx)
  return llmCall(settings, systemPrompt, text)
}

export const aiQuery = async (
  question: string,
  settings: AIServiceSettings,
  ctx: NoteContext = {},
): Promise<string> => {
  const systemPrompt = AI_QUERY_SYSTEM_PROMPT + buildContextBlock(ctx)
  return llmCall(settings, systemPrompt, question)
}

export const suggestGrouping = async (
  notesText: string,
  settings: AIServiceSettings,
): Promise<{ noteId: string; suggestedSectionName: string; reason: string }[]> => {
  const prompt = `You are organizing notes into sections for a user.
Given a list of notes (id, title, snippet), suggest which section each note belongs in.
Infer section names from the content — use short, descriptive names like "Work", "Ideas", "Personal", "Dev", etc.
Return ONLY a valid JSON array, no prose, no markdown fences:
[{"noteId":"...","suggestedSectionName":"...","reason":"..."}]`

  const raw = await llmCall(settings, prompt, notesText, 1024)
  // Strip any accidental markdown fences
  const cleaned = raw.replace(/^```json?\s*/i, '').replace(/\s*```$/, '').trim()
  try {
    return JSON.parse(cleaned) as { noteId: string; suggestedSectionName: string; reason: string }[]
  } catch {
    throw new Error('AI returned malformed grouping JSON')
  }
}

export const summarizeCursorChat = async (
  assistantText: string,
  settings: AIServiceSettings,
): Promise<string> => {
  return llmCall(settings, CURSOR_SUMMARY_PROMPT, assistantText, 512)
}

export type SectionProfile = {
  id: string
  name: string
  /** Short description inferred from existing notes in this section */
  description: string
}

/**
 * Classify a note into one of the user's sections.
 * Returns the matching section id, or null if none fit.
 */
export const classifyNoteSection = async (
  noteText: string,
  sectionProfiles: SectionProfile[],
  settings: AIServiceSettings,
  personalContext?: string,
): Promise<string | null> => {
  if (!sectionProfiles.length || !noteText.trim()) return null

  const sectionList = sectionProfiles
    .map((s) => `- "${s.name}"${s.description ? `: ${s.description}` : ''}`)
    .join('\n')

  const systemPrompt = `You are a note filing assistant.
The user has these sections:
${sectionList}
${personalContext ? `\nAbout the user: ${personalContext}` : ''}

Given a note, reply with ONLY the section name that best fits, or the word "none" if no section fits.
Do not explain. No punctuation. Just the section name or "none".`.trim()

  const raw = await llmCall(settings, systemPrompt, noteText.slice(0, 600), 30)
  const answer = raw.trim().replace(/^["']|["']$/g, '').toLowerCase()
  if (answer === 'none' || !answer) return null
  // Find matching section (case-insensitive)
  const match = sectionProfiles.find((s) => s.name.toLowerCase() === answer)
  if (match) return match.id
  // Partial match fallback
  const partial = sectionProfiles.find((s) => s.name.toLowerCase().includes(answer) || answer.includes(s.name.toLowerCase()))
  return partial?.id ?? null
}
