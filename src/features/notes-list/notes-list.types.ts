import type { IsoDateTime } from '@/domain/datetime'
import type { PatientId, UserId } from '@/domain/ids'
import type { NoteStatus } from '@/domain/statuses'
import type { NotesListSortDirection, NotesListSortField } from '@/services/api/notes-api'

export type NotesListFilters = {
  readonly statuses: readonly NoteStatus[]
  readonly assignedReviewerId: UserId | null
  readonly patientId: PatientId | null
  readonly dateFrom: IsoDateTime | null
  readonly dateTo: IsoDateTime | null
  readonly searchQuery: string
  readonly sortField: NotesListSortField
  readonly sortDirection: NotesListSortDirection
}

export const DEFAULT_NOTES_LIST_FILTERS: NotesListFilters = Object.freeze({
  statuses: Object.freeze([]) as readonly NoteStatus[],
  assignedReviewerId: null,
  patientId: null,
  dateFrom: null,
  dateTo: null,
  searchQuery: '',
  sortField: 'updatedAt',
  sortDirection: 'desc',
})

export function notesListFiltersAreDefault(filters: NotesListFilters): boolean {
  return (
    filters.statuses.length === 0 &&
    filters.assignedReviewerId === null &&
    filters.patientId === null &&
    filters.dateFrom === null &&
    filters.dateTo === null &&
    filters.searchQuery === '' &&
    filters.sortField === DEFAULT_NOTES_LIST_FILTERS.sortField &&
    filters.sortDirection === DEFAULT_NOTES_LIST_FILTERS.sortDirection
  )
}
