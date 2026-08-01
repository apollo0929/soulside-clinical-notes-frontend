import type { InfiniteData } from '@tanstack/react-query'

import type { NoteId, VersionId } from '@/domain/ids'
import type { NoteDetailAggregate } from '@/domain/models/note-detail-aggregate'
import type { NoteVersion, NoteVersionRef } from '@/domain/models/note-version'
import type {
  NoteReviewerChangedEventDto,
  NoteStatusChangedEventDto,
  NoteSummaryRealtimeDto,
  NoteVersionCreatedEventDto,
  RealtimeEventDto,
} from '@/domain/schemas/realtime'
import { patchNotesInInfiniteData } from '@/features/notes-list/notes-list-cache'
import type { NotesListPage } from '@/features/notes-list/use-notes-list'

export type VersionEditorClassification =
  'IGNORE_SELF' | 'IGNORE_STALE' | 'APPLY_CLEAN' | 'WARN_DIRTY'

export function applyVersionCreatedToDetail(
  aggregate: NoteDetailAggregate,
  event: NoteVersionCreatedEventDto,
): NoteDetailAggregate | null {
  if (aggregate.note.id !== event.noteId) {
    return null
  }

  const headRevision = aggregate.currentVersion.revisionNumber
  if (event.revision < headRevision) {
    return null
  }
  if (event.revision === headRevision && event.versionId !== aggregate.currentVersion.id) {
    return null
  }

  const versionExists = aggregate.versions.some((version) => version.id === event.versionId)
  if (versionExists && event.versionId === aggregate.currentVersion.id) {
    return aggregate
  }

  const newRef: NoteVersionRef = Object.freeze({
    id: event.versionId,
    noteId: event.noteId,
    revisionNumber: event.revision,
    parentVersionId: event.parentVersionId,
    authorId: event.author.id,
    authorRole: event.author.role,
    createdAt: event.updatedAt,
  })

  const nextCurrent: NoteVersion = Object.freeze({
    id: event.versionId,
    noteId: event.noteId,
    revisionNumber: event.revision,
    parentVersionId: event.parentVersionId,
    content: aggregate.currentVersion.content,
    authorId: event.author.id,
    authorRole: event.author.role,
    createdAt: event.updatedAt,
  })

  const summary = event.summary
  const assignedReviewer =
    summary?.assignedReviewer === undefined
      ? aggregate.assignedReviewer
      : summary.assignedReviewer === null
        ? null
        : {
            id: summary.assignedReviewer.id,
            displayName: summary.assignedReviewer.displayName,
            role: summary.assignedReviewer.role,
          }

  return {
    ...aggregate,
    note: {
      ...aggregate.note,
      currentVersionId: event.versionId,
      status: summary?.status ?? aggregate.note.status,
      updatedAt: summary?.updatedAt ?? event.updatedAt,
    },
    assignedReviewer,
    currentVersion: nextCurrent,
    versions: versionExists ? aggregate.versions : [...aggregate.versions, newRef],
  }
}

export function applyStatusOrReviewerToDetail(
  aggregate: NoteDetailAggregate,
  event: NoteStatusChangedEventDto | NoteReviewerChangedEventDto,
): NoteDetailAggregate {
  const summary = event.summary
  const assignedReviewer =
    event.eventType === 'NOTE_REVIEWER_CHANGED'
      ? event.assignedReviewer === null
        ? null
        : {
            id: event.assignedReviewer.id,
            displayName: event.assignedReviewer.displayName,
            role: event.assignedReviewer.role,
          }
      : summary?.assignedReviewer === undefined
        ? aggregate.assignedReviewer
        : summary.assignedReviewer === null
          ? null
          : {
              id: summary.assignedReviewer.id,
              displayName: summary.assignedReviewer.displayName,
              role: summary.assignedReviewer.role,
            }

  return {
    ...aggregate,
    note: {
      ...aggregate.note,
      status:
        event.eventType === 'NOTE_STATUS_CHANGED'
          ? event.toStatus
          : (summary?.status ?? aggregate.note.status),
      currentVersionId: summary?.currentVersionId ?? aggregate.note.currentVersionId,
      updatedAt: summary?.updatedAt ?? aggregate.note.updatedAt,
    },
    assignedReviewer,
  }
}

function summaryToListPatch(summary: NoteSummaryRealtimeDto) {
  return {
    status: summary.status,
    currentVersionId: summary.currentVersionId,
    currentRevision: summary.currentRevision,
    assignedReviewer:
      summary.assignedReviewer === null
        ? null
        : {
            id: summary.assignedReviewer.id,
            displayName: summary.assignedReviewer.displayName,
          },
    updatedAt: summary.updatedAt,
  }
}

export function applyNoteSummaryToListCache(
  infiniteData: InfiniteData<NotesListPage, string | null>,
  summary: NoteSummaryRealtimeDto,
): InfiniteData<NotesListPage, string | null> {
  const patch = summaryToListPatch(summary)
  const patchById = new Map<NoteId, typeof patch>([[summary.id, patch]])
  return patchNotesInInfiniteData(infiniteData, patchById)
}

export function shouldInvalidateListForMembershipChange(event: RealtimeEventDto): boolean {
  return (
    event.eventType === 'NOTE_STATUS_CHANGED' ||
    event.eventType === 'NOTE_REVIEWER_CHANGED' ||
    event.eventType === 'NOTE_DELETED'
  )
}

export function classifyVersionEventAgainstEditor(input: {
  readonly editorBaseVersionId: VersionId
  readonly isDirty: boolean
  readonly event: NoteVersionCreatedEventDto
  readonly localMutationIds: ReadonlySet<string>
}): VersionEditorClassification {
  const mutationId = input.event.originatingClientMutationId
  if (mutationId !== null && input.localMutationIds.has(String(mutationId))) {
    return 'IGNORE_SELF'
  }
  if (input.localMutationIds.has(String(input.event.versionId))) {
    return 'IGNORE_SELF'
  }

  if (input.event.versionId === input.editorBaseVersionId) {
    return 'IGNORE_STALE'
  }

  if (input.isDirty) {
    return 'WARN_DIRTY'
  }

  return 'APPLY_CLEAN'
}
