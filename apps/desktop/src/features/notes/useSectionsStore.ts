import { useCallback, useMemo, useState } from 'react'
import { createEmptySection, type Section } from './model'

const STORAGE_KEY = 'bilo-sections-store'

const readFromStorage = (): Section[] => {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as Partial<Section>[]
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is Partial<Section> & { id: string; name: string } =>
        typeof item.id === 'string' && typeof item.name === 'string',
      )
      .map((item) => ({
        id: item.id,
        name: item.name,
        createdAt: item.createdAt ?? 0,
        showOnCalendar: item.showOnCalendar ?? false,
      }))
      .sort((a, b) => a.createdAt - b.createdAt)
  } catch {
    return []
  }
}

export const useSectionsStore = () => {
  const [sections, setSections] = useState<Section[]>(() => readFromStorage())

  const persist = (next: Section[]) => {
    setSections(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }

  const createSection = useCallback(
    (name: string) => {
      const section = createEmptySection(name)
      persist([...sections, section])
      return section
    },
    [sections],
  )

  const renameSection = useCallback(
    (id: string, name: string) => {
      persist(sections.map((s) => (s.id === id ? { ...s, name: name.trim() || s.name } : s)))
    },
    [sections],
  )

  const removeSection = useCallback(
    (id: string) => {
      persist(sections.filter((s) => s.id !== id))
    },
    [sections],
  )

  const toggleCalendar = useCallback(
    (id: string) => {
      persist(sections.map((s) => (s.id === id ? { ...s, showOnCalendar: !s.showOnCalendar } : s)))
    },
    [sections],
  )

  return useMemo(
    () => ({ sections, createSection, renameSection, removeSection, toggleCalendar }),
    [sections, createSection, renameSection, removeSection, toggleCalendar],
  )
}
