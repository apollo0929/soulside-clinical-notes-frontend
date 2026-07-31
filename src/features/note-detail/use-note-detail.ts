import { useQuery } from '@tanstack/react-query'

import type { NoteId } from '@/domain/ids'
import type { NoteDetailAggregate } from '@/domain/models/note-detail-aggregate'
import { notesKeys } from '@/features/notes-list/notes-query-keys'
import { isApiClientError } from '@/services/api/api-errors'
import { getNoteDetail } from '@/services/api/note-detail-api'

/** Detail content changes infrequently during Step 7A read path. */
export const NOTE_DETAIL_STALE_TIME_MS = 30_000

function shouldRetryDetail(failureCount: number, error: unknown): boolean {
  if (isApiClientError(error) && (error.status === 403 || error.status === 404)) {
    return false
  }
  void failureCount
  return false
}

export function useNoteDetail(noteId: NoteId | null) {
  return useQuery<NoteDetailAggregate>({
    queryKey: noteId ? notesKeys.detail(noteId) : (['notes', 'detail', 'invalid'] as const),
    queryFn: ({ signal }) => {
      if (!noteId) {
        throw new Error('Note detail query enabled without a valid note id.')
      }
      return getNoteDetail(noteId, { signal })
    },
    enabled: noteId !== null,
    staleTime: NOTE_DETAIL_STALE_TIME_MS,
    retry: shouldRetryDetail,
  })
}
