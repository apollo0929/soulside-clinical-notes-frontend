import { describe, expect, it } from 'vitest'

import { parseIsoDateTime } from '@/domain/datetime'
import { parsePatientId, parseUserId } from '@/domain/ids'
import { DEFAULT_NOTES_LIST_FILTERS } from '@/features/notes-list/notes-list.types'
import {
  notesListSearchParamsToString,
  parseNotesListSearchParams,
  serializeNotesListSearchParams,
} from '@/features/notes-list/notes-list-search-params'

describe('notes-list-search-params', () => {
  it('1: default empty URL returns default filters', () => {
    expect(parseNotesListSearchParams('')).toEqual(DEFAULT_NOTES_LIST_FILTERS)
    expect(parseNotesListSearchParams(new URLSearchParams())).toEqual(DEFAULT_NOTES_LIST_FILTERS)
  })

  it('2: valid multi-status URL parses', () => {
    const filters = parseNotesListSearchParams('status=APPROVED,IN_REVIEW')
    expect(filters.statuses).toEqual(['IN_REVIEW', 'APPROVED'])
  })

  it('3: invalid status is ignored', () => {
    const filters = parseNotesListSearchParams('status=APPROVED,NOT_A_STATUS,LOCKED')
    expect(filters.statuses).toEqual(['APPROVED', 'LOCKED'])
  })

  it('4: valid sort parses', () => {
    expect(parseNotesListSearchParams('sort=patientDisplayName').sortField).toBe(
      'patientDisplayName',
    )
  })

  it('5: invalid sort falls back', () => {
    expect(parseNotesListSearchParams('sort=nope').sortField).toBe('updatedAt')
  })

  it('6: valid direction parses', () => {
    expect(parseNotesListSearchParams('direction=asc').sortDirection).toBe('asc')
  })

  it('7: invalid direction falls back', () => {
    expect(parseNotesListSearchParams('direction=sideways').sortDirection).toBe('desc')
  })

  it('8: reviewer and patient IDs parse safely', () => {
    const filters = parseNotesListSearchParams('reviewer=usr_reviewer_42_0&patient=pat_42_1')
    expect(filters.assignedReviewerId).toBe(parseUserId('usr_reviewer_42_0'))
    expect(filters.patientId).toBe(parsePatientId('pat_42_1'))
  })

  it('9: date range parses', () => {
    const from = '2024-06-01T00:00:00.000Z'
    const to = '2024-07-01T00:00:00.000Z'
    const filters = parseNotesListSearchParams(`from=${from}&to=${to}`)
    expect(filters.dateFrom).toBe(parseIsoDateTime(from))
    expect(filters.dateTo).toBe(parseIsoDateTime(to))
  })

  it('10: search text parses and trims', () => {
    expect(parseNotesListSearchParams('q=%20Avery%20').searchQuery).toBe('Avery')
  })

  it('11: serializer omits defaults', () => {
    expect(serializeNotesListSearchParams(DEFAULT_NOTES_LIST_FILTERS).toString()).toBe('')
  })

  it('12: serializer orders statuses deterministically', () => {
    const params = serializeNotesListSearchParams({
      ...DEFAULT_NOTES_LIST_FILTERS,
      statuses: ['LOCKED', 'APPROVED', 'IN_REVIEW'],
    })
    expect(params.get('status')).toBe('IN_REVIEW,APPROVED,LOCKED')
  })

  it('13: parse-serialize round trip is canonical', () => {
    const raw = 'status=LOCKED,APPROVED&sort=status&direction=asc&q=  hello  &unknown=keep'
    const parsed = parseNotesListSearchParams(raw)
    const serialized = notesListSearchParamsToString(parsed)
    expect(serialized).toBe('status=APPROVED%2CLOCKED&q=hello&sort=status&direction=asc')
    expect(parseNotesListSearchParams(serialized)).toEqual(parsed)
  })
})
