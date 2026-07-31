import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { noteDetailDtoSchema, notesListResponseDtoSchema } from '@/domain/schemas'
import { isMockApiError } from '@/mock/errors'
import { ACTOR_USER_ID_HEADER, ACTOR_USER_ROLE_HEADER } from '@/mock/msw/actor-headers'
import { createMockBackendNodeServer } from '@/mock/msw/node'
import { seedMockDatabase } from '@/mock/seed/seed'
import { adminActor, clinicianActor } from '@/mock/test/helpers'

describe('MSW integration', () => {
  const { backend, server } = createMockBackendNodeServer()

  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' })
  })

  beforeEach(() => {
    backend.configureForTests()
    seedMockDatabase(backend.database, { seed: 50, noteCount: 12 })
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
    }
  }

  it('66: GET /api/notes returns contract-valid JSON', async () => {
    const actor = clinicianActor(backend.database)
    const response = await fetch('http://localhost/api/notes?limit=5', {
      headers: headersFor(actor),
    })
    expect(response.status).toBe(200)
    const body: unknown = await response.json()
    expect(notesListResponseDtoSchema.safeParse(body).success).toBe(true)
  })

  it('67–68: GET /api/notes/:id returns detail or 404', async () => {
    const actor = clinicianActor(backend.database)
    const list = await fetch('http://localhost/api/notes?limit=1', {
      headers: headersFor(actor),
    })
    const listBody = (await list.json()) as { items: { id: string }[] }
    const id = listBody.items[0]!.id

    const detail = await fetch(`http://localhost/api/notes/${id}`, {
      headers: headersFor(actor),
    })
    expect(detail.status).toBe(200)
    expect(noteDetailDtoSchema.safeParse(await detail.json()).success).toBe(true)

    const missing = await fetch('http://localhost/api/notes/note_missing_xyz', {
      headers: headersFor(actor),
    })
    expect(missing.status).toBe(404)
  })

  it('69: invalid query values return 400', async () => {
    const actor = clinicianActor(backend.database)
    const response = await fetch('http://localhost/api/notes?limit=nope', {
      headers: headersFor(actor),
    })
    expect(response.status).toBe(400)
  })

  it('70–71: seed denied to non-admin; admin reseeds', async () => {
    const clinician = clinicianActor(backend.database)
    const denied = await fetch('http://localhost/api/dev/seed', {
      method: 'POST',
      headers: {
        ...headersFor(clinician),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ count: 6, seed: 999 }),
    })
    expect(denied.status).toBe(403)

    const admin = adminActor(backend.database)
    const allowed = await fetch('http://localhost/api/dev/seed', {
      method: 'POST',
      headers: {
        ...headersFor(admin),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ count: 6, seed: 999 }),
    })
    expect(allowed.status).toBe(200)
    const body = (await allowed.json()) as { noteCount: number; seed: number }
    expect(body.noteCount).toBe(6)
    expect(body.seed).toBe(999)
    expect(backend.database.listNotes()).toHaveLength(6)
  })

  it('72: simulated failure returns 500-compatible typed body', async () => {
    backend.failures.forceAlways()
    const actor = clinicianActor(backend.database)
    const response = await fetch('http://localhost/api/notes?limit=5', {
      headers: headersFor(actor),
    })
    expect(response.status).toBe(500)
    const body = (await response.json()) as {
      error: { code: string; message: string }
    }
    expect(body.error.code).toBe('SIMULATED_INTERNAL_ERROR')
    expect(
      isMockApiError({ name: 'MockApiError', ...body.error, status: 500, details: null }),
    ).toBe(true)
  })
})
