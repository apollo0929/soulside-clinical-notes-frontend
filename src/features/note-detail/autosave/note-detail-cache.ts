import type { QueryClient } from '@tanstack/react-query'

import type { IsoDateTime } from '@/domain/datetime'
import type { NoteId, UserId, VersionId } from '@/domain/ids'
import type { NoteDetailAggregate } from '@/domain/models/note-detail-aggregate'
import type { NoteVersion, NoteVersionRef } from '@/domain/models/note-version'
import type { SoapContent } from '@/domain/models/soap'
import { cloneSoapContent } from '@/domain/models/soap'
import type { UserRole } from '@/domain/roles'
import { notesKeys } from '@/features/notes-list/notes-query-keys'

export type ApplySuccessfulVersionInput = {
  readonly noteId: NoteId
  readonly versionId: VersionId
  readonly revision: number
  readonly parentVersionId: VersionId
  readonly savedContent: SoapContent
  readonly authorId: UserId
  readonly authorRole: UserRole
  /**
   * Prefer a server timestamp when available. When omitted, the previous
   * `note.updatedAt` / version `createdAt` is retained (success DTO has no timestamp).
   */
  readonly createdAt?: IsoDateTime
}

/**
 * Pure helper: append version ref if missing and promote current version.
 * Does not mutate the input aggregate.
 */
export function applySuccessfulVersionToDetail(
  aggregate: NoteDetailAggregate,
  input: ApplySuccessfulVersionInput,
): NoteDetailAggregate {
  const alreadyPresent = aggregate.versions.some((version) => version.id === input.versionId)
  const createdAt = input.createdAt ?? aggregate.currentVersion.createdAt
  const newVersion: NoteVersion = Object.freeze({
    id: input.versionId,
    noteId: input.noteId,
    revisionNumber: input.revision,
    parentVersionId: input.parentVersionId,
    content: cloneSoapContent(input.savedContent),
    authorId: input.authorId,
    authorRole: input.authorRole,
    createdAt,
  })
  const newRef: NoteVersionRef = Object.freeze({
    id: newVersion.id,
    noteId: newVersion.noteId,
    revisionNumber: newVersion.revisionNumber,
    parentVersionId: newVersion.parentVersionId,
    authorId: newVersion.authorId,
    authorRole: newVersion.authorRole,
    createdAt: newVersion.createdAt,
  })

  return {
    ...aggregate,
    note: {
      ...aggregate.note,
      currentVersionId: input.versionId,
      // Retain prior updatedAt unless the server supplied a timestamp on the success DTO.
      updatedAt: input.createdAt ?? aggregate.note.updatedAt,
    },
    currentVersion: newVersion,
    versions: alreadyPresent ? aggregate.versions : [...aggregate.versions, newRef],
  }
}

/**
 * Reconcile detail cache after a successful create-version.
 * List queries are invalidated without clearing rows (active refetch).
 * Detail is updated locally; a soft invalidate marks it stale for a later refresh
 * that can fill authoritative timestamps without fabricating them here.
 */
export function reconcileDetailCacheAfterSave(
  queryClient: QueryClient,
  input: ApplySuccessfulVersionInput,
): void {
  const key = notesKeys.detail(input.noteId)
  queryClient.setQueryData<NoteDetailAggregate>(key, (current) => {
    if (!current) {
      return current
    }
    return applySuccessfulVersionToDetail(current, input)
  })
  void queryClient.invalidateQueries({
    queryKey: notesKeys.detail(input.noteId),
    refetchType: 'none',
  })
  void queryClient.invalidateQueries({ queryKey: notesKeys.lists() })
}
