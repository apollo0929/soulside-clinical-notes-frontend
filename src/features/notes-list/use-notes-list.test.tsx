import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_NOTES_LIST_FILTERS } from '@/features/notes-list/notes-list.types'
import { notesKeys } from '@/features/notes-list/notes-query-keys'
import { flattenNotesPages, useNotesList } from '@/features/notes-list/use-notes-list'
import { createMockBackendNodeServer } from '@/mock/msw/node'
import { seedMockDatabase } from '@/mock/seed/seed'
import { resetActorIdentity } from '@/services/api/actor-provider'
import { createTestQueryClient } from '@/test/helpers/queryClient'

describe('useNotesList', () => {
  const { backend, server } = createMockBackendNodeServer()

  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' })
  })

  beforeEach(() => {
    backend.configureForTests()
    seedMockDatabase(backend.database, { seed: 42, noteCount: 60 })
    resetActorIdentity()
  })

  afterEach(() => {
    server.resetHandlers()
  })

  afterAll(() => {
    server.close()
  })

  function createWrapper() {
    const client = createTestQueryClient()
    return function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>
    }
  }

  it('23–24: initial null cursor page then next cursor page', async () => {
    const cursors: Array<string | null> = []
    server.events.on('request:start', ({ request }) => {
      const url = new URL(request.url)
      if (url.pathname.endsWith('/api/notes') && request.method === 'GET') {
        cursors.push(url.searchParams.get('cursor'))
      }
    })

    const { result } = renderHook(() => useNotesList(DEFAULT_NOTES_LIST_FILTERS), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.query.isSuccess).toBe(true)
    })
    expect(cursors[0]).toBeNull()
    expect(result.current.query.data?.pages[0]?.nextCursor).toBeTruthy()

    const next = result.current.query.data?.pages[0]?.nextCursor ?? null

    await act(async () => {
      await result.current.query.fetchNextPage()
    })

    await waitFor(() => {
      expect(result.current.query.data?.pages.length).toBe(2)
    })
    expect(cursors).toContain(next)
  })

  it('25–26: query key changes with filters and omits cursor', () => {
    const base = notesKeys.list(DEFAULT_NOTES_LIST_FILTERS)
    const filtered = notesKeys.list({
      ...DEFAULT_NOTES_LIST_FILTERS,
      searchQuery: 'avery',
    })
    expect(base).not.toEqual(filtered)
    expect(JSON.stringify(base)).not.toContain('cursor')
    expect(JSON.stringify(filtered)).not.toContain('cursor')
  })

  it('27–28: previous rows remain and ids stay unique across pages', async () => {
    const { result } = renderHook(() => useNotesList(DEFAULT_NOTES_LIST_FILTERS), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.rows.length).toBeGreaterThan(0)
    })
    const firstCount = result.current.rows.length

    await act(async () => {
      const first = result.current.query.fetchNextPage()
      const second = result.current.query.fetchNextPage()
      await Promise.all([first, second])
    })

    await waitFor(() => {
      expect(result.current.rows.length).toBeGreaterThan(firstCount)
    })
    const ids = result.current.rows.map((row) => row.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('flattenNotesPages deduplicates by note id', () => {
    const note = {
      id: 'note_1' as never,
      patientId: 'pat_1' as never,
      patientDisplayName: 'A',
      status: 'APPROVED' as const,
      currentVersionId: 'ver_1' as never,
      currentRevision: 1,
      assignedReviewer: null,
      createdAt: '2024-06-01T12:00:00.000Z' as never,
      updatedAt: '2024-06-01T12:00:00.000Z' as never,
    }
    const flattened = flattenNotesPages({
      pages: [
        {
          items: [note],
          nextCursor: 'x',
          hasMore: true,
          total: 2,
          returned: 1,
          generatedAt: '2024-06-01T12:00:00.000Z' as never,
        },
        {
          items: [note],
          nextCursor: null,
          hasMore: false,
          total: 2,
          returned: 1,
          generatedAt: '2024-06-01T12:00:00.000Z' as never,
        },
      ],
      pageParams: [null, 'x'],
    })
    expect(flattened).toHaveLength(1)
  })
})
