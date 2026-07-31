import { http, HttpResponse } from 'msw'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { parseClientMutationId, parseNoteId, parseVersionId } from '@/domain/ids'
import { createMockBackendNodeServer } from '@/mock/msw/node'
import { seedMockDatabase } from '@/mock/seed/seed'
import {
  DEFAULT_DEV_ADMIN_ACTOR,
  resetActorIdentity,
  setActorIdentity,
} from '@/services/api/actor-provider'
import { ApiClientError, isNetworkApiError } from '@/services/api/api-errors'
import { createNoteVersion, isVersionConflictApiError } from '@/services/api/create-version-api'
import { buildSoapContent } from '@/test/fixtures/domain'

describe('createNoteVersion API client', () => {
  const { backend, server } = createMockBackendNodeServer()

  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' })
  })

  beforeEach(() => {
    backend.configureForTests()
    seedMockDatabase(backend.database, { seed: 42, noteCount: 24 })
    setActorIdentity(DEFAULT_DEV_ADMIN_ACTOR)
  })

  afterEach(() => {
    server.resetHandlers()
    resetActorIdentity()
  })

  afterAll(() => {
    server.close()
  })

  it('creates a version with actor headers, baseVersionId, and clientMutationId', async () => {
    const note = backend.database.listNotes().find((item) => item.status === 'IN_REVIEW')
    expect(note).toBeDefined()
    const result = await createNoteVersion({
      noteId: note!.id,
      baseVersionId: note!.currentVersionId,
      content: buildSoapContent({ subjective: 'API saved' }),
      clientMutationId: parseClientMutationId('mut_api_1'),
    })
    expect(result.version.parentVersionId).toBe(note!.currentVersionId)
    expect(result.version.revision).toBeGreaterThan(0)
    expect(result.savedContent.subjective).toBe('API saved')
  })

  it('parses 409 as VersionConflictApiError', async () => {
    const note = backend.database.listNotes().find((item) => item.status === 'IN_REVIEW')
    expect(note).toBeDefined()
    const staleBase = parseVersionId(`${String(note!.currentVersionId)}_stale`)
    // Insert a fake sibling won't work — use wrong base that exists on another note
    // Prefer: save once then conflict with old base
    const first = await createNoteVersion({
      noteId: note!.id,
      baseVersionId: note!.currentVersionId,
      content: buildSoapContent({ subjective: 'first' }),
      clientMutationId: parseClientMutationId('mut_conflict_1'),
    })
    await expect(
      createNoteVersion({
        noteId: note!.id,
        baseVersionId: note!.currentVersionId,
        content: buildSoapContent({ subjective: 'stale base' }),
        clientMutationId: parseClientMutationId('mut_conflict_2'),
      }),
    ).rejects.toSatisfy((error: unknown) => isVersionConflictApiError(error))
    expect(first.version.id).toBeTruthy()
    expect(staleBase).toBeTruthy()
  })

  it('maps network failure and abort distinctly', async () => {
    server.use(
      http.post('*/api/notes/:id/versions', () => {
        return HttpResponse.error()
      }),
    )
    const noteId = parseNoteId('note_x')
    await expect(
      createNoteVersion({
        noteId,
        baseVersionId: parseVersionId('ver_x'),
        content: buildSoapContent(),
        clientMutationId: parseClientMutationId('mut_net'),
      }),
    ).rejects.toSatisfy((error: unknown) => isNetworkApiError(error))

    const controller = new AbortController()
    controller.abort()
    await expect(
      createNoteVersion(
        {
          noteId,
          baseVersionId: parseVersionId('ver_x'),
          content: buildSoapContent(),
          clientMutationId: parseClientMutationId('mut_abort'),
        },
        { signal: controller.signal },
      ),
    ).rejects.toSatisfy((error: unknown) => error instanceof Error && error.name === 'AbortError')
  })

  it('maps 403 to ApiClientError', async () => {
    server.use(
      http.post('*/api/notes/:id/versions', () =>
        HttpResponse.json({ error: { code: 'FORBIDDEN', message: 'Denied.' } }, { status: 403 }),
      ),
    )
    await expect(
      createNoteVersion({
        noteId: parseNoteId('note_x'),
        baseVersionId: parseVersionId('ver_x'),
        content: buildSoapContent(),
        clientMutationId: parseClientMutationId('mut_403'),
      }),
    ).rejects.toSatisfy((error: unknown) => error instanceof ApiClientError && error.status === 403)
  })
})
