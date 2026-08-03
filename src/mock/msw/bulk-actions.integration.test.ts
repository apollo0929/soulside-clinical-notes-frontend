import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { parseIsoDateTime } from '@/domain/datetime'
import { parseNoteId, parseUserId } from '@/domain/ids'
import {
  bulkAssignReviewerResponseDtoSchema,
  bulkRegenerateResponseDtoSchema,
} from '@/domain/schemas'
import { ACTOR_USER_ID_HEADER, ACTOR_USER_ROLE_HEADER } from '@/mock/msw/actor-headers'
import { createMockBackendNodeServer } from '@/mock/msw/node'
import { seedMockDatabase } from '@/mock/seed/seed'
import { adminActor, auditorActor, reviewerActor } from '@/mock/test/helpers'

describe('MSW bulk-actions integration', () => {
  const { backend, server } = createMockBackendNodeServer()

  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' })
  })

  beforeEach(() => {
    backend.configureForTests()
    backend.setNow(parseIsoDateTime('2024-11-15T12:00:00.000Z'))
    seedMockDatabase(backend.database, { seed: 42, noteCount: 48 })
  })

  afterEach(() => {
    server.resetHandlers()
  })

  afterAll(() => {
    server.close()
  })

  function headersFor(actor: { userId: string; role: string }): HeadersInit {
    return {
      [ACTOR_USER_ID_HEADER]: actor.userId,
      [ACTOR_USER_ROLE_HEADER]: actor.role,
      'content-type': 'application/json',
    }
  }

  function firstReviewerId(): string {
    const reviewer = backend.database.listUsers().find((user) => user.role === 'REVIEWER')
    if (!reviewer) {
      throw new Error('Expected a seeded reviewer')
    }
    return reviewer.id
  }

  it('POST /api/notes/bulk/assign-reviewer happy path for ADMIN', async () => {
    const admin = adminActor(backend.database)
    const note = backend.database.listNotes().find((n) => n.status === 'READY_FOR_REVIEW')
    if (!note) {
      throw new Error('Expected READY_FOR_REVIEW note')
    }
    const reviewerId = firstReviewerId()

    const response = await fetch('http://localhost/api/notes/bulk/assign-reviewer', {
      method: 'POST',
      headers: headersFor(admin),
      body: JSON.stringify({
        noteIds: [note.id],
        reviewerId,
        clientMutationId: 'mut_http_assign_ok',
      }),
    })

    expect(response.status).toBe(200)
    const body: unknown = await response.json()
    expect(bulkAssignReviewerResponseDtoSchema.safeParse(body).success).toBe(true)
    const parsed = bulkAssignReviewerResponseDtoSchema.parse(body)
    expect(parsed.results).toHaveLength(1)
    expect(parsed.results[0]?.success).toBe(true)
    if (parsed.results[0]?.success) {
      expect(parsed.results[0].note.assignedReviewer?.id).toBe(reviewerId)
      expect(parsed.results[0].note.status).toBe('READY_FOR_REVIEW')
    }
    expect(backend.database.getNote(note.id)?.assignedReviewerId).toBe(reviewerId)
  })

  it('POST /api/notes/bulk/regenerate happy path for ADMIN', async () => {
    const admin = adminActor(backend.database)
    const note = backend.database.listNotes().find((n) => n.status === 'FAILED')
    if (!note) {
      throw new Error('Expected FAILED note')
    }

    const response = await fetch('http://localhost/api/notes/bulk/regenerate', {
      method: 'POST',
      headers: headersFor(admin),
      body: JSON.stringify({
        noteIds: [note.id],
        clientMutationId: 'mut_http_regen_ok',
      }),
    })

    expect(response.status).toBe(200)
    const body: unknown = await response.json()
    expect(bulkRegenerateResponseDtoSchema.safeParse(body).success).toBe(true)
    const parsed = bulkRegenerateResponseDtoSchema.parse(body)
    expect(parsed.results[0]?.success).toBe(true)
    if (parsed.results[0]?.success) {
      expect(parsed.results[0].note.status).toBe('GENERATING')
    }
    expect(backend.database.getNote(note.id)?.status).toBe('GENERATING')
  })

  it('POST assign-reviewer returns 403 for REVIEWER', async () => {
    const reviewer = reviewerActor(backend.database)
    const note = backend.database.listNotes().find((n) => n.status === 'READY_FOR_REVIEW')
    if (!note) {
      throw new Error('Expected READY_FOR_REVIEW note')
    }

    const response = await fetch('http://localhost/api/notes/bulk/assign-reviewer', {
      method: 'POST',
      headers: headersFor(reviewer),
      body: JSON.stringify({
        noteIds: [note.id],
        reviewerId: firstReviewerId(),
        clientMutationId: 'mut_http_assign_forbidden',
      }),
    })

    expect(response.status).toBe(403)
    const body = (await response.json()) as { error: { code: string } }
    expect(body.error.code).toBe('FORBIDDEN')
  })

  it('POST /api/notes/bulk/regenerate usr_clinician_42_1 succeeds for owned note_42_1', async () => {
    // note_42_1 is deterministically FAILED and owned by usr_clinician_42_1 (index 1 mod 5)
    const actorId = parseUserId('usr_clinician_42_1')
    const noteId = parseNoteId('note_42_1')

    expect(backend.database.getNote(noteId)?.status).toBe('FAILED')

    const response = await fetch('http://localhost/api/notes/bulk/regenerate', {
      method: 'POST',
      headers: headersFor({ userId: actorId, role: 'CLINICIAN' }),
      body: JSON.stringify({
        noteIds: [noteId],
        clientMutationId: 'mut_http_regen_clinician_42_1_ok',
      }),
    })

    expect(response.status).toBe(200)
    const body: unknown = await response.json()
    expect(bulkRegenerateResponseDtoSchema.safeParse(body).success).toBe(true)
    const parsed = bulkRegenerateResponseDtoSchema.parse(body)
    expect(parsed.results[0]?.success).toBe(true)
    if (parsed.results[0]?.success) {
      expect(parsed.results[0].note.status).toBe('GENERATING')
    }
    expect(backend.database.getNote(noteId)?.status).toBe('GENERATING')
  })

  it('POST /api/notes/bulk/regenerate usr_clinician_42_0 denied per-item for note_42_1 (non-owner)', async () => {
    // note_42_1 is owned by usr_clinician_42_1; usr_clinician_42_0 must fail the per-note ownership check
    const actorId = parseUserId('usr_clinician_42_0')
    const noteId = parseNoteId('note_42_1')

    expect(backend.database.getNote(noteId)?.status).toBe('FAILED')

    const response = await fetch('http://localhost/api/notes/bulk/regenerate', {
      method: 'POST',
      headers: headersFor({ userId: actorId, role: 'CLINICIAN' }),
      body: JSON.stringify({
        noteIds: [noteId],
        clientMutationId: 'mut_http_regen_clinician_42_0_unowned',
      }),
    })

    expect(response.status).toBe(200)
    const body: unknown = await response.json()
    const parsed = bulkRegenerateResponseDtoSchema.parse(body)
    expect(parsed.results[0]?.success).toBe(false)
    if (!parsed.results[0]?.success) {
      expect(parsed.results[0]?.error.code).toBe('FORBIDDEN')
    }
    expect(backend.database.getNote(noteId)?.status).toBe('FAILED')
  })

  it('POST regenerate returns 403 for REVIEWER', async () => {
    const reviewer = reviewerActor(backend.database)
    const note = backend.database.listNotes().find((n) => n.status === 'FAILED')
    if (!note) {
      throw new Error('Expected FAILED note')
    }

    const response = await fetch('http://localhost/api/notes/bulk/regenerate', {
      method: 'POST',
      headers: headersFor(reviewer),
      body: JSON.stringify({
        noteIds: [note.id],
        clientMutationId: 'mut_http_regen_forbidden',
      }),
    })

    expect(response.status).toBe(403)
    const body = (await response.json()) as { error: { code: string } }
    expect(body.error.code).toBe('FORBIDDEN')
  })

  it('POST regenerate returns 403 for READONLY_AUDITOR', async () => {
    const auditor = auditorActor(backend.database)
    const note = backend.database.listNotes().find((n) => n.status === 'FAILED')
    if (!note) {
      throw new Error('Expected FAILED note')
    }

    const response = await fetch('http://localhost/api/notes/bulk/regenerate', {
      method: 'POST',
      headers: headersFor(auditor),
      body: JSON.stringify({
        noteIds: [note.id],
        clientMutationId: 'mut_http_regen_auditor_forbidden',
      }),
    })

    expect(response.status).toBe(403)
    const body = (await response.json()) as { error: { code: string } }
    expect(body.error.code).toBe('FORBIDDEN')
  })
})
