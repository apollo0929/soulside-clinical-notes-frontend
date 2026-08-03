import { useQuery } from '@tanstack/react-query'

import type { NoteId } from '@/domain/ids'
import type { NoteDetailAggregate } from '@/domain/models/note-detail-aggregate'
import { notesKeys } from '@/features/notes-list/notes-query-keys'
import { isApiClientError, isNetworkApiError } from '@/services/api/api-errors'
import { getNoteDetail } from '@/services/api/note-detail-api'
import { getConnectivityService } from '@/services/offline/connectivity'
import {
  isValidCachedNoteDetail,
  persistNoteDetailToOfflineCache,
} from '@/services/offline/offline-bootstrap'
import { createReadCacheRepository } from '@/services/offline/read-cache.repository'

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
    queryFn: async ({ signal }) => {
      if (!noteId) {
        throw new Error('Note detail query enabled without a valid note id.')
      }
      try {
        const detail = await getNoteDetail(noteId, { signal })
        void persistNoteDetailToOfflineCache(noteId, detail)
        return detail
      } catch (error) {
        const offlineLike =
          isNetworkApiError(error) || (typeof navigator !== 'undefined' && !navigator.onLine)
        if (offlineLike) {
          const connectivity = getConnectivityService()
          if (typeof navigator !== 'undefined' && navigator.onLine) {
            connectivity.markDegraded('Unable to refresh note from the server.')
          } else {
            connectivity.markOffline()
          }
        }
        // Prefer durable IndexedDB detail over a remounted empty mock backend / transient fail.
        // Validate before trusting: malformed cached payloads (missing authorId etc.) must be
        // rejected here so parseUserId is never called with undefined during render.
        const cached = await createReadCacheRepository().getNoteDetail(noteId)
        if (cached?.payload && isValidCachedNoteDetail(cached.payload)) {
          return cached.payload as NoteDetailAggregate
        }
        throw error
      }
    },
    enabled: noteId !== null,
    staleTime: NOTE_DETAIL_STALE_TIME_MS,
    retry: shouldRetryDetail,
    networkMode: 'offlineFirst',
  })
}
