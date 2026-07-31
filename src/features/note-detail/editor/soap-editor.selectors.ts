import type { SoapSectionKey } from '@/domain/models/soap'

import type { SoapEditorState } from './soap-editor.types'
import { SOAP_SECTION_KEYS } from './soap-editor.types'

export function isEditorDirty(state: SoapEditorState): boolean {
  return state.dirtySections.size > 0
}

export function isSectionDirty(state: SoapEditorState, section: SoapSectionKey): boolean {
  return state.dirtySections.has(section)
}

export function getDirtySectionCount(state: SoapEditorState): number {
  return state.dirtySections.size
}

export function getDirtySections(state: SoapEditorState): readonly SoapSectionKey[] {
  return SOAP_SECTION_KEYS.filter((section) => state.dirtySections.has(section))
}

/**
 * Step 7B status label for local draft vs editor base version.
 * Does not claim server persistence.
 */
export function getEditorSaveLabel(state: SoapEditorState): string {
  const count = state.dirtySections.size
  if (count === 0) {
    return 'No local changes'
  }
  if (count === 1) {
    return '1 unsaved section'
  }
  return `${count} unsaved sections`
}
