import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { parseIsoDateTime } from '@/domain/datetime'
import { parseNoteId, parsePatientId, parseUserId, parseVersionId } from '@/domain/ids'
import type { NoteSummary } from '@/domain/models/note-summary'
import { DEFAULT_NOTES_LIST_FILTERS } from '@/features/notes-list/notes-list.types'
import type { NotesInfiniteData } from '@/features/notes-list/notes-list-cache'
import { notesKeys } from '@/features/notes-list/notes-query-keys'
import { useBulkAssignReviewer } from '@/features/notes-list/use-bulk-assign-reviewer'
import { useBulkRegenerate } from '@/features/notes-list/use-bulk-regenerate'
import * as bulkActionsApi from '@/services/api/bulk-actions-api'
import { createTestQueryClient } from '@/test/helpers/queryClient'

vi.mock('@/services/api/bulk-actions-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api/bulk-actions-api')>()
  return {
    ...actual,
    assignReviewerBulk: vi.fn(),
    regenerateNotesBulk: vi.fn(),
  }
})

function note(id: string, status: NoteSummary['status'] = 'READY_FOR_REVIEW'): NoteSummary {
  return {
    id: parseNoteId(id),
    patientId: parsePatientId('pat_1'),
    patientDisplayName: 'Pat',
    status,
    currentVersionId: parseVersionId(`ver_${id}`),
    currentRevision: 1,
    assignedReviewer: null,
    createdAt: parseIsoDateTime('2024-06-01T12:00:00.000Z'),
    updatedAt: parseIsoDateTime('2024-06-02T12:00:00.000Z'),
  }
}

function seedList(client: ReturnType<typeof createTestQueryClient>): {
  key: ReturnType<typeof notesKeys.list>
  data: NotesInfiniteData
} {
  const key = notesKeys.list(DEFAULT_NOTES_LIST_FILTERS)
  const data: NotesInfiniteData = {
    pages: [
      {
        items: [note('note_1'), note('note_2', 'FAILED'), note('note_3', 'APPROVED')],
        nextCursor: 'cursor-1',
        hasMore: true,
        total: 3,
        returned: 3,
        generatedAt: parseIsoDateTime('2024-07-01T00:00:00.000Z'),
      },
    ],
    pageParams: [null],
  }
  client.setQueryData(key, data)
  return { key, data }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('bulk mutation hooks', () => {
  beforeEach(() => {
    vi.mocked(bulkActionsApi.assignReviewerBulk).mockReset()
    vi.mocked(bulkActionsApi.regenerateNotesBulk).mockReset()
  })

  function createHarness() {
    const client = createTestQueryClient()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    return { client, wrapper }
  }

  it('optimistic assign patches reviewer and rolls back on request failure', async () => {
    const { client, wrapper } = createHarness()
    const { key } = seedList(client)
    const reviewerId = parseUserId('usr_reviewer_42_0')
    const gate = deferred<never>()

    vi.mocked(bulkActionsApi.assignReviewerBulk).mockImplementationOnce(() => gate.promise)

    const { result } = renderHook(() => useBulkAssignReviewer(), { wrapper })

    let mutationPromise: Promise<unknown> | undefined
    act(() => {
      mutationPromise = result.current.mutateAsync({
        noteIds: [parseNoteId('note_1')],
        reviewerId,
        reviewerDisplayName: 'Reviewer Zero',
        listQueryKey: key,
      })
    })

    await waitFor(() => {
      expect(result.current.isPending).toBe(true)
    })

    const optimistic = client.getQueryData<NotesInfiniteData>(key)
    expect(optimistic?.pages[0]?.items[0]?.assignedReviewer?.displayName).toBe('Reviewer Zero')
    expect(optimistic?.pages[0]?.items[0]?.updatedAt).toBe('2024-06-02T12:00:00.000Z')
    expect(optimistic?.pages[0]?.nextCursor).toBe('cursor-1')

    await act(async () => {
      gate.reject(new Error('network down'))
      await expect(mutationPromise).rejects.toThrow('network down')
    })

    const restored = client.getQueryData<NotesInfiniteData>(key)
    expect(restored?.pages[0]?.items[0]?.assignedReviewer).toBeNull()
    expect(restored?.pages[0]?.nextCursor).toBe('cursor-1')
  })

  it('partial assign applies successes and restores failures without wiping pages', async () => {
    const { client, wrapper } = createHarness()
    const { key } = seedList(client)
    const reviewerId = parseUserId('usr_reviewer_42_0')
    const successNote = {
      ...note('note_1'),
      assignedReviewer: { id: reviewerId, displayName: 'Reviewer Zero' },
      updatedAt: parseIsoDateTime('2024-07-02T00:00:00.000Z'),
    }

    vi.mocked(bulkActionsApi.assignReviewerBulk).mockResolvedValueOnce({
      results: [
        { noteId: 'note_1', success: true, note: successNote },
        {
          noteId: 'note_2',
          success: false,
          error: { code: 'STATUS_NOT_ASSIGNABLE', message: 'Not assignable' },
        },
      ],
    })

    const { result } = renderHook(() => useBulkAssignReviewer(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        noteIds: [parseNoteId('note_1'), parseNoteId('note_2')],
        reviewerId,
        reviewerDisplayName: 'Reviewer Zero',
        listQueryKey: key,
      })
    })

    const next = client.getQueryData<NotesInfiniteData>(key)
    expect(next?.pages[0]?.items[0]?.assignedReviewer?.id).toBe(reviewerId)
    expect(next?.pages[0]?.items[0]?.updatedAt).toBe('2024-07-02T00:00:00.000Z')
    expect(next?.pages[0]?.items[1]?.assignedReviewer).toBeNull()
    expect(next?.pages[0]?.items[1]?.status).toBe('FAILED')
    expect(next?.pages[0]?.nextCursor).toBe('cursor-1')
    expect(next?.pages[0]?.items).toHaveLength(3)
  })

  it('regenerate optimistically patches FAILED only and restores on error', async () => {
    const { client, wrapper } = createHarness()
    const { key } = seedList(client)
    const gate = deferred<never>()

    vi.mocked(bulkActionsApi.regenerateNotesBulk).mockImplementationOnce(() => gate.promise)

    const { result } = renderHook(() => useBulkRegenerate(), { wrapper })

    let mutationPromise: Promise<unknown> | undefined
    act(() => {
      mutationPromise = result.current.mutateAsync({
        noteIds: [parseNoteId('note_2'), parseNoteId('note_3')],
        listQueryKey: key,
      })
    })

    await waitFor(() => {
      expect(result.current.isPending).toBe(true)
    })

    const optimistic = client.getQueryData<NotesInfiniteData>(key)
    expect(optimistic?.pages[0]?.items[1]?.status).toBe('GENERATING')
    expect(optimistic?.pages[0]?.items[2]?.status).toBe('APPROVED')

    await act(async () => {
      gate.reject(new Error('boom'))
      await expect(mutationPromise).rejects.toThrow('boom')
    })

    const restored = client.getQueryData<NotesInfiniteData>(key)
    expect(restored?.pages[0]?.items[1]?.status).toBe('FAILED')
    expect(restored?.pages[0]?.items[2]?.status).toBe('APPROVED')
  })
})
