export const insertTextAtSelection = (
  source: string,
  start: number,
  end: number,
  insert: string,
) => {
  const safeStart = Math.max(0, Math.min(start, source.length))
  const safeEnd = Math.max(safeStart, Math.min(end, source.length))
  const before = source.slice(0, safeStart)
  const after = source.slice(safeEnd)
  const next = `${before}${insert}${after}`
  const nextCursor = safeStart + insert.length

  return { next, nextCursor }
}
