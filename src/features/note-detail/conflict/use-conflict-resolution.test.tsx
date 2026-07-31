import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { parseNoteId, parseUserId, parseVersionId } from '@/domain/ids'
import { mapSoapContentToDto } from '@/domain/mappers/soap'
import { cloneSoapContent, type SoapContent } from '@/domain/models/soap'
import type { VersionConflictResponseDto } from '@/domain/schemas/conflict'
import { createVersionRequestDtoSchema } from '@/domain/schemas/create-version'
import {
  type ConflictLocalSnapshot,
  useConflictResolution,
} from '@/features/note-detail/conflict/use-conflict-resolution'
import {
  DEFAULT_DEV_ADMIN_ACTOR,
  resetActorIdentity,
  setActorIdentity,
} from '@/services/api/actor-provider'
import { createDeterministicClientMutationIdGenerator } from '@/services/api/client-mutation-id'
import { buildSoapContent } from '@/test/fixtures/domain'
import { createTestQueryClient } from '@/test/helpers/queryClient'

const noteId = parseNoteId('note_resolve_1')
const localBase = parseVersionId('ver_ancestor')
const serverHead = parseVersionId('ver_head')

function conflictDto(
  overrides: Partial<VersionConflictResponseDto> = {},
): VersionConflictResponseDto {
  return {
    error: 'version_conflict',
    current: {
      id: serverHead,
      revision: 7,
      authoredBy: { id: parseUserId('usr_admin_42'), role: 'ADMIN' },
    },
    commonAncestor: { id: localBase, revision: 5 },
    ...overrides,
  }
}

function versionDetailDto(
  id: string,
  revision: number,
  content: SoapContent,
  parent: string | null,
) {
  return {
    id,
    revision,
    parentVersionId: parent,
    content: mapSoapContentToDto(content),
    authoredBy: { id: 'usr_admin_42', role: 'ADMIN' },
    createdAt: '2024-01-01T00:00:00.000Z',
  }
}

const ancestorContent = buildSoapContent({
  subjective: 'aS',
  objective: 'aO',
  assessment: 'aA',
  plan: 'aP',
})
const serverContent = buildSoapContent({
  subjective: 'server-S',
  objective: 'server-O',
  assessment: 'aA',
  plan: 'aP',
})
const localContent = buildSoapContent({
  subjective: 'local-S',
  objective: 'local-O',
  assessment: 'aA',
  plan: 'local-P',
})

describe('useConflictResolution save semantics', () => {
  beforeEach(() => {
    setActorIdentity(DEFAULT_DEV_ADMIN_ACTOR)
  })

  afterEach(() => {
    resetActorIdentity()
    vi.restoreAllMocks()
  })

  function wrapper({ children }: { children: ReactNode }) {
    const client = createTestQueryClient()
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }

  function mockFetch(handlers: { onPost?: (body: unknown) => Response | Promise<Response> }) {
    return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (
        (!init || !init.method || init.method === 'GET') &&
        url.includes(`/versions/${serverHead}`)
      ) {
        return new Response(
          JSON.stringify(versionDetailDto('ver_head', 7, serverContent, 'ver_ancestor')),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        )
      }
      if (
        (!init || !init.method || init.method === 'GET') &&
        url.includes(`/versions/${localBase}`)
      ) {
        return new Response(
          JSON.stringify(versionDetailDto('ver_ancestor', 5, ancestorContent, null)),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        )
      }
      if (init?.method === 'POST' && url.includes('/versions')) {
        const body = JSON.parse(String(init.body)) as unknown
        return (await handlers.onPost?.(body)) ?? new Response('unexpected', { status: 500 })
      }
      return new Response('not found', { status: 404 })
    })
  }

  it('61–68: resolve save uses server head base, new mutation id, schema body; retry reuses id', async () => {
    const posts: unknown[] = []
    const generator = createDeterministicClientMutationIdGenerator('mut_resolve')
    let createCalls = 0

    mockFetch({
      onPost: (body) => {
        createCalls += 1
        posts.push(body)
        expect(createVersionRequestDtoSchema.safeParse(body).success).toBe(true)
        if (createCalls === 1) {
          return new Response(
            JSON.stringify({ error: { code: 'INTERNAL', message: 'temporary' } }),
            { status: 503, headers: { 'content-type': 'application/json' } },
          )
        }
        return new Response(
          JSON.stringify({
            version: {
              id: 'ver_resolved',
              revision: 8,
              parentVersionId: String(serverHead),
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      },
    })

    const snapshot: ConflictLocalSnapshot = {
      noteId,
      localBaseVersionId: localBase,
      localContent: cloneSoapContent(localContent),
    }
    const onResolved = vi.fn()

    const { result } = renderHook(
      () =>
        useConflictResolution({
          active: true,
          snapshot,
          conflict: conflictDto(),
          mutationIdGenerator: generator,
          onResolved,
          onRepeatedConflict: vi.fn(),
        }),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.hydration.kind).toBe('ready')
      expect(result.current.resolution).not.toBeNull()
    })

    act(() => {
      result.current.dispatch({ type: 'CHOOSE_LOCAL', section: 'subjective' })
      result.current.dispatch({ type: 'CHOOSE_SERVER', section: 'objective' })
    })

    await waitFor(() => {
      expect(result.current.canSubmit).toBe(true)
    })

    act(() => {
      result.current.submit()
    })

    await waitFor(() => {
      expect(result.current.saveStatus.kind).toBe('error')
    })

    expect(posts).toHaveLength(1)
    const first = posts[0] as {
      baseVersionId: string
      clientMutationId: string
      content: { sections: { S: string; O: string; P: string } }
    }
    expect(first.baseVersionId).toBe(String(serverHead))
    expect(first.baseVersionId).not.toBe(String(localBase))
    expect(first.clientMutationId).toBe('mut_resolve_1')
    expect(first.content.sections.S).toBe('local-S')
    expect(first.content.sections.O).toBe('server-O')
    expect(first.content.sections.P).toBe('local-P')

    act(() => {
      result.current.retrySave()
    })

    await waitFor(() => {
      expect(result.current.saveStatus.kind).toBe('success')
    })
    expect(posts).toHaveLength(2)
    expect((posts[1] as { clientMutationId: string }).clientMutationId).toBe('mut_resolve_1')
    expect(onResolved).toHaveBeenCalledOnce()
  })

  it('67: changing resolution after failure allocates a new mutation id', async () => {
    const posts: string[] = []
    const generator = createDeterministicClientMutationIdGenerator('mut_edit')
    let failOnce = true

    mockFetch({
      onPost: (body) => {
        posts.push((body as { clientMutationId: string }).clientMutationId)
        if (failOnce) {
          failOnce = false
          return new Response(
            JSON.stringify({ error: { code: 'INTERNAL', message: 'temporary' } }),
            { status: 503, headers: { 'content-type': 'application/json' } },
          )
        }
        return new Response(
          JSON.stringify({
            version: {
              id: 'ver_resolved',
              revision: 8,
              parentVersionId: String(serverHead),
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      },
    })

    const { result } = renderHook(
      () =>
        useConflictResolution({
          active: true,
          snapshot: {
            noteId,
            localBaseVersionId: localBase,
            localContent,
          },
          conflict: conflictDto(),
          mutationIdGenerator: generator,
          onResolved: vi.fn(),
          onRepeatedConflict: vi.fn(),
        }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.hydration.kind).toBe('ready'))

    act(() => {
      result.current.dispatch({ type: 'CHOOSE_LOCAL', section: 'subjective' })
      result.current.dispatch({ type: 'CHOOSE_SERVER', section: 'objective' })
    })
    await waitFor(() => expect(result.current.canSubmit).toBe(true))

    act(() => {
      result.current.submit()
    })
    await waitFor(() => expect(result.current.saveStatus.kind).toBe('error'))

    act(() => {
      result.current.dispatch({ type: 'CHOOSE_SERVER', section: 'subjective' })
    })
    await waitFor(() => expect(result.current.canSubmit).toBe(true))

    act(() => {
      result.current.submit()
    })
    await waitFor(() => expect(result.current.saveStatus.kind).toBe('success'))

    expect(posts).toEqual(['mut_edit_1', 'mut_edit_2'])
  })

  it('65: duplicate Resolve and save does not allocate a second mutation id', async () => {
    const posts: string[] = []
    const generator = createDeterministicClientMutationIdGenerator('mut_dup')
    const deferred: { resolve: (() => void) | null } = { resolve: null }
    const gate = new Promise<void>((resolve) => {
      deferred.resolve = resolve
    })

    mockFetch({
      onPost: async (body) => {
        posts.push((body as { clientMutationId: string }).clientMutationId)
        await gate
        return new Response(
          JSON.stringify({
            version: {
              id: 'ver_resolved',
              revision: 8,
              parentVersionId: String(serverHead),
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      },
    })

    const { result } = renderHook(
      () =>
        useConflictResolution({
          active: true,
          snapshot: {
            noteId,
            localBaseVersionId: localBase,
            localContent,
          },
          conflict: conflictDto(),
          mutationIdGenerator: generator,
          onResolved: vi.fn(),
          onRepeatedConflict: vi.fn(),
        }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.hydration.kind).toBe('ready'))
    act(() => {
      result.current.dispatch({ type: 'CHOOSE_LOCAL', section: 'subjective' })
      result.current.dispatch({ type: 'CHOOSE_SERVER', section: 'objective' })
    })
    await waitFor(() => expect(result.current.canSubmit).toBe(true))

    act(() => {
      result.current.submit()
      result.current.submit()
    })

    await waitFor(() => expect(posts).toHaveLength(1))
    deferred.resolve?.()
    await waitFor(() => expect(result.current.saveStatus.kind).toBe('success'))
    expect(posts).toEqual(['mut_dup_1'])
  })

  it('79–85: repeated 409 rehydrates via onRepeatedConflict without auto-retry', async () => {
    const onRepeatedConflict = vi.fn()
    const generator = createDeterministicClientMutationIdGenerator('mut_repeat')

    mockFetch({
      onPost: () =>
        new Response(
          JSON.stringify(
            conflictDto({
              current: {
                id: parseVersionId('ver_newer'),
                revision: 9,
                authoredBy: { id: parseUserId('usr_admin_42'), role: 'ADMIN' },
              },
              commonAncestor: { id: serverHead, revision: 7 },
            }),
          ),
          { status: 409, headers: { 'content-type': 'application/json' } },
        ),
    })

    const { result } = renderHook(
      () =>
        useConflictResolution({
          active: true,
          snapshot: {
            noteId,
            localBaseVersionId: localBase,
            localContent,
          },
          conflict: conflictDto(),
          mutationIdGenerator: generator,
          onResolved: vi.fn(),
          onRepeatedConflict,
        }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.hydration.kind).toBe('ready'))
    act(() => {
      result.current.dispatch({ type: 'CHOOSE_LOCAL', section: 'subjective' })
      result.current.dispatch({ type: 'CHOOSE_SERVER', section: 'objective' })
    })
    await waitFor(() => expect(result.current.canSubmit).toBe(true))

    act(() => {
      result.current.submit()
    })

    await waitFor(() => {
      expect(onRepeatedConflict).toHaveBeenCalledOnce()
    })
    const [nextConflict, preservedLocal, attemptedBase] = onRepeatedConflict.mock.calls[0]!
    expect(nextConflict.current.id).toBe('ver_newer')
    expect(preservedLocal.subjective).toBe('local-S')
    expect(attemptedBase).toBe(serverHead)
    expect(result.current.saveStatus.kind).toBe('idle')
  })
})
