import { useQueries } from '@tanstack/react-query'
import { useMemo } from 'react'

import type { NoteId, VersionId } from '@/domain/ids'
import type { NoteVersion } from '@/domain/models/note-version'
import type { SoapContent } from '@/domain/models/soap'
import type { VersionConflictResponseDto } from '@/domain/schemas/conflict'
import type { ConflictResolutionSession } from '@/features/note-detail/conflict/conflict.types'
import { buildConflictResolutionSession } from '@/features/note-detail/conflict/conflict-session'
import { notesKeys } from '@/features/notes-list/notes-query-keys'
import { isApiClientError } from '@/services/api/api-errors'
import { getNoteVersionContent } from '@/services/api/note-detail-api'

export type ConflictHydrationInput = {
  readonly enabled: boolean
  readonly noteId: NoteId
  readonly localBaseVersionId: VersionId
  readonly localContent: SoapContent
  readonly conflict: VersionConflictResponseDto
}

export type ConflictHydrationResult =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | {
      readonly kind: 'ready'
      readonly session: ConflictResolutionSession
    }
  | {
      readonly kind: 'error'
      readonly message: string
      readonly retryable: boolean
      readonly retry: () => void
    }

function classifyHydrationError(error: unknown): { message: string; retryable: boolean } {
  if (isApiClientError(error)) {
    if (error.status === 403) {
      return {
        message: error.message || 'Not authorized to load conflict versions.',
        retryable: false,
      }
    }
    if (error.status === 404) {
      return {
        message: error.message || 'A required conflict version was not found.',
        retryable: true,
      }
    }
    if (error.status >= 500 || error.status === 0) {
      return {
        message: error.message || 'Failed to load conflict versions.',
        retryable: true,
      }
    }
    return {
      message: error.message || 'Failed to load conflict versions.',
      retryable: false,
    }
  }
  if (error instanceof Error) {
    return { message: error.message, retryable: true }
  }
  return { message: 'Failed to load conflict versions.', retryable: true }
}

/**
 * Hydrates server head + common ancestor in parallel for a conflict session.
 * Local draft is taken from the caller snapshot — never from a later query refetch.
 */
export function useConflictHydration(input: ConflictHydrationInput): ConflictHydrationResult {
  const { enabled, noteId, localBaseVersionId, localContent, conflict } = input
  const headId = conflict.current.id
  const ancestorId = conflict.commonAncestor.id

  const [headQuery, ancestorQuery] = useQueries({
    queries: [
      {
        queryKey: notesKeys.version(noteId, headId),
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          getNoteVersionContent(noteId, headId, { signal }),
        enabled,
        staleTime: 60_000,
        retry: false,
      },
      {
        queryKey: notesKeys.version(noteId, ancestorId),
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          getNoteVersionContent(noteId, ancestorId, { signal }),
        enabled,
        staleTime: 60_000,
        retry: false,
      },
    ],
  })

  const headPending = headQuery.isPending
  const ancestorPending = ancestorQuery.isPending
  const headError = headQuery.error
  const ancestorError = ancestorQuery.error
  const headData = headQuery.data
  const ancestorData = ancestorQuery.data
  const headRefetch = headQuery.refetch
  const ancestorRefetch = ancestorQuery.refetch

  return useMemo((): ConflictHydrationResult => {
    if (!enabled) {
      return { kind: 'idle' }
    }

    if (headPending || ancestorPending) {
      return { kind: 'loading' }
    }

    const firstError = headError ?? ancestorError
    if (firstError || !headData || !ancestorData) {
      const classified = classifyHydrationError(firstError ?? new Error('Missing version content.'))
      return {
        kind: 'error',
        message: classified.message,
        retryable: classified.retryable,
        retry: () => {
          void headRefetch()
          void ancestorRefetch()
        },
      }
    }

    const head = headData as NoteVersion
    const ancestor = ancestorData as NoteVersion

    if (head.noteId !== noteId || ancestor.noteId !== noteId) {
      return {
        kind: 'error',
        message: 'Conflict versions do not belong to this note.',
        retryable: false,
        retry: () => undefined,
      }
    }

    if (head.id !== headId || ancestor.id !== ancestorId) {
      return {
        kind: 'error',
        message: 'Loaded conflict versions do not match the conflict payload.',
        retryable: true,
        retry: () => {
          void headRefetch()
          void ancestorRefetch()
        },
      }
    }

    const session = buildConflictResolutionSession({
      noteId,
      localBaseVersionId,
      serverHeadVersionId: head.id,
      serverHeadRevision: head.revisionNumber,
      commonAncestorVersionId: ancestor.id,
      commonAncestorRevision: ancestor.revisionNumber,
      ancestorContent: ancestor.content,
      localContent,
      serverContent: head.content,
    })

    return { kind: 'ready', session }
  }, [
    enabled,
    noteId,
    localBaseVersionId,
    localContent,
    headId,
    ancestorId,
    headPending,
    ancestorPending,
    headError,
    ancestorError,
    headData,
    ancestorData,
    headRefetch,
    ancestorRefetch,
  ])
}
