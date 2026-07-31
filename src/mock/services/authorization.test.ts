import { describe, expect, it } from 'vitest'

import { parseNoteId } from '@/domain/ids'
import { isMockApiError } from '@/mock/errors'
import { parseActorHeaders } from '@/mock/msw/actor-headers'
import { DEFAULT_NOTES_LIST_LIMIT } from '@/mock/services/notes-list'
import { adminActor, auditorActor, clinicianActor, createTestBackend } from '@/mock/test/helpers'

describe('mock backend authorization', () => {
  it('51: authorized user can list notes', async () => {
    const backend = createTestBackend({ noteCount: 10, seed: 30 })
    const result = await backend.listNotes({
      actor: clinicianActor(backend.database),
      request: {
        cursor: null,
        limit: DEFAULT_NOTES_LIST_LIMIT,
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
    expect(isMockApiError(result)).toBe(false)
    if (!isMockApiError(result)) {
      expect(result.items.length).toBeGreaterThan(0)
    }
  })

  it('52: unauthorized/invalid actor is denied', () => {
    const missing = parseActorHeaders(new Headers())
    expect(isMockApiError(missing)).toBe(true)
    if (isMockApiError(missing)) {
      expect(missing.code).toBe('INVALID_REQUEST')
    }

    const badRole = parseActorHeaders(
      new Headers({
        'x-user-id': 'usr_x',
        'x-user-role': 'SUPERUSER',
      }),
    )
    expect(isMockApiError(badRole)).toBe(true)
  })

  it('53: auditor can read list and detail', async () => {
    const backend = createTestBackend({ noteCount: 8, seed: 32 })
    const actor = auditorActor(backend.database)
    const list = await backend.listNotes({
      actor,
      request: {
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
      },
    })
    expect(isMockApiError(list)).toBe(false)
    if (isMockApiError(list)) {
      return
    }
    const noteId = list.items[0]!.id
    const detail = await backend.getNoteDetail({ actor, noteId })
    expect(isMockApiError(detail)).toBe(false)

    const missing = await backend.getNoteDetail({
      actor,
      noteId: parseNoteId('note_does_not_exist'),
    })
    expect(isMockApiError(missing)).toBe(true)
  })

  it('54–55: development seed is admin-only', async () => {
    const backend = createTestBackend({ noteCount: 5, seed: 33 })
    const denied = await backend.seed({
      actor: clinicianActor(backend.database),
      request: { count: 4, seed: 100 },
    })
    expect(isMockApiError(denied)).toBe(true)
    if (isMockApiError(denied)) {
      expect(denied.code).toBe('FORBIDDEN')
      expect(denied.status).toBe(403)
    }

    const allowed = await backend.seed({
      actor: adminActor(backend.database),
      request: { count: 4, seed: 100 },
    })
    expect(isMockApiError(allowed)).toBe(false)
    if (!isMockApiError(allowed)) {
      expect(allowed.counts.notes).toBe(4)
      expect(allowed.config.seed).toBe(100)
    }
  })
})
