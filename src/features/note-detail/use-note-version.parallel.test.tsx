import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { useNoteVersion } from '@/features/note-detail/use-note-version'
import { createMockBackendNodeServer } from '@/mock/msw/node'
import { seedMockDatabase } from '@/mock/seed/seed'
import { resetActorIdentity } from '@/services/api/actor-provider'
import { createTestQueryClient } from '@/test/helpers/queryClient'

describe('useNoteVersion parallel fetches', () => {
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

  it('fetches two historical versions without requiring serial completion', async () => {
    const note = backend.database
      .listNotes()
      .find((n) => backend.database.listVersionsForNote(n.id).length >= 2)!
    const versions = [...backend.database.listVersionsForNote(note.id)]
    const older = versions.sort((a, b) => a.revisionNumber - b.revisionNumber)[0]!
    const newer = versions.sort((a, b) => b.revisionNumber - a.revisionNumber)[0]!
    expect(older.id).not.toBe(newer.id)

    const startedAt: number[] = []
    server.events.on('request:start', ({ request }) => {
      if (request.url.includes('/versions/')) {
        startedAt.push(Date.now())
      }
    })

    const client = createTestQueryClient()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )

    const first = renderHook(() => useNoteVersion(note.id, older.id, { enabled: true }), {
      wrapper,
    })
    const second = renderHook(() => useNoteVersion(note.id, newer.id, { enabled: true }), {
      wrapper,
    })

    await waitFor(() => {
      expect(first.result.current.isSuccess).toBe(true)
      expect(second.result.current.isSuccess).toBe(true)
    })

    expect(startedAt.length).toBeGreaterThanOrEqual(2)
    expect(Math.abs(startedAt[0]! - startedAt[1]!)).toBeLessThan(100)
  })
})
