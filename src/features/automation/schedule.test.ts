import { describe, expect, it } from 'vitest'
import { formatLastRun, normalizeTime, shouldRunNow } from './schedule'

describe('automation schedule helpers', () => {
  it('normalizes valid time input', () => {
    expect(normalizeTime('6:7')).toBe('18:00')
    expect(normalizeTime('06:07')).toBe('06:07')
  })

  it('falls back for invalid values', () => {
    expect(normalizeTime('99:00')).toBe('18:00')
    expect(normalizeTime('invalid')).toBe('18:00')
  })

  it('formats last run fallback text', () => {
    expect(formatLastRun(null)).toBe('Never')
  })

  it('decides when scheduler should run', () => {
    const now = new Date('2026-06-02T18:00:10')
    expect(shouldRunNow(now, '18:00', null)).toBe(true)
    expect(shouldRunNow(now, '17:59', null)).toBe(false)
    expect(shouldRunNow(now, '18:00', now.getTime())).toBe(false)
  })
})
