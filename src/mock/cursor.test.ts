import { describe, expect, it } from 'vitest'

import { parseIsoDateTime } from '@/domain/datetime'
import {
  assertCursorMatchesQuery,
  buildQueryFingerprint,
  decodeCursor,
  encodeCursor,
  type NotesListCursorPayload,
} from '@/mock/cursor'
import { isMockApiError } from '@/mock/errors'
import { listNotesFromDatabase, type NotesListRequest } from '@/mock/services/notes-list'
import { createTestDatabase } from '@/mock/test/helpers'

describe('cursor pagination', () => {
  const sample: NotesListCursorPayload = {
    v: 1,
    sort: 'updatedAt',
    dir: 'desc',
    primary: '2024-06-01T12:00:00.000Z',
    id: 'note_1',
    fingerprint: 'fp',
  }

  it('19: encode/decode round-trip succeeds', () => {
    const encoded = encodeCursor(sample)
    const decoded = decodeCursor(encoded)
    expect(decoded).toEqual(sample)
  })

  it('20: malformed base64 cursor fails', () => {
    const result = decodeCursor('%%%not-base64%%%')
    expect(isMockApiError(result)).toBe(true)
    if (isMockApiError(result)) {
      expect(result.code).toBe('INVALID_CURSOR')
    }
  })

  it('21: malformed cursor JSON fails', () => {
    const bad = btoa('not-json').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '')
    const result = decodeCursor(bad)
    expect(isMockApiError(result)).toBe(true)
  })

  it('22: cursor with invalid sort data fails', () => {
    const payload = { ...sample, sort: 'nope' }
    const encoded = encodeCursor(payload as NotesListCursorPayload)
    const result = decodeCursor(encoded)
    expect(isMockApiError(result)).toBe(true)
  })

  it('23: cursor from a different sort/query is rejected', () => {
    const mismatch = assertCursorMatchesQuery(sample, {
      sort: 'createdAt',
      dir: 'desc',
      fingerprint: 'fp',
    })
    expect(mismatch?.code).toBe('INVALID_CURSOR')

    const fp = buildQueryFingerprint({
      statuses: [],
      assignedReviewerId: null,
      patientId: null,
      dateFrom: null,
      dateTo: null,
      search: '',
      sort: 'updatedAt',
      dir: 'desc',
    })
    expect(typeof fp).toBe('string')
  })

  it('24: terminal page returns hasMore false and next null', () => {
    const db = createTestDatabase({ noteCount: 5 })
    const request: NotesListRequest = {
      cursor: null,
      limit: 100,
      statuses: [],
      assignedReviewerId: null,
      patientId: null,
      dateFrom: null,
      dateTo: null,
      search: '',
      sort: 'updatedAt',
      dir: 'desc',
    }
    const result = listNotesFromDatabase(db, request, parseIsoDateTime('2024-07-01T00:00:00.000Z'))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.response.cursor.hasMore).toBe(false)
      expect(result.response.cursor.next).toBeNull()
    }
  })
})
