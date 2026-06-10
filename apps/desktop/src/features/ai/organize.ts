/**
 * Minimal non-destructive cleanup: deduplicates exact lines, trims trailing
 * whitespace. Does NOT reformat prose into bullets. Used only for voice
 * transcript cleanup, not for note organize (which requires a real AI model).
 */
export const organizeNoteDeterministic = (input: string): string => {
  if (!input.trim()) return ''

  const lines = input.split('\n')
  const seen = new Set<string>()

  const deduped = lines.filter((line) => {
    const trimmed = line.trim()
    if (!trimmed) return true // keep blank lines — they mark paragraph breaks
    if (seen.has(trimmed)) return false
    seen.add(trimmed)
    return true
  })

  return deduped.map((line) => line.trimEnd()).join('\n').trim()
}
