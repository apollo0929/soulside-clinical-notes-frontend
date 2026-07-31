import { describe, expect, it } from 'vitest'

import { parseIsoDateTime } from '@/domain/datetime'
import { notesListResponseDtoSchema } from '@/domain/schemas'
import { MockDatabase } from '@/mock/database/repository'
import { isMockApiError } from '@/mock/errors'
import { seedMockDatabase } from '@/mock/seed/seed'
import { listNotesFromDatabase } from '@/mock/services/notes-list'
import { createTestBackend } from '@/mock/test/helpers'
import { clinicianActor } from '@/mock/test/helpers'

describe('seed scale', () => {
  it('seeds 5,000 notes and supports list access', async () => {
    const db = new MockDatabase()
    const result = seedMockDatabase(db, { seed: 5000, noteCount: 5000 })
    expect(result.counts.notes).toBe(5000)

    const list = listNotesFromDatabase(
      db,
      {
        cursor: null,
        limit: 50,
        statuses: [],
        assignedReviewerId: null,
        patientId: null,
        dateFrom: null,
        dateTo: null,
        search: '',
        sort: 'updatedAt',
        dir: 'desc',
      },
      parseIsoDateTime('2024-07-01T00:00:00.000Z'),
    )
    expect(list.ok).toBe(true)
    if (list.ok) {
      expect(list.response.meta.total).toBe(5000)
      expect(list.response.items).toHaveLength(50)
      expect(notesListResponseDtoSchema.safeParse(list.response).success).toBe(true)
    }

    const backend = createTestBackend({ noteCount: 0, seed: 1 })
    seedMockDatabase(backend.database, { seed: 5001, noteCount: 100 })
    const serviceList = await backend.listNotes({
      actor: clinicianActor(backend.database),
      request: {
        cursor: null,
        limit: 25,
        statuses: [],
        assignedReviewerId: null,
        patientId: null,
        dateFrom: null,
        dateTo: null,
        search: '',
        sort: 'updatedAt',
        dir: 'desc',
      },
    })
    expect(isMockApiError(serviceList)).toBe(false)
  }, 60_000)
})
