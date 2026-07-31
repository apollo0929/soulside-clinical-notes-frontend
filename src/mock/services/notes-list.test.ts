import { describe, expect, it } from 'vitest'

import { parseIsoDateTime } from '@/domain/datetime'
import { notesListResponseDtoSchema } from '@/domain/schemas'
import { NOTE_STATUSES } from '@/domain/statuses'
import { decodeCursor } from '@/mock/cursor'
import { isMockApiError } from '@/mock/errors'
import { listNotesFromDatabase, type NotesListRequest } from '@/mock/services/notes-list'
import { createTestDatabase } from '@/mock/test/helpers'

function baseRequest(overrides: Partial<NotesListRequest> = {}): NotesListRequest {
  return {
    cursor: null,
    limit: 10,
    statuses: [],
    assignedReviewerId: null,
    patientId: null,
    dateFrom: null,
    dateTo: null,
    search: '',
    sort: 'updatedAt',
    dir: 'desc',
    ...overrides,
  }
}

const generatedAt = parseIsoDateTime('2024-07-01T00:00:00.000Z')

describe('notes listing', () => {
  it('25–27: pagination visits every matching note exactly once', () => {
    const db = createTestDatabase({ noteCount: 35, seed: 21 })
    const seen = new Set<string>()
    let cursor: string | null = null
    let pages = 0
    do {
      const result = listNotesFromDatabase(db, baseRequest({ cursor, limit: 7 }), generatedAt)
      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }
      expect(result.response.items.length).toBe(result.response.meta.returned)
      if (pages === 0) {
        expect(result.response.items.length).toBe(7)
      }
      for (const item of result.response.items) {
        expect(seen.has(item.id)).toBe(false)
        seen.add(item.id)
      }
      cursor = result.response.cursor.next
      pages += 1
    } while (cursor !== null)

    expect(seen.size).toBe(35)
    expect(pages).toBeGreaterThan(1)
  })

  it('28–31: status, reviewer, patient, and date filters work', () => {
    const db = createTestDatabase({ noteCount: 40, seed: 22 })
    const inReview = db.listNotes().find((n) => n.status === 'IN_REVIEW')!
    const statusResult = listNotesFromDatabase(
      db,
      baseRequest({ statuses: ['IN_REVIEW', 'APPROVED'], limit: 50 }),
      generatedAt,
    )
    expect(statusResult.ok).toBe(true)
    if (statusResult.ok) {
      expect(
        statusResult.response.items.every(
          (i) => i.status === 'IN_REVIEW' || i.status === 'APPROVED',
        ),
      ).toBe(true)
    }

    const reviewerResult = listNotesFromDatabase(
      db,
      baseRequest({ assignedReviewerId: inReview.assignedReviewerId, limit: 50 }),
      generatedAt,
    )
    expect(reviewerResult.ok).toBe(true)
    if (reviewerResult.ok) {
      expect(
        reviewerResult.response.items.every(
          (i) => i.assignedReviewer?.id === inReview.assignedReviewerId,
        ),
      ).toBe(true)
    }

    const patientResult = listNotesFromDatabase(
      db,
      baseRequest({ patientId: inReview.patientId, limit: 50 }),
      generatedAt,
    )
    expect(patientResult.ok).toBe(true)
    if (patientResult.ok) {
      expect(patientResult.response.items.every((i) => i.patient.id === inReview.patientId)).toBe(
        true,
      )
    }

    const dateResult = listNotesFromDatabase(
      db,
      baseRequest({
        dateFrom: inReview.updatedAt,
        dateTo: inReview.updatedAt,
        limit: 50,
      }),
      generatedAt,
    )
    expect(dateResult.ok).toBe(true)
    if (dateResult.ok) {
      expect(dateResult.response.items.some((i) => i.id === inReview.id)).toBe(true)
    }
  })

  it('32–34: search empty/case-insensitive patient and SOAP', () => {
    const db = createTestDatabase({ noteCount: 20, seed: 23 })
    const all = listNotesFromDatabase(db, baseRequest({ search: '   ', limit: 50 }), generatedAt)
    const none = listNotesFromDatabase(db, baseRequest({ search: '', limit: 50 }), generatedAt)
    expect(all.ok && none.ok).toBe(true)
    if (all.ok && none.ok) {
      expect(all.response.meta.total).toBe(none.response.meta.total)
    }

    const patient = db.listPatients()[0]!
    const upper = patient.displayName.toUpperCase()
    const byName = listNotesFromDatabase(db, baseRequest({ search: upper, limit: 50 }), generatedAt)
    expect(byName.ok).toBe(true)
    if (byName.ok) {
      expect(byName.response.meta.total).toBeGreaterThan(0)
    }

    const soap = listNotesFromDatabase(
      db,
      baseRequest({ search: 'SEED=23', limit: 50 }),
      generatedAt,
    )
    expect(soap.ok).toBe(true)
    if (soap.ok) {
      expect(soap.response.meta.total).toBeGreaterThan(0)
    }
  })

  it('35: no-results response remains contract-valid', () => {
    const db = createTestDatabase({ noteCount: 10, seed: 24 })
    const emptyDb = createTestDatabase({ noteCount: 0, seed: 24 })
    const noResults = listNotesFromDatabase(
      db,
      baseRequest({ search: 'zzznomatchzzz', limit: 10 }),
      generatedAt,
    )
    const empty = listNotesFromDatabase(emptyDb, baseRequest({ limit: 10 }), generatedAt)
    expect(noResults.ok && empty.ok).toBe(true)
    if (noResults.ok && empty.ok) {
      expect(notesListResponseDtoSchema.safeParse(noResults.response).success).toBe(true)
      expect(notesListResponseDtoSchema.safeParse(empty.response).success).toBe(true)
      expect(noResults.response.meta.total).toBe(0)
      expect(empty.response.meta.total).toBe(0)
      expect(noResults.response.items).toEqual([])
    }
  })

  it('36–39: sorting and stable note-id secondary sort', () => {
    const db = createTestDatabase({ noteCount: 30, seed: 25 })
    for (const sort of ['updatedAt', 'createdAt', 'patientDisplayName', 'status'] as const) {
      const result = listNotesFromDatabase(
        db,
        baseRequest({ sort, dir: 'asc', limit: 50 }),
        generatedAt,
      )
      expect(result.ok).toBe(true)
      if (!result.ok) {
        continue
      }
      const ids = result.response.items.map((i) => i.id)
      expect(new Set(ids).size).toBe(ids.length)

      for (let i = 1; i < result.response.items.length; i += 1) {
        const prev = result.response.items[i - 1]!
        const curr = result.response.items[i]!
        if (sort === 'updatedAt' && prev.updatedAt === curr.updatedAt) {
          expect(prev.id <= curr.id).toBe(true)
        }
        if (sort === 'createdAt' && prev.createdAt === curr.createdAt) {
          expect(prev.id <= curr.id).toBe(true)
        }
        if (
          sort === 'patientDisplayName' &&
          prev.patient.displayName === curr.patient.displayName
        ) {
          expect(prev.id <= curr.id).toBe(true)
        }
        if (sort === 'status' && prev.status === curr.status) {
          expect(prev.id <= curr.id).toBe(true)
        }
      }
    }
  })

  it('40–41: meta.total and meta.returned', () => {
    const db = createTestDatabase({ noteCount: 20, seed: 26 })
    const result = listNotesFromDatabase(
      db,
      baseRequest({ statuses: ['GENERATING', 'FAILED'], limit: 3 }),
      generatedAt,
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.response.meta.returned).toBe(result.response.items.length)
      expect(result.response.meta.total).toBeGreaterThanOrEqual(result.response.meta.returned)
      const matching = db
        .listNotes()
        .filter((n) => n.status === 'GENERATING' || n.status === 'FAILED').length
      expect(result.response.meta.total).toBe(matching)
    }
  })

  it('42–44: invalid limit and cursor fail', () => {
    const db = createTestDatabase({ noteCount: 5, seed: 27 })
    const badLimit = listNotesFromDatabase(db, baseRequest({ limit: 0 }), generatedAt)
    expect(badLimit.ok).toBe(false)
    if (!badLimit.ok) {
      expect(badLimit.error.code).toBe('INVALID_REQUEST')
    }

    const excessive = listNotesFromDatabase(db, baseRequest({ limit: 101 }), generatedAt)
    expect(excessive.ok).toBe(false)

    const badCursor = listNotesFromDatabase(
      db,
      baseRequest({ cursor: 'not-a-cursor' }),
      generatedAt,
    )
    expect(badCursor.ok).toBe(false)
    if (!badCursor.ok) {
      expect(badCursor.error.code).toBe('INVALID_CURSOR')
    }

    const first = listNotesFromDatabase(
      db,
      baseRequest({ limit: 2, sort: 'updatedAt' }),
      generatedAt,
    )
    expect(first.ok).toBe(true)
    if (first.ok && first.response.cursor.next) {
      const wrongSort = listNotesFromDatabase(
        db,
        baseRequest({ cursor: first.response.cursor.next, sort: 'createdAt', limit: 2 }),
        generatedAt,
      )
      expect(wrongSort.ok).toBe(false)
      const decoded = decodeCursor(first.response.cursor.next)
      expect(isMockApiError(decoded)).toBe(false)
    }

    expect(NOTE_STATUSES.length).toBeGreaterThan(0)
  })
})
