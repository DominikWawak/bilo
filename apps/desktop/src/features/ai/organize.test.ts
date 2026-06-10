import { describe, expect, it } from 'vitest'
import { organizeNoteDeterministic } from './organize'

describe('organizeNoteDeterministic', () => {
  it('preserves prose as-is — does not convert to bullets', () => {
    const output = organizeNoteDeterministic('todo one\ntodo two')
    expect(output).toBe('todo one\ntodo two')
  })

  it('removes exact duplicate lines while preserving first occurrence order', () => {
    const output = organizeNoteDeterministic('a\nb\na\nb\nc')
    expect(output).toBe('a\nb\nc')
  })

  it('keeps existing markdown formatting untouched', () => {
    const output = organizeNoteDeterministic('- ship draft\n1. test case\n[ ] follow up')
    expect(output).toContain('- ship draft')
    expect(output).toContain('1. test case')
    expect(output).toContain('[ ] follow up')
  })

  it('preserves paragraph breaks (blank lines)', () => {
    const output = organizeNoteDeterministic('para one\n\npara two')
    expect(output).toContain('\n\n')
  })

  it('trims trailing whitespace from lines', () => {
    const output = organizeNoteDeterministic('hello   \nworld  ')
    expect(output).toBe('hello\nworld')
  })

  it('returns empty string for blank input', () => {
    expect(organizeNoteDeterministic('')).toBe('')
    expect(organizeNoteDeterministic('   ')).toBe('')
  })
})
