import type { NoteId } from '@/domain/ids'

export type NotesSelectionState = {
  readonly selectedIds: ReadonlySet<NoteId>
}

export type NotesSelectionAction =
  | { readonly type: 'TOGGLE'; readonly noteId: NoteId }
  | { readonly type: 'SELECT_VISIBLE'; readonly noteIds: readonly NoteId[] }
  | { readonly type: 'CLEAR_VISIBLE'; readonly noteIds: readonly NoteId[] }
  | { readonly type: 'PRUNE'; readonly visibleIds: readonly NoteId[] }
  | { readonly type: 'REMOVE'; readonly noteIds: readonly NoteId[] }
  | { readonly type: 'CLEAR_ALL' }

export const INITIAL_NOTES_SELECTION: NotesSelectionState = Object.freeze({
  selectedIds: Object.freeze(new Set<NoteId>()) as ReadonlySet<NoteId>,
})

/**
 * Immutable new Set wrappers. Object.freeze does not make Set contents
 * runtime-immutable; callers must treat returned Sets as ReadonlySet.
 */
function freezeSet(ids: Iterable<NoteId>): ReadonlySet<NoteId> {
  return Object.freeze(new Set(ids)) as ReadonlySet<NoteId>
}

function setsEqual(a: ReadonlySet<NoteId>, b: ReadonlySet<NoteId>): boolean {
  if (a.size !== b.size) {
    return false
  }
  for (const id of a) {
    if (!b.has(id)) {
      return false
    }
  }
  return true
}

export function notesSelectionReducer(
  state: NotesSelectionState,
  action: NotesSelectionAction,
): NotesSelectionState {
  switch (action.type) {
    case 'TOGGLE': {
      const next = new Set(state.selectedIds)
      if (next.has(action.noteId)) {
        next.delete(action.noteId)
      } else {
        next.add(action.noteId)
      }
      return { selectedIds: freezeSet(next) }
    }
    case 'SELECT_VISIBLE': {
      if (action.noteIds.length === 0) {
        return state
      }
      const next = new Set(state.selectedIds)
      for (const id of action.noteIds) {
        next.add(id)
      }
      if (setsEqual(state.selectedIds, next)) {
        return state
      }
      return { selectedIds: freezeSet(next) }
    }
    case 'CLEAR_VISIBLE': {
      if (action.noteIds.length === 0) {
        return state
      }
      const remove = new Set(action.noteIds)
      const next = new Set<NoteId>()
      for (const id of state.selectedIds) {
        if (!remove.has(id)) {
          next.add(id)
        }
      }
      if (setsEqual(state.selectedIds, next)) {
        return state
      }
      return { selectedIds: freezeSet(next) }
    }
    case 'PRUNE': {
      const visible = new Set(action.visibleIds)
      const next = new Set<NoteId>()
      for (const id of state.selectedIds) {
        if (visible.has(id)) {
          next.add(id)
        }
      }
      if (setsEqual(state.selectedIds, next)) {
        return state
      }
      return { selectedIds: freezeSet(next) }
    }
    case 'REMOVE': {
      if (action.noteIds.length === 0) {
        return state
      }
      const remove = new Set(action.noteIds)
      const next = new Set<NoteId>()
      for (const id of state.selectedIds) {
        if (!remove.has(id)) {
          next.add(id)
        }
      }
      if (setsEqual(state.selectedIds, next)) {
        return state
      }
      return { selectedIds: freezeSet(next) }
    }
    case 'CLEAR_ALL': {
      if (state.selectedIds.size === 0) {
        return state
      }
      return INITIAL_NOTES_SELECTION
    }
    default: {
      const _exhaustive: never = action
      return _exhaustive
    }
  }
}

export function getSelectAllCheckboxState(
  selectedIds: ReadonlySet<NoteId>,
  visibleIds: readonly NoteId[],
): 'checked' | 'unchecked' | 'indeterminate' {
  if (visibleIds.length === 0) {
    return 'unchecked'
  }
  let selectedVisible = 0
  for (const id of visibleIds) {
    if (selectedIds.has(id)) {
      selectedVisible += 1
    }
  }
  if (selectedVisible === 0) {
    return 'unchecked'
  }
  if (selectedVisible === visibleIds.length) {
    return 'checked'
  }
  return 'indeterminate'
}
