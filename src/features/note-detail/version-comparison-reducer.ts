import type { VersionId } from '@/domain/ids'
import type {
  VersionComparisonAction,
  VersionComparisonState,
} from '@/features/note-detail/note-detail.types'

export const INITIAL_VERSION_COMPARISON: VersionComparisonState = Object.freeze({
  baseVersionId: null,
  compareVersionId: null,
})

/**
 * Same-version policy: selecting the same ID for both sides is allowed in state
 * but the UI treats it as non-diff (read-only content remains visible).
 */
export function versionComparisonReducer(
  state: VersionComparisonState,
  action: VersionComparisonAction,
): VersionComparisonState {
  switch (action.type) {
    case 'CLEAR':
      if (state.baseVersionId === null && state.compareVersionId === null) {
        return state
      }
      return INITIAL_VERSION_COMPARISON
    case 'RESET': {
      const compareVersionId = action.currentVersionId
      const baseVersionId = action.parentVersionId ?? action.currentVersionId
      return { baseVersionId, compareVersionId }
    }
    case 'SET_BASE':
      return { ...state, baseVersionId: action.versionId }
    case 'SET_COMPARE':
      return { ...state, compareVersionId: action.versionId }
    default: {
      const _exhaustive: never = action
      return _exhaustive
    }
  }
}

export function canCompareVersions(state: VersionComparisonState): boolean {
  return (
    state.baseVersionId !== null &&
    state.compareVersionId !== null &&
    state.baseVersionId !== state.compareVersionId
  )
}

export type { VersionId }
