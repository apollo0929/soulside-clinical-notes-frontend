import { describe, expect, it } from 'vitest'

import { parseNoteId, parseVersionId } from '@/domain/ids'
import { buildSoapContent } from '@/test/fixtures/domain'

import { createInitialSoapEditorState, soapEditorReducer } from './soap-editor.reducer'
import {
  getDirtySectionCount,
  getDirtySections,
  getEditorSaveLabel,
  isEditorDirty,
  isSectionDirty,
} from './soap-editor.selectors'

describe('soap editor selectors', () => {
  const base = createInitialSoapEditorState({
    noteId: parseNoteId('note_sel_1'),
    baseVersionId: parseVersionId('ver_sel_1'),
    content: buildSoapContent(),
  })

  it('19–25: dirty flags, counts, and labels', () => {
    expect(isEditorDirty(base)).toBe(false)
    expect(getDirtySectionCount(base)).toBe(0)
    expect(getDirtySections(base)).toEqual([])
    expect(getEditorSaveLabel(base)).toBe('No local changes')

    const one = soapEditorReducer(base, {
      type: 'UPDATE_SECTION',
      section: 'plan',
      value: 'P2',
    })
    expect(isEditorDirty(one)).toBe(true)
    expect(isSectionDirty(one, 'plan')).toBe(true)
    expect(isSectionDirty(one, 'subjective')).toBe(false)
    expect(getDirtySectionCount(one)).toBe(1)
    expect(getDirtySections(one)).toEqual(['plan'])
    expect(getEditorSaveLabel(one)).toBe('1 unsaved section')

    const two = soapEditorReducer(one, {
      type: 'UPDATE_SECTION',
      section: 'objective',
      value: 'O2',
    })
    expect(getDirtySectionCount(two)).toBe(2)
    expect(getEditorSaveLabel(two)).toBe('2 unsaved sections')
  })
})
