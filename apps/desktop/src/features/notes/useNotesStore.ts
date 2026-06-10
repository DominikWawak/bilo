import { useCallback, useMemo, useState } from 'react'
import { createEmptyNote, type Note } from './model'

const STORAGE_KEY = 'bilo-notes-store'

const readFromStorage = (): Note[] => {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw) as Partial<Note>[]
    if (!Array.isArray(parsed)) return []
    const normalized = parsed
      .filter((item): item is Partial<Note> & { id: string } => typeof item.id === 'string')
      .map((item) => ({
        id: item.id,
        title: item.title ?? 'Untitled',
        body: item.body ?? '',
        linkedDateKey: item.linkedDateKey ?? null,
        sectionId: item.sectionId ?? null,
        updatedAt: item.updatedAt ?? Date.now(),
      }))
    return normalized.sort((a, b) => b.updatedAt - a.updatedAt)
  } catch {
    return []
  }
}

export const useNotesStore = () => {
  const [notes, setNotes] = useState<Note[]>(() => readFromStorage())

  const createNote = useCallback((sectionId: string | null = null) => {
    const note = createEmptyNote(sectionId)
    setNotes((current) => {
      const sorted = [...current, note].sort((a, b) => b.updatedAt - a.updatedAt)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sorted))
      return sorted
    })
    return note
  }, [])

  const upsertNote = useCallback((note: Note) => {
    setNotes((current) => {
      const filtered = current.filter((item) => item.id !== note.id)
      const sorted = [...filtered, note].sort((a, b) => b.updatedAt - a.updatedAt)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sorted))
      return sorted
    })
  }, [])

  const removeNote = useCallback((noteId: string) => {
    setNotes((current) => {
      const sorted = current.filter((note) => note.id !== noteId)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sorted))
      return sorted
    })
  }, [])

  return useMemo(
    () => ({ notes, createNote, upsertNote, removeNote }),
    [createNote, notes, removeNote, upsertNote],
  )
}
