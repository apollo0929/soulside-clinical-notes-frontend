import { describe, expect, it } from 'vitest'

import { classifySectionConflict } from './classify-section-conflict'

describe('classifySectionConflict', () => {
  it('1–5: classifies unchanged, local-only, server-only, same-change, and conflict', () => {
    expect(classifySectionConflict({ ancestor: 'a', local: 'a', server: 'a' })).toBe('UNCHANGED')
    expect(classifySectionConflict({ ancestor: 'a', local: 'b', server: 'a' })).toBe('LOCAL_ONLY')
    expect(classifySectionConflict({ ancestor: 'a', local: 'a', server: 'c' })).toBe('SERVER_ONLY')
    expect(classifySectionConflict({ ancestor: 'a', local: 'b', server: 'b' })).toBe('SAME_CHANGE')
    expect(classifySectionConflict({ ancestor: 'a', local: 'b', server: 'c' })).toBe('CONFLICT')
  })

  it('6–9: whitespace and empty strings matter; deterministic; inputs untouched', () => {
    expect(classifySectionConflict({ ancestor: 'a', local: 'a ', server: 'a' })).toBe('LOCAL_ONLY')
    expect(classifySectionConflict({ ancestor: '', local: 'x', server: '' })).toBe('LOCAL_ONLY')
    expect(classifySectionConflict({ ancestor: 'a', local: '', server: '' })).toBe('SAME_CHANGE')
    const input = { ancestor: 'a', local: 'b', server: 'c' }
    expect(classifySectionConflict(input)).toBe('CONFLICT')
    expect(classifySectionConflict(input)).toBe('CONFLICT')
    expect(input).toEqual({ ancestor: 'a', local: 'b', server: 'c' })
  })
})
