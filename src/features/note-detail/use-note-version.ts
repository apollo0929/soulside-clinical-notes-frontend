import { useQuery } from '@tanstack/react-query'

import type { NoteId, VersionId } from '@/domain/ids'
import type { NoteVersion } from '@/domain/models/note-version'
import { notesKeys } from '@/features/notes-list/notes-query-keys'
import { isApiClientError } from '@/services/api/api-errors'
import { getNoteVersionContent } from '@/services/api/note-detail-api'

export const NOTE_VERSION_STALE_TIME_MS = 60_000

function shouldRetryVersion(failureCount: number, error: unknown): boolean {
  if (isApiClientError(error) && (error.status === 403 || error.status === 404)) {
    return false
  }
  void failureCount
  return false
}

/**
 * Fetches historical version content. Disable when the version is the current
 * detail version (caller should reuse detail.currentVersion instead).
 */
export function useNoteVersion(
  noteId: NoteId | null,
  versionId: VersionId | null,
  options: { readonly enabled?: boolean } = {},
) {
  const enabled = Boolean(noteId && versionId && (options.enabled ?? true))

  return useQuery<NoteVersion>({
    queryKey:
      noteId && versionId
        ? notesKeys.version(noteId, versionId)
        : (['notes', 'version', 'disabled'] as const),
    queryFn: ({ signal }) => {
      if (!noteId || !versionId) {
        throw new Error('Version query enabled without note/version ids.')
      }
      return getNoteVersionContent(noteId, versionId, { signal })
    },
    enabled,
    staleTime: NOTE_VERSION_STALE_TIME_MS,
    retry: shouldRetryVersion,
  })
}
