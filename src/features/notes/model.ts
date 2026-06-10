export type Note = {
  id: string
  title: string
  body: string
  linkedDateKey: string | null
  sectionId: string | null
  updatedAt: number
}

export const createEmptyNote = (sectionId: string | null = null): Note => ({
  id: `note-${crypto.randomUUID()}`,
  title: 'Untitled',
  body: '',
  linkedDateKey: null,
  sectionId,
  updatedAt: Date.now(),
})

export type Section = {
  id: string
  name: string
  createdAt: number
  showOnCalendar: boolean
}

export const createEmptySection = (name: string): Section => ({
  id: `sec-${crypto.randomUUID()}`,
  name: name.trim() || 'Untitled',
  createdAt: Date.now(),
  showOnCalendar: false,
})
