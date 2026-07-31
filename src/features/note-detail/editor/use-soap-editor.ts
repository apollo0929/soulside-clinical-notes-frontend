import { useReducer, useState } from 'react'

import type { NoteId, VersionId } from '@/domain/ids'
import type { SoapContent } from '@/domain/models/soap'

import { evaluateEditorReinitialization } from './editor-reinitialization'
import { createInitialSoapEditorState, soapEditorReducer } from './soap-editor.reducer'
import {
  getDirtySectionCount,
  getDirtySections,
  getEditorSaveLabel,
  isEditorDirty,
  isSectionDirty,
} from './soap-editor.selectors'
import type { SoapEditorAction, SoapEditorState, SoapSectionKey } from './soap-editor.types'

export type UseSoapEditorArgs = {
  readonly noteId: NoteId | null
  readonly currentVersionId: VersionId | null
  readonly currentContent: SoapContent | null
  readonly enabled: boolean
}

export type UseSoapEditorResult = {
  readonly isEditing: boolean
  readonly state: SoapEditorState | null
  readonly dirty: boolean
  readonly saveLabel: string
  readonly dirtyCount: number
  readonly dirtySections: readonly SoapSectionKey[]
  readonly newerVersionWarning: boolean
  readonly beginEdit: () => void
  readonly exitEdit: () => void
  readonly dispatch: (action: SoapEditorAction) => void
  readonly isSectionDirty: (section: SoapSectionKey) => boolean
  readonly discardAndExit: () => void
}

function nullableSoapEditorReducer(
  state: SoapEditorState | null,
  action: SoapEditorAction,
): SoapEditorState | null {
  if (state === null) {
    if (action.type === 'INITIALIZE') {
      return createInitialSoapEditorState({
        noteId: action.noteId,
        baseVersionId: action.baseVersionId,
        content: action.content,
      })
    }
    return null
  }
  return soapEditorReducer(state, action)
}

/**
 * Local SOAP editor session.
 * Edit mode requires access (`enabled`), matching note id, and an initialized state.
 * Clean REINITIALIZE commits via render-time dispatch (React state-adjustment pattern).
 */
export function useSoapEditor({
  noteId,
  currentVersionId,
  currentContent,
  enabled,
}: UseSoapEditorArgs): UseSoapEditorResult {
  const [wantsEditing, setWantsEditing] = useState(false)
  const [state, dispatch] = useReducer(nullableSoapEditorReducer, null)

  const isEditing =
    enabled && wantsEditing && state !== null && noteId !== null && state.noteId === noteId

  const syncDecision =
    isEditing && state && currentVersionId
      ? evaluateEditorReinitialization({
          editorBaseVersionId: state.baseVersionId,
          incomingVersionId: currentVersionId,
          isDirty: isEditorDirty(state),
        })
      : 'NO_CHANGE'

  // Commit clean head changes into reducer state during render so UI and store stay aligned.
  if (
    syncDecision === 'REINITIALIZE' &&
    noteId !== null &&
    currentVersionId !== null &&
    currentContent !== null
  ) {
    dispatch({
      type: 'INITIALIZE',
      noteId,
      baseVersionId: currentVersionId,
      content: currentContent,
    })
  }

  const activeState = isEditing ? state : null

  const beginEdit = () => {
    if (!enabled || noteId === null || currentVersionId === null || currentContent === null) {
      return
    }
    dispatch({
      type: 'INITIALIZE',
      noteId,
      baseVersionId: currentVersionId,
      content: currentContent,
    })
    setWantsEditing(true)
  }

  const exitEdit = () => {
    setWantsEditing(false)
  }

  const discardAndExit = () => {
    dispatch({ type: 'RESET_ALL' })
    setWantsEditing(false)
  }

  return {
    isEditing,
    state: activeState,
    dirty: activeState ? isEditorDirty(activeState) : false,
    saveLabel: activeState ? getEditorSaveLabel(activeState) : 'No local changes',
    dirtyCount: activeState ? getDirtySectionCount(activeState) : 0,
    dirtySections: activeState ? getDirtySections(activeState) : [],
    newerVersionWarning: syncDecision === 'PRESERVE_DIRTY_AND_WARN',
    beginEdit,
    exitEdit,
    dispatch,
    isSectionDirty: (section) => (activeState ? isSectionDirty(activeState, section) : false),
    discardAndExit,
  }
}
