import type { NoteId, VersionId } from '@/domain/ids'
import { NOTE_STATUSES, type NoteStatus } from '@/domain/statuses'
import type { NotesListFilters } from '@/features/notes-list/notes-list.types'

export type NotesListQueryKeyInput = {
  readonly statuses: NotesListFilters['statuses']
  readonly assignedReviewerId: NotesListFilters['assignedReviewerId']
  readonly patientId: NotesListFilters['patientId']
  readonly dateFrom: NotesListFilters['dateFrom']
  readonly dateTo: NotesListFilters['dateTo']
  readonly searchQuery: NotesListFilters['searchQuery']
  readonly sortField: NotesListFilters['sortField']
  readonly sortDirection: NotesListFilters['sortDirection']
}

const STATUS_ORDER = new Map(NOTE_STATUSES.map((status, index) => [status, index]))

function orderStatuses(statuses: readonly NoteStatus[]): NoteStatus[] {
  return [...statuses].sort((a, b) => (STATUS_ORDER.get(a) ?? 0) - (STATUS_ORDER.get(b) ?? 0))
}

/**
 * Stable query-key factory. Cursor is a pageParam, not part of the base list key.
 * Statuses are copied into a sorted tuple so object identity does not matter.
 * Detail and version keys nest under `notes` without colliding with list keys.
 */
export const notesKeys = {
  all: ['notes'] as const,
  lists: () => [...notesKeys.all, 'list'] as const,
  list: (input: NotesListQueryKeyInput) =>
    [
      ...notesKeys.lists(),
      {
        statuses: orderStatuses(input.statuses),
        assignedReviewerId: input.assignedReviewerId,
        patientId: input.patientId,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        searchQuery: input.searchQuery,
        sortField: input.sortField,
        sortDirection: input.sortDirection,
      },
    ] as const,
  details: () => [...notesKeys.all, 'detail'] as const,
  detail: (noteId: NoteId) => [...notesKeys.details(), noteId] as const,
  versions: () => [...notesKeys.all, 'version'] as const,
  version: (noteId: NoteId, versionId: VersionId) =>
    [...notesKeys.versions(), noteId, versionId] as const,
}
