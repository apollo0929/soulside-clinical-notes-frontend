import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { parseIsoDateTime } from '@/domain/datetime'
import {
  createVersionSuccessResponseDtoSchema,
  versionConflictResponseDtoSchema,
} from '@/domain/schemas'
import { ACTOR_USER_ID_HEADER, ACTOR_USER_ROLE_HEADER } from '@/mock/msw/actor-headers'
import { createMockBackendNodeServer } from '@/mock/msw/node'
import { seedMockDatabase } from '@/mock/seed/seed'
import { auditorActor } from '@/mock/test/helpers'

describe('MSW create-version integration', () => {
  const { backend, server } = createMockBackendNodeServer()

  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' })
  })

  beforeEach(() => {
    backend.configureForTests()
    backend.setNow(parseIsoDateTime('2024-10-01T00:00:00.000Z'))
    seedMockDatabase(backend.database, { seed: 90, noteCount: 24 })
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

  it('64–71: create-version success, auth, validation, conflict, idempotency', async () => {
    const note = backend.database
      .listNotes()
      .find((n) => n.status === 'IN_REVIEW' && n.assignedReviewerId)!
    const assignedUser = backend.database.getUser(note.assignedReviewerId!)!
    const assigned = { userId: assignedUser.id, role: assignedUser.role }

    const missingActor = await fetch(`http://localhost/api/notes/${note.id}/versions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        baseVersionId: note.currentVersionId,
        content: { sections: { S: 's', O: 'o', A: 'a', P: 'p' } },
        clientMutationId: 'mut_http_1',
      }),
    })
    expect(missingActor.status).toBe(400)

    const auditor = auditorActor(backend.database)
    const auditorDenied = await fetch(`http://localhost/api/notes/${note.id}/versions`, {
      method: 'POST',
      headers: headersFor(auditor),
      body: JSON.stringify({
        baseVersionId: note.currentVersionId,
        content: { sections: { S: 's', O: 'o', A: 'a', P: 'p' } },
        clientMutationId: 'mut_http_auditor',
      }),
    })
    expect(auditorDenied.status).toBe(403)

    const invalidBody = await fetch(`http://localhost/api/notes/${note.id}/versions`, {
      method: 'POST',
      headers: headersFor(assigned),
      body: JSON.stringify({ baseVersionId: note.currentVersionId }),
    })
    expect(invalidBody.status).toBe(400)

    const unknownNote = await fetch('http://localhost/api/notes/note_missing/versions', {
      method: 'POST',
      headers: headersFor(assigned),
      body: JSON.stringify({
        baseVersionId: note.currentVersionId,
        content: { sections: { S: 's', O: 'o', A: 'a', P: 'p' } },
        clientMutationId: 'mut_http_missing',
      }),
    })
    expect(unknownNote.status).toBe(404)

    const success = await fetch(`http://localhost/api/notes/${note.id}/versions`, {
      method: 'POST',
      headers: headersFor(assigned),
      body: JSON.stringify({
        baseVersionId: note.currentVersionId,
        content: { sections: { S: 's1', O: 'o1', A: 'a1', P: 'p1' } },
        clientMutationId: 'mut_http_ok',
      }),
    })
    expect(success.status).toBe(200)
    const successBody: unknown = await success.json()
    expect(createVersionSuccessResponseDtoSchema.safeParse(successBody).success).toBe(true)
    const versionId = (successBody as { version: { id: string } }).version.id

    const replay = await fetch(`http://localhost/api/notes/${note.id}/versions`, {
      method: 'POST',
      headers: headersFor(assigned),
      body: JSON.stringify({
        baseVersionId: note.currentVersionId,
        content: { sections: { S: 's1', O: 'o1', A: 'a1', P: 'p1' } },
        clientMutationId: 'mut_http_ok',
      }),
    })
    expect(replay.status).toBe(200)
    expect(await replay.json()).toEqual(successBody)

    const changed = await fetch(`http://localhost/api/notes/${note.id}/versions`, {
      method: 'POST',
      headers: headersFor(assigned),
      body: JSON.stringify({
        baseVersionId: versionId,
        content: { sections: { S: 'changed', O: 'o', A: 'a', P: 'p' } },
        clientMutationId: 'mut_http_ok',
      }),
    })
    expect(changed.status).toBe(409)

    const conflict = await fetch(`http://localhost/api/notes/${note.id}/versions`, {
      method: 'POST',
      headers: headersFor(assigned),
      body: JSON.stringify({
        baseVersionId: note.currentVersionId,
        content: { sections: { S: 'stale', O: 'o', A: 'a', P: 'p' } },
        clientMutationId: 'mut_http_conflict',
      }),
    })
    expect(conflict.status).toBe(409)
    expect(versionConflictResponseDtoSchema.safeParse(await conflict.json()).success).toBe(true)
  })

  it('72: simulated failure maps to typed 500 body', async () => {
    backend.failures.setEndpointRate('notes.createVersion', 1)
    const note = backend.database
      .listNotes()
      .find((n) => n.status === 'IN_REVIEW' && n.assignedReviewerId)!
    const assignedUser = backend.database.getUser(note.assignedReviewerId!)!
    const assigned = { userId: assignedUser.id, role: assignedUser.role }
    const response = await fetch(`http://localhost/api/notes/${note.id}/versions`, {
      method: 'POST',
      headers: headersFor(assigned),
      body: JSON.stringify({
        baseVersionId: note.currentVersionId,
        content: { sections: { S: 's', O: 'o', A: 'a', P: 'p' } },
        clientMutationId: 'mut_http_fail',
      }),
    })
    expect(response.status).toBe(500)
    const body = (await response.json()) as { error: { code: string } }
    expect(body.error.code).toBe('SIMULATED_INTERNAL_ERROR')
  })
})
