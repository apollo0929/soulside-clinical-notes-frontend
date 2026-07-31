import { http, HttpResponse } from 'msw'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { parseNoteId, parseVersionId } from '@/domain/ids'
import { createMockBackendNodeServer } from '@/mock/msw/node'
import { seedMockDatabase } from '@/mock/seed/seed'
import {
  DEFAULT_DEV_ADMIN_ACTOR,
  resetActorIdentity,
  setActorIdentity,
} from '@/services/api/actor-provider'
import { isApiClientError } from '@/services/api/api-errors'
import { getNoteDetail, getNoteVersionContent } from '@/services/api/note-detail-api'

describe('note-detail-api', () => {
  const { backend, server } = createMockBackendNodeServer()

  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' })
  })

  beforeEach(() => {
    backend.configureForTests()
    seedMockDatabase(backend.database, { seed: 42, noteCount: 40 })
    resetActorIdentity()
  })

  afterEach(() => {
    server.resetHandlers()
  })

  afterAll(() => {
    server.close()
  })

  it('1–3: valid detail parses, maps, and supports AbortSignal', async () => {
    const note = backend.database.listNotes()[0]!
    const controller = new AbortController()
    const detail = await getNoteDetail(note.id, { signal: controller.signal })
    expect(detail.note.id).toBe(note.id)
    expect(detail.currentVersion.content.subjective.length).toBeGreaterThanOrEqual(0)
    expect(detail.versions.length).toBeGreaterThan(0)
  })

  it('4: 403 maps to forbidden client error', async () => {
    server.use(
      http.get('*/api/notes/:id', () =>
        HttpResponse.json(
          { error: { code: 'FORBIDDEN', message: 'Denied.', details: null } },
          { status: 403 },
        ),
      ),
    )
    const note = backend.database.listNotes()[0]!
    await expect(getNoteDetail(note.id)).rejects.toSatisfy((error: unknown) => {
      return isApiClientError(error) && error.status === 403 && error.code === 'FORBIDDEN'
    })
  })

  it('5: 404 maps to not-found client error', async () => {
    await expect(getNoteDetail(parseNoteId('note_does_not_exist_999'))).rejects.toSatisfy(
      (error: unknown) => {
        return isApiClientError(error) && error.status === 404
      },
    )
  })

  it('7: valid historical version response parses', async () => {
    const note = backend.database.listNotes()[0]!
    const version = backend.database.getVersion(note.currentVersionId)!
    const mapped = await getNoteVersionContent(note.id, version.id)
    expect(mapped.id).toBe(version.id)
    expect(mapped.noteId).toBe(note.id)
    expect(mapped.content.subjective).toBe(version.content.subjective)
  })

  it('8–9: cross-note and invalid version rejected', async () => {
    const notes = backend.database.listNotes()
    const noteA = notes[0]!
    const noteB = notes[1]!
    const foreign = backend.database.getVersion(noteB.currentVersionId)!
    await expect(getNoteVersionContent(noteA.id, foreign.id)).rejects.toSatisfy(
      (error: unknown) => isApiClientError(error) && error.status === 404,
    )
    await expect(
      getNoteVersionContent(noteA.id, parseVersionId('ver_missing_xyz')),
    ).rejects.toSatisfy((error: unknown) => isApiClientError(error) && error.status === 404)
  })

  it('includes actor headers for detail requests', async () => {
    setActorIdentity(DEFAULT_DEV_ADMIN_ACTOR)
    const note = backend.database.listNotes()[0]!
    let sawAdmin = false
    server.events.on('request:start', ({ request }) => {
      if (request.url.includes(`/api/notes/${note.id}`) && request.method === 'GET') {
        if (request.headers.get('x-user-role') === 'ADMIN') {
          sawAdmin = true
        }
      }
    })
    await getNoteDetail(note.id)
    expect(sawAdmin).toBe(true)
  })
})
