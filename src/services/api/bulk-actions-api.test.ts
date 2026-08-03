import { http, HttpResponse } from 'msw'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { parseClientMutationId, parseNoteId, parseUserId } from '@/domain/ids'
import { createMockBackendNodeServer } from '@/mock/msw/node'
import { seedMockDatabase } from '@/mock/seed/seed'
import {
  ACTOR_USER_ID_HEADER,
  ACTOR_USER_ROLE_HEADER,
  resetActorIdentity,
  setActorIdentity,
} from '@/services/api/actor-provider'
import { ApiClientError, isNetworkApiError } from '@/services/api/api-errors'
import { assignReviewerBulk, regenerateNotesBulk } from '@/services/api/bulk-actions-api'

describe('bulk-actions-api', () => {
  const { backend, server } = createMockBackendNodeServer()

  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' })
  })

  beforeEach(() => {
    backend.configureForTests()
    seedMockDatabase(backend.database, { seed: 42, noteCount: 48 })
    resetActorIdentity()
    setActorIdentity({ userId: 'usr_admin_42', role: 'ADMIN' })
  })

  afterEach(() => {
    server.resetHandlers()
  })

  afterAll(() => {
    server.close()
  })

  function readyNoteId() {
    const note = backend.database.listNotes().find((n) => n.status === 'READY_FOR_REVIEW')
    if (!note) {
      throw new Error('Expected READY_FOR_REVIEW note')
    }
    return note.id
  }

  function failedNoteId() {
    const note = backend.database.listNotes().find((n) => n.status === 'FAILED')
    if (!note) {
      throw new Error('Expected FAILED note')
    }
    return note.id
  }

  function reviewerId() {
    const reviewer = backend.database.listUsers().find((user) => user.role === 'REVIEWER')
    if (!reviewer) {
      throw new Error('Expected reviewer')
    }
    return reviewer.id
  }

  it('maps assign-reviewer success with ADMIN actor', async () => {
    const noteId = readyNoteId()
    const assignee = reviewerId()

    const result = await assignReviewerBulk({
      noteIds: [noteId],
      reviewerId: assignee,
      clientMutationId: parseClientMutationId('mut_api_assign_ok'),
    })

    expect(result.results).toHaveLength(1)
    expect(result.results[0]?.success).toBe(true)
    if (result.results[0]?.success) {
      expect(result.results[0].note.id).toBe(noteId)
      expect(result.results[0].note.assignedReviewer?.id).toBe(assignee)
      expect(result.results[0].note.status).toBe('READY_FOR_REVIEW')
      expect(result.results[0].note.patientDisplayName).toEqual(expect.any(String))
    }
    expect(backend.database.getNote(noteId)?.assignedReviewerId).toBe(assignee)
  })

  it('maps regenerate success with ADMIN actor', async () => {
    const noteId = failedNoteId()

    const result = await regenerateNotesBulk({
      noteIds: [noteId],
      clientMutationId: parseClientMutationId('mut_api_regen_ok'),
    })

    expect(result.results).toHaveLength(1)
    expect(result.results[0]?.success).toBe(true)
    if (result.results[0]?.success) {
      expect(result.results[0].note.id).toBe(noteId)
      expect(result.results[0].note.status).toBe('GENERATING')
    }
    expect(backend.database.getNote(noteId)?.status).toBe('GENERATING')
  })

  it('includes actor headers and JSON body on assign-reviewer requests', async () => {
    let seenUserId: string | null = null
    let seenRole: string | null = null
    let seenBody: unknown = null
    const noteId = parseNoteId('note_probe_1')
    const assignee = parseUserId('usr_reviewer_42_0')

    server.use(
      http.post('*/api/notes/bulk/assign-reviewer', async ({ request }) => {
        seenUserId = request.headers.get(ACTOR_USER_ID_HEADER)
        seenRole = request.headers.get(ACTOR_USER_ROLE_HEADER)
        seenBody = await request.json()
        return HttpResponse.json({
          results: [
            {
              noteId,
              success: false,
              error: { code: 'NOT_FOUND', message: 'probe' },
            },
          ],
        })
      }),
    )

    const result = await assignReviewerBulk({
      noteIds: [noteId],
      reviewerId: assignee,
      clientMutationId: parseClientMutationId('mut_api_assign_headers'),
    })

    expect(seenUserId).toBe('usr_admin_42')
    expect(seenRole).toBe('ADMIN')
    expect(seenBody).toEqual({
      noteIds: [noteId],
      reviewerId: assignee,
      clientMutationId: 'mut_api_assign_headers',
    })
    expect(result.results[0]).toEqual({
      noteId,
      success: false,
      error: { code: 'NOT_FOUND', message: 'probe' },
    })
  })

  it('includes JSON body on regenerate requests', async () => {
    let seenBody: unknown = null
    const noteId = parseNoteId('note_probe_2')

    server.use(
      http.post('*/api/notes/bulk/regenerate', async ({ request }) => {
        seenBody = await request.json()
        return HttpResponse.json({
          results: [
            {
              noteId,
              success: false,
              error: { code: 'INVALID_TRANSITION', message: 'probe' },
            },
          ],
        })
      }),
    )

    await regenerateNotesBulk({
      noteIds: [noteId],
      clientMutationId: parseClientMutationId('mut_api_regen_body'),
    })

    expect(seenBody).toEqual({
      noteIds: [noteId],
      clientMutationId: 'mut_api_regen_body',
    })
  })

  it('setActorIdentity to usr_clinician_42_1 sends that userId in regenerate headers', async () => {
    setActorIdentity({ userId: 'usr_clinician_42_1', role: 'CLINICIAN' })

    let seenUserId: string | null = null
    let seenRole: string | null = null
    const noteId = parseNoteId('note_header_probe')

    server.use(
      http.post('*/api/notes/bulk/regenerate', async ({ request }) => {
        seenUserId = request.headers.get(ACTOR_USER_ID_HEADER)
        seenRole = request.headers.get(ACTOR_USER_ROLE_HEADER)
        return HttpResponse.json({
          results: [{ noteId, success: false, error: { code: 'PROBE', message: 'probe' } }],
        })
      }),
    )

    await regenerateNotesBulk({
      noteIds: [noteId],
      clientMutationId: parseClientMutationId('mut_api_regen_clinician_header'),
    })

    expect(seenUserId).toBe('usr_clinician_42_1')
    expect(seenRole).toBe('CLINICIAN')
  })

  it('actor switching does not leave stale headers in subsequent regenerate requests', async () => {
    const capturedIds: string[] = []
    const noteId1 = parseNoteId('note_stale_probe_1')
    const noteId2 = parseNoteId('note_stale_probe_2')

    server.use(
      http.post('*/api/notes/bulk/regenerate', async ({ request }) => {
        const uid = request.headers.get(ACTOR_USER_ID_HEADER)
        if (uid) {
          capturedIds.push(uid)
        }
        const body = (await request.json()) as { noteIds: string[] }
        return HttpResponse.json({
          results: body.noteIds.map((id) => ({
            noteId: id,
            success: false,
            error: { code: 'PROBE', message: 'probe' },
          })),
        })
      }),
    )

    setActorIdentity({ userId: 'usr_clinician_42_1', role: 'CLINICIAN' })
    await regenerateNotesBulk({
      noteIds: [noteId1],
      clientMutationId: parseClientMutationId('mut_api_regen_switch_1'),
    })

    setActorIdentity({ userId: 'usr_admin_42', role: 'ADMIN' })
    await regenerateNotesBulk({
      noteIds: [noteId2],
      clientMutationId: parseClientMutationId('mut_api_regen_switch_2'),
    })

    expect(capturedIds).toHaveLength(2)
    expect(capturedIds[0]).toBe('usr_clinician_42_1')
    expect(capturedIds[1]).toBe('usr_admin_42')
  })

  it('maps typed backend errors from assign-reviewer', async () => {
    server.use(
      http.post('*/api/notes/bulk/assign-reviewer', () => {
        return HttpResponse.json(
          {
            error: {
              code: 'FORBIDDEN',
              message: 'Denied',
              details: { reasonCode: 'ROLE_NOT_PERMITTED' },
            },
          },
          { status: 403 },
        )
      }),
    )

    await expect(
      assignReviewerBulk({
        noteIds: [parseNoteId('note_any')],
        reviewerId: parseUserId('usr_reviewer_42_0'),
        clientMutationId: parseClientMutationId('mut_api_assign_err'),
      }),
    ).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
      message: 'Denied',
    })
  })

  it('maps FORBIDDEN from regenerate when actor is REVIEWER', async () => {
    setActorIdentity({ userId: 'usr_reviewer_42_0', role: 'REVIEWER' })

    await expect(
      regenerateNotesBulk({
        noteIds: [failedNoteId()],
        clientMutationId: parseClientMutationId('mut_api_regen_forbidden'),
      }),
    ).rejects.toBeInstanceOf(ApiClientError)

    await expect(
      regenerateNotesBulk({
        noteIds: [failedNoteId()],
        clientMutationId: parseClientMutationId('mut_api_regen_forbidden_2'),
      }),
    ).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
    })
  })

  it('rejects invalid response schema', async () => {
    server.use(
      http.post('*/api/notes/bulk/assign-reviewer', () => {
        return HttpResponse.json({ results: 'nope' })
      }),
    )

    await expect(
      assignReviewerBulk({
        noteIds: [readyNoteId()],
        reviewerId: reviewerId(),
        clientMutationId: parseClientMutationId('mut_api_assign_schema'),
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_RESPONSE_SCHEMA',
    })
  })

  it('maps network failure distinctly', async () => {
    server.use(
      http.post('*/api/notes/bulk/regenerate', () => {
        return HttpResponse.error()
      }),
    )

    try {
      await regenerateNotesBulk({
        noteIds: [failedNoteId()],
        clientMutationId: parseClientMutationId('mut_api_regen_network'),
      })
      expect.fail('expected network error')
    } catch (error) {
      expect(isNetworkApiError(error)).toBe(true)
    }
  })

  it('forwards AbortSignal', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      assignReviewerBulk(
        {
          noteIds: [readyNoteId()],
          reviewerId: reviewerId(),
          clientMutationId: parseClientMutationId('mut_api_assign_abort'),
        },
        { signal: controller.signal },
      ),
    ).rejects.toSatisfy(
      (error: unknown) =>
        (error instanceof DOMException && error.name === 'AbortError') ||
        (error instanceof Error && error.name === 'AbortError'),
    )
  })
})
