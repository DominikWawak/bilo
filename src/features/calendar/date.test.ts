import { describe, expect, it } from 'vitest'
import { toDateKey, toDateLabel } from './date'

describe('calendar date helpers', () => {
  it('formats stable date key', () => {
    const key = toDateKey(new Date('2026-06-02T10:20:00.000Z'))
    expect(key).toBe('2026-06-02')
  })

  it('creates readable date label', () => {
    const label = toDateLabel('2026-06-02')
    expect(label).toContain('2026')
    expect(label.toLowerCase()).toContain('jun')
  })
})
