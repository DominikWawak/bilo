import { describe, expect, it } from 'vitest'
import { insertTextAtSelection } from './insertText'

describe('insertTextAtSelection', () => {
  it('inserts at caret', () => {
    const result = insertTextAtSelection('hello world', 5, 5, ', brave')
    expect(result.next).toBe('hello, brave world')
    expect(result.nextCursor).toBe(12)
  })

  it('replaces selected range', () => {
    const result = insertTextAtSelection('todo old value', 5, 14, 'new value')
    expect(result.next).toBe('todo new value')
  })

  it('clamps invalid selection bounds', () => {
    const result = insertTextAtSelection('abc', -5, 99, 'z')
    expect(result.next).toBe('z')
    expect(result.nextCursor).toBe(1)
  })
})
