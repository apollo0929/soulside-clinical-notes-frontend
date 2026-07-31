import { describe, expect, it } from 'vitest'

import { parseVersionId } from '@/domain/ids'
import {
  canCompareVersions,
  INITIAL_VERSION_COMPARISON,
  versionComparisonReducer,
} from '@/features/note-detail/version-comparison-reducer'

const current = parseVersionId('ver_current')
const parent = parseVersionId('ver_parent')
const other = parseVersionId('ver_other')

describe('versionComparisonReducer', () => {
  it('30: default selects current and parent', () => {
    const next = versionComparisonReducer(INITIAL_VERSION_COMPARISON, {
      type: 'RESET',
      currentVersionId: current,
      parentVersionId: parent,
    })
    expect(next.compareVersionId).toBe(current)
    expect(next.baseVersionId).toBe(parent)
  })

  it('31: single-version history uses current for both sides', () => {
    const next = versionComparisonReducer(INITIAL_VERSION_COMPARISON, {
      type: 'RESET',
      currentVersionId: current,
      parentVersionId: null,
    })
    expect(next.baseVersionId).toBe(current)
    expect(next.compareVersionId).toBe(current)
    expect(canCompareVersions(next)).toBe(false)
  })

  it('32–36: selecting base/compare uses IDs; any versions; same-version disables diff', () => {
    let state = versionComparisonReducer(INITIAL_VERSION_COMPARISON, {
      type: 'RESET',
      currentVersionId: current,
      parentVersionId: parent,
    })
    state = versionComparisonReducer(state, { type: 'SET_BASE', versionId: other })
    expect(state.baseVersionId).toBe(other)
    expect(state.compareVersionId).toBe(current)
    state = versionComparisonReducer(state, { type: 'SET_COMPARE', versionId: other })
    expect(state.compareVersionId).toBe(other)
    expect(canCompareVersions(state)).toBe(false)
    state = versionComparisonReducer(state, { type: 'SET_COMPARE', versionId: current })
    expect(canCompareVersions(state)).toBe(true)
  })

  it('34: note change clear then reset replaces selections', () => {
    const first = versionComparisonReducer(INITIAL_VERSION_COMPARISON, {
      type: 'RESET',
      currentVersionId: current,
      parentVersionId: parent,
    })
    const cleared = versionComparisonReducer(first, { type: 'CLEAR' })
    expect(cleared.baseVersionId).toBeNull()
    expect(cleared.compareVersionId).toBeNull()
    const second = versionComparisonReducer(cleared, {
      type: 'RESET',
      currentVersionId: other,
      parentVersionId: null,
    })
    expect(second.compareVersionId).toBe(other)
    expect(second.baseVersionId).toBe(other)
  })
})
