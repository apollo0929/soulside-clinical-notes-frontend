import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { parseIsoDateTime } from '@/domain/datetime'
import { parseNoteId, parseUserId, parseVersionId } from '@/domain/ids'
import { mapSoapContentToDto } from '@/domain/mappers/soap'
import type { NoteVersion } from '@/domain/models/note-version'
import { useConflictHydration } from '@/features/note-detail/conflict/use-conflict-hydration'
import { notesKeys } from '@/features/notes-list/notes-query-keys'
import {
  DEFAULT_DEV_ADMIN_ACTOR,
  resetActorIdentity,
  setActorIdentity,
} from '@/services/api/actor-provider'
import { buildSoapContent } from '@/test/fixtures/domain'
import { createTestQueryClient } from '@/test/helpers/queryClient'

const noteId = parseNoteId('note_hydrate_1')
const otherNoteId = parseNoteId('note_hydrate_other')
const headId = parseVersionId('ver_head')
const ancestorId = parseVersionId('ver_ancestor')

function versionDto(id: string, revision: number, parent: string | null) {
  return {
    id,
    revision,
    parentVersionId: parent,
    content: mapSoapContentToDto(
      buildSoapContent({
        subjective: id === 'ver_head' ? 'server' : 'ancestor',
        objective: 'o',
        assessment: 'a',
        plan: 'p',
      }),
    ),
    authoredBy: { id: 'usr_admin_42', role: 'ADMIN' },
    createdAt: '2024-01-01T00:00:00.000Z',
  }
}

describe('useConflictHydration', () => {
  beforeEach(() => {
    setActorIdentity(DEFAULT_DEV_ADMIN_ACTOR)
  })

  afterEach(() => {
    resetActorIdentity()
    vi.restoreAllMocks()
  })

  it('37–39, 41–43: fetches head+ancestor; missing ancestor is retryable; local draft untouched', async () => {
    const localContent = Object.freeze(
      buildSoapContent({
        subjective: 'preserve-me',
        objective: 'o',
        assessment: 'a',
        plan: 'p',
      }),
    )
    const urls: string[] = []

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      urls.push(url)
      if (url.includes(`/versions/${headId}`)) {
        return new Response(JSON.stringify(versionDto('ver_head', 7, 'ver_ancestor')), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      if (url.includes(`/versions/${ancestorId}`)) {
        return new Response(
          JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Ancestor missing' } }),
          { status: 404, headers: { 'content-type': 'application/json' } },
        )
      }
      return new Response('not found', { status: 404 })
    })

    const client = createTestQueryClient()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )

    const { result } = renderHook(
      () =>
        useConflictHydration({
          enabled: true,
          noteId,
          localBaseVersionId: ancestorId,
          localContent,
          conflict: {
            error: 'version_conflict',
            current: {
              id: headId,
              revision: 7,
              authoredBy: { id: parseUserId('usr_admin_42'), role: 'ADMIN' },
            },
            commonAncestor: { id: ancestorId, revision: 5 },
          },
        }),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.kind).toBe('error')
    })
    expect(urls.some((url) => url.includes(String(headId)))).toBe(true)
    expect(urls.some((url) => url.includes(String(ancestorId)))).toBe(true)
    expect(urls.every((url) => !url.includes('ver_unrelated'))).toBe(true)
    if (result.current.kind === 'error') {
      expect(result.current.retryable).toBe(true)
    }
    expect(localContent.subjective).toBe('preserve-me')
  })

  it('40: cross-note version in cache is rejected', async () => {
    const client = createTestQueryClient()
    const wrongNoteVersion: NoteVersion = Object.freeze({
      id: headId,
      noteId: otherNoteId,
      revisionNumber: 7,
      parentVersionId: ancestorId,
      content: buildSoapContent({ subjective: 'server' }),
      authorId: parseUserId('usr_admin_42'),
      authorRole: 'ADMIN' as const,
      createdAt: parseIsoDateTime('2024-01-01T00:00:00.000Z'),
    })
    const ancestorVersion: NoteVersion = Object.freeze({
      id: ancestorId,
      noteId,
      revisionNumber: 5,
      parentVersionId: null,
      content: buildSoapContent({ subjective: 'ancestor' }),
      authorId: parseUserId('usr_admin_42'),
      authorRole: 'ADMIN' as const,
      createdAt: parseIsoDateTime('2024-01-01T00:00:00.000Z'),
    })
    client.setQueryData(notesKeys.version(noteId, headId), wrongNoteVersion)
    client.setQueryData(notesKeys.version(noteId, ancestorId), ancestorVersion)

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )

    const { result } = renderHook(
      () =>
        useConflictHydration({
          enabled: true,
          noteId,
          localBaseVersionId: ancestorId,
          localContent: buildSoapContent({ subjective: 'local' }),
          conflict: {
            error: 'version_conflict',
            current: {
              id: headId,
              revision: 7,
              authoredBy: { id: parseUserId('usr_admin_42'), role: 'ADMIN' },
            },
            commonAncestor: { id: ancestorId, revision: 5 },
          },
        }),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.kind).toBe('error')
    })
    if (result.current.kind === 'error') {
      expect(result.current.message).toMatch(/do not belong to this note/i)
      expect(result.current.retryable).toBe(false)
    }
  })
})
