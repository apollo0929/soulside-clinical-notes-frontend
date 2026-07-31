import { http, HttpResponse } from 'msw'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { parsePatientId, parseUserId } from '@/domain/ids'
import { createMockBackendNodeServer } from '@/mock/msw/node'
import { seedMockDatabase } from '@/mock/seed/seed'
import { ACTOR_USER_ID_HEADER, ACTOR_USER_ROLE_HEADER } from '@/services/api/actor-provider'
import { resetActorIdentity, setActorIdentity } from '@/services/api/actor-provider'
import { ApiClientError, isNetworkApiError } from '@/services/api/api-errors'
import { buildNotesListSearchParams, listNotes } from '@/services/api/notes-api'

describe('notes-api', () => {
  const { backend, server } = createMockBackendNodeServer()

  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' })
  })

  beforeEach(() => {
    backend.configureForTests()
    seedMockDatabase(backend.database, { seed: 42, noteCount: 24 })
    resetActorIdentity()
  })

  afterEach(() => {
    server.resetHandlers()
  })

  afterAll(() => {
    server.close()
  })

  it('14–16: request builds correct query parameters', () => {
    const params = buildNotesListSearchParams({
      limit: 50,
      cursor: 'abc',
      statuses: ['APPROVED', 'IN_REVIEW'],
      assignedReviewerId: parseUserId('usr_reviewer_42_0'),
      patientId: parsePatientId('pat_42_1'),
      searchQuery: '  Avery  ',
      sortField: 'updatedAt',
      sortDirection: 'desc',
    })
    expect(params.get('limit')).toBe('50')
    expect(params.get('cursor')).toBe('abc')
    expect(params.getAll('status')).toEqual(['APPROVED', 'IN_REVIEW'])
    expect(params.get('assignedReviewerId')).toBe('usr_reviewer_42_0')
    expect(params.get('patientId')).toBe('pat_42_1')
    expect(params.get('q')).toBe('Avery')
    expect(params.get('sort')).toBe('updatedAt')
    expect(params.get('dir')).toBe('desc')
  })

  it('15: empty filters are omitted', () => {
    const params = buildNotesListSearchParams({
      statuses: [],
      assignedReviewerId: null,
      patientId: null,
      searchQuery: '   ',
    })
    expect(params.toString()).toBe('')
  })

  it('17–19: actor headers included and valid response mapped', async () => {
    setActorIdentity({ userId: 'usr_reviewer_42_0', role: 'REVIEWER' })
    const result = await listNotes({ limit: 5 })
    expect(result.items.length).toBeGreaterThan(0)
    expect(result.items[0]).toMatchObject({
      patientDisplayName: expect.any(String),
      status: expect.any(String),
      currentRevision: expect.any(Number),
    })
    expect(result.total).toBe(24)
  })

  it('18: AbortSignal is forwarded', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(listNotes({ limit: 5 }, { signal: controller.signal })).rejects.toSatisfy(
      (error: unknown) =>
        (error instanceof DOMException && error.name === 'AbortError') ||
        (error instanceof Error && error.name === 'AbortError'),
    )
  })

  it('20: invalid response schema is rejected', async () => {
    server.use(
      http.get('*/api/notes', () => {
        return HttpResponse.json({ items: 'nope' })
      }),
    )
    await expect(listNotes({ limit: 5 })).rejects.toBeInstanceOf(ApiClientError)
    await expect(listNotes({ limit: 5 })).rejects.toMatchObject({
      code: 'INVALID_RESPONSE_SCHEMA',
    })
  })

  it('21: typed backend error is mapped', async () => {
    server.use(
      http.get('*/api/notes', () => {
        return HttpResponse.json(
          { error: { code: 'FORBIDDEN', message: 'Denied', details: { reasonCode: 'x' } } },
          { status: 403 },
        )
      }),
    )
    await expect(listNotes({ limit: 5 })).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
      message: 'Denied',
    })
  })

  it('22: network failure is mapped distinctly', async () => {
    server.use(
      http.get('*/api/notes', () => {
        return HttpResponse.error()
      }),
    )
    try {
      await listNotes({ limit: 5 })
      expect.fail('expected network error')
    } catch (error) {
      expect(isNetworkApiError(error)).toBe(true)
    }
  })

  it('includes actor headers on requests', async () => {
    let seenUserId: string | null = null
    let seenRole: string | null = null
    server.use(
      http.get('*/api/notes', ({ request }) => {
        seenUserId = request.headers.get(ACTOR_USER_ID_HEADER)
        seenRole = request.headers.get(ACTOR_USER_ROLE_HEADER)
        return HttpResponse.json({
          cursor: { next: null, hasMore: false },
          items: [],
          meta: { total: 0, returned: 0, generatedAt: '2024-06-01T12:00:00.000Z' },
        })
      }),
    )
    setActorIdentity({ userId: 'usr_reviewer_42_1', role: 'REVIEWER' })
    await listNotes({ limit: 1 })
    expect(seenUserId).toBe('usr_reviewer_42_1')
    expect(seenRole).toBe('REVIEWER')
  })
})
