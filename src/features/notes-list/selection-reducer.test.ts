import { describe, expect, it } from 'vitest'

import { parseNoteId } from '@/domain/ids'
import {
  getSelectAllCheckboxState,
  INITIAL_NOTES_SELECTION,
  notesSelectionReducer,
} from '@/features/notes-list/selection-reducer'

const a = parseNoteId('note_a')
const b = parseNoteId('note_b')
const c = parseNoteId('note_c')

describe('notesSelectionReducer', () => {
  it('35–36: toggle selects/deselects without mutating prior Set', () => {
    const prior = notesSelectionReducer(INITIAL_NOTES_SELECTION, { type: 'TOGGLE', noteId: a })
    const priorSet = prior.selectedIds
    const next = notesSelectionReducer(prior, { type: 'TOGGLE', noteId: a })
    expect(priorSet.has(a)).toBe(true)
    expect(next.selectedIds.has(a)).toBe(false)
    expect(next.selectedIds).not.toBe(priorSet)
  })

  it('37–38: select/clear visible', () => {
    const selected = notesSelectionReducer(INITIAL_NOTES_SELECTION, {
      type: 'SELECT_VISIBLE',
      noteIds: [a, b],
    })
    expect([...selected.selectedIds]).toEqual([a, b])
    const withExtra = notesSelectionReducer(selected, { type: 'TOGGLE', noteId: c })
    const cleared = notesSelectionReducer(withExtra, {
      type: 'CLEAR_VISIBLE',
      noteIds: [a, b],
    })
    expect([...cleared.selectedIds]).toEqual([c])
  })

  it('39–41: prune retains visible and removes absent', () => {
    const selected = notesSelectionReducer(INITIAL_NOTES_SELECTION, {
      type: 'SELECT_VISIBLE',
      noteIds: [a, b, c],
    })
    const pruned = notesSelectionReducer(selected, { type: 'PRUNE', visibleIds: [b, c] })
    expect([...pruned.selectedIds].sort()).toEqual([b, c].sort())
  })

  it('42–44: clear all; order/duplicates do not inflate count', () => {
    const selected = notesSelectionReducer(INITIAL_NOTES_SELECTION, {
      type: 'SELECT_VISIBLE',
      noteIds: [a, b, a],
    })
    expect(selected.selectedIds.size).toBe(2)
    const cleared = notesSelectionReducer(selected, { type: 'CLEAR_ALL' })
    expect(cleared.selectedIds.size).toBe(0)
    expect(cleared).toBe(INITIAL_NOTES_SELECTION)
  })

  it('select-all checkbox state', () => {
    const selected = notesSelectionReducer(INITIAL_NOTES_SELECTION, {
      type: 'SELECT_VISIBLE',
      noteIds: [a],
    })
    expect(getSelectAllCheckboxState(selected.selectedIds, [a, b])).toBe('indeterminate')
    expect(getSelectAllCheckboxState(selected.selectedIds, [a])).toBe('checked')
    expect(getSelectAllCheckboxState(INITIAL_NOTES_SELECTION.selectedIds, [a, b])).toBe('unchecked')
  })
})
