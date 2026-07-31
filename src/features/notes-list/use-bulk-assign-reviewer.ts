import { type InfiniteData, useMutation, useQueryClient } from '@tanstack/react-query'

import type { NoteId, UserId } from '@/domain/ids'
import type { NoteSummary } from '@/domain/models/note-summary'
import {
  applyBulkResultsToInfiniteData,
  type NotesInfiniteData,
  patchNotesInInfiniteData,
  restoreNotesInInfiniteData,
  snapshotNotesById,
} from '@/features/notes-list/notes-list-cache'
import { notesKeys } from '@/features/notes-list/notes-query-keys'
import type { NotesListPage } from '@/features/notes-list/use-notes-list'
import {
  assignReviewerBulk,
  type BulkMutationClientResult,
  createClientMutationId,
} from '@/services/api/bulk-actions-api'

export type BulkAssignVariables = {
  readonly noteIds: readonly NoteId[]
  readonly reviewerId: UserId
  readonly reviewerDisplayName: string
  readonly listQueryKey: ReturnType<typeof notesKeys.list>
}

export type BulkAssignContext = {
  readonly snapshot: Map<NoteId, NoteSummary>
  readonly listQueryKey: ReturnType<typeof notesKeys.list>
}

export type BulkAssignResult = BulkMutationClientResult & {
  readonly successIds: readonly NoteId[]
  readonly failedIds: readonly NoteId[]
}

export function useBulkAssignReviewer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ['notes', 'bulk-assign'],
    mutationFn: async (variables: BulkAssignVariables): Promise<BulkAssignResult> => {
      const response = await assignReviewerBulk({
        noteIds: [...variables.noteIds],
        reviewerId: variables.reviewerId,
        clientMutationId: createClientMutationId('mut_bulk_assign'),
      })
      const successIds: NoteId[] = []
      const failedIds: NoteId[] = []
      for (const item of response.results) {
        if (item.success) {
          successIds.push(item.noteId as NoteId)
        } else {
          failedIds.push(item.noteId as NoteId)
        }
      }
      return { ...response, successIds, failedIds }
    },
    onMutate: async (variables): Promise<BulkAssignContext> => {
      await queryClient.cancelQueries({ queryKey: variables.listQueryKey })
      const previous = queryClient.getQueryData<NotesInfiniteData>(variables.listQueryKey)
      const snapshot = snapshotNotesById(previous, variables.noteIds)

      if (previous) {
        const patch = new Map<NoteId, Partial<NoteSummary>>()
        for (const id of variables.noteIds) {
          if (!snapshot.has(id)) {
            continue
          }
          patch.set(id, {
            assignedReviewer: {
              id: variables.reviewerId,
              displayName: variables.reviewerDisplayName,
            },
          })
        }
        queryClient.setQueryData<NotesInfiniteData>(
          variables.listQueryKey,
          patchNotesInInfiniteData(previous, patch),
        )
      }

      return { snapshot, listQueryKey: variables.listQueryKey }
    },
    onError: (_error, _variables, context) => {
      if (!context) {
        return
      }
      const current = queryClient.getQueryData<NotesInfiniteData>(context.listQueryKey)
      if (current) {
        queryClient.setQueryData(
          context.listQueryKey,
          restoreNotesInInfiniteData(current, context.snapshot),
        )
      }
    },
    onSuccess: (result, _variables, context) => {
      if (!context) {
        return
      }
      const current = queryClient.getQueryData<NotesInfiniteData>(context.listQueryKey)
      if (!current) {
        return
      }

      const successes = new Map<NoteId, NoteSummary>()
      const failures = new Map<NoteId, NoteSummary>()
      for (const item of result.results) {
        const id = item.noteId as NoteId
        if (item.success) {
          successes.set(id, item.note)
        } else {
          const prior = context.snapshot.get(id)
          if (prior) {
            failures.set(id, prior)
          }
        }
      }

      queryClient.setQueryData(
        context.listQueryKey,
        applyBulkResultsToInfiniteData(current, { successes, failures }),
      )
    },
    onSettled: async (_result, _error, variables) => {
      await queryClient.invalidateQueries({
        queryKey: notesKeys.lists(),
        refetchType: 'active',
      })
      void variables
    },
  })
}

export type { InfiniteData, NotesListPage }
