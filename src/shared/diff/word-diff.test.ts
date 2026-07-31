import { describe, expect, it } from 'vitest'

import { diffWords } from '@/shared/diff/word-diff'

describe('diffWords', () => {
  it('19: identical text produces one unchanged segment', () => {
    const result = diffWords('hello world', 'hello world')
    expect(result).toEqual([{ kind: 'UNCHANGED', value: 'hello world' }])
  })

  it('20: addition-only case', () => {
    const result = diffWords('hello', 'hello world')
    expect(result.some((s) => s.kind === 'ADDED' && s.value.includes('world'))).toBe(true)
    expect(result.some((s) => s.kind === 'REMOVED')).toBe(false)
  })

  it('21: removal-only case', () => {
    const result = diffWords('hello world', 'hello')
    expect(result.some((s) => s.kind === 'REMOVED' && s.value.includes('world'))).toBe(true)
    expect(result.some((s) => s.kind === 'ADDED')).toBe(false)
  })

  it('22: replacement case', () => {
    const result = diffWords('alpha beta', 'alpha gamma')
    expect(result.some((s) => s.kind === 'REMOVED' && s.value.includes('beta'))).toBe(true)
    expect(result.some((s) => s.kind === 'ADDED' && s.value.includes('gamma'))).toBe(true)
  })

  it('23: punctuation change', () => {
    const result = diffWords('ok.', 'ok!')
    expect(result.some((s) => s.kind === 'REMOVED')).toBe(true)
    expect(result.some((s) => s.kind === 'ADDED')).toBe(true)
  })

  it('24–25: empty-to-content and content-to-empty', () => {
    expect(diffWords('', 'hello').every((s) => s.kind === 'ADDED' || s.value.trim() === '')).toBe(
      true,
    )
    expect(diffWords('hello', '').every((s) => s.kind === 'REMOVED' || s.value.trim() === '')).toBe(
      true,
    )
  })

  it('26–29: whitespace readable; immutable; deterministic; no input mutation', () => {
    const base = 'line one\nline two'
    const compare = 'line one\nline two!'
    const first = diffWords(base, compare)
    const second = diffWords(base, compare)
    expect(first).toEqual(second)
    expect(base).toBe('line one\nline two')
    expect(() => {
      ;(first as unknown as { kind: string }[]).push({ kind: 'ADDED' })
    }).toThrow()
    expect(first.some((s) => s.value.includes('\n') || s.kind === 'UNCHANGED')).toBe(true)
  })
})
