import { cloneSoapContent, type SoapContent, type SoapSectionKey } from '@/domain/models/soap'

import type { SoapEditorAction, SoapEditorState } from './soap-editor.types'

export function soapContentEquals(a: SoapContent, b: SoapContent): boolean {
  return (
    a.subjective === b.subjective &&
    a.objective === b.objective &&
    a.assessment === b.assessment &&
    a.plan === b.plan
  )
}

function recalculateDirtySections(
  initialContent: SoapContent,
  draftContent: SoapContent,
): ReadonlySet<SoapSectionKey> {
  const dirty = new Set<SoapSectionKey>()
  if (draftContent.subjective !== initialContent.subjective) {
    dirty.add('subjective')
  }
  if (draftContent.objective !== initialContent.objective) {
    dirty.add('objective')
  }
  if (draftContent.assessment !== initialContent.assessment) {
    dirty.add('assessment')
  }
  if (draftContent.plan !== initialContent.plan) {
    dirty.add('plan')
  }
  return dirty
}

function cloneDirtySections(dirty: ReadonlySet<SoapSectionKey>): Set<SoapSectionKey> {
  return new Set(dirty)
}

function withDirtySection(
  dirty: ReadonlySet<SoapSectionKey>,
  section: SoapSectionKey,
  isDirty: boolean,
): ReadonlySet<SoapSectionKey> {
  const currentlyDirty = dirty.has(section)
  if (currentlyDirty === isDirty) {
    return dirty
  }
  const next = cloneDirtySections(dirty)
  if (isDirty) {
    next.add(section)
  } else {
    next.delete(section)
  }
  return next
}

export function createInitialSoapEditorState(input: {
  readonly noteId: SoapEditorState['noteId']
  readonly baseVersionId: SoapEditorState['baseVersionId']
  readonly content: SoapEditorState['initialContent']
}): SoapEditorState {
  const initialContent = cloneSoapContent(input.content)
  return {
    noteId: input.noteId,
    baseVersionId: input.baseVersionId,
    initialContent,
    draftContent: cloneSoapContent(initialContent),
    dirtySections: new Set<SoapSectionKey>(),
  }
}

export function soapEditorReducer(
  state: SoapEditorState,
  action: SoapEditorAction,
): SoapEditorState {
  switch (action.type) {
    case 'INITIALIZE': {
      return createInitialSoapEditorState({
        noteId: action.noteId,
        baseVersionId: action.baseVersionId,
        content: action.content,
      })
    }
    case 'UPDATE_SECTION': {
      const currentValue = state.draftContent[action.section]
      if (currentValue === action.value) {
        return state
      }
      const initialValue = state.initialContent[action.section]
      const isDirty = action.value !== initialValue
      const nextDirty = withDirtySection(state.dirtySections, action.section, isDirty)
      return {
        ...state,
        draftContent: Object.freeze({
          ...state.draftContent,
          [action.section]: action.value,
        }),
        dirtySections: nextDirty,
      }
    }
    case 'RESET_SECTION': {
      const initialValue = state.initialContent[action.section]
      if (
        state.draftContent[action.section] === initialValue &&
        !state.dirtySections.has(action.section)
      ) {
        return state
      }
      return {
        ...state,
        draftContent: Object.freeze({
          ...state.draftContent,
          [action.section]: initialValue,
        }),
        dirtySections: withDirtySection(state.dirtySections, action.section, false),
      }
    }
    case 'RESET_ALL': {
      if (
        state.dirtySections.size === 0 &&
        soapContentEquals(state.draftContent, state.initialContent)
      ) {
        return state
      }
      return {
        ...state,
        draftContent: cloneSoapContent(state.initialContent),
        dirtySections: new Set<SoapSectionKey>(),
      }
    }
    case 'ACCEPT_SAVED_VERSION': {
      const initialContent = cloneSoapContent(action.content)
      return {
        ...state,
        baseVersionId: action.baseVersionId,
        initialContent,
        draftContent: cloneSoapContent(initialContent),
        dirtySections: new Set<SoapSectionKey>(),
      }
    }
    case 'ACKNOWLEDGE_SAVED_VERSION': {
      // Ignore stale acknowledgments that would move the base backward or sideways.
      if (
        state.baseVersionId !== action.expectedBaseVersionId &&
        state.baseVersionId !== action.baseVersionId
      ) {
        return state
      }
      const initialContent = cloneSoapContent(action.savedContent)
      const dirtySections = recalculateDirtySections(initialContent, state.draftContent)
      if (
        state.baseVersionId === action.baseVersionId &&
        soapContentEquals(state.initialContent, initialContent) &&
        dirtySections.size === state.dirtySections.size &&
        [...dirtySections].every((section) => state.dirtySections.has(section))
      ) {
        return state
      }
      return {
        ...state,
        baseVersionId: action.baseVersionId,
        initialContent,
        draftContent: state.draftContent,
        dirtySections,
      }
    }
    case 'RESTORE_OFFLINE_DRAFT': {
      const draftContent = cloneSoapContent(action.draftContent)
      const dirtySections = recalculateDirtySections(state.initialContent, draftContent)
      if (
        state.baseVersionId === action.baseVersionId &&
        soapContentEquals(state.draftContent, draftContent) &&
        dirtySections.size === state.dirtySections.size &&
        [...dirtySections].every((section) => state.dirtySections.has(section))
      ) {
        return state
      }
      return {
        ...state,
        baseVersionId: action.baseVersionId,
        draftContent,
        dirtySections,
      }
    }
    default: {
      const _exhaustive: never = action
      return _exhaustive
    }
  }
}
