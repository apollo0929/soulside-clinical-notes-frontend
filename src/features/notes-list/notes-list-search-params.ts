import { parseIsoDateTime } from '@/domain/datetime'
import { parsePatientId, parseUserId } from '@/domain/ids'
import { NOTE_STATUSES, type NoteStatus } from '@/domain/statuses'
import {
  DEFAULT_NOTES_LIST_FILTERS,
  type NotesListFilters,
} from '@/features/notes-list/notes-list.types'
import {
  NOTES_LIST_SORT_FIELDS,
  type NotesListSortDirection,
  type NotesListSortField,
} from '@/services/api/notes-api'

const STATUS_ORDER = new Map(NOTE_STATUSES.map((status, index) => [status, index]))

function isNoteStatus(value: string): value is NoteStatus {
  return (NOTE_STATUSES as readonly string[]).includes(value)
}

function isSortField(value: string): value is NotesListSortField {
  return (NOTES_LIST_SORT_FIELDS as readonly string[]).includes(value)
}

function isSortDirection(value: string): value is NotesListSortDirection {
  return value === 'asc' || value === 'desc'
}

function orderStatuses(statuses: readonly NoteStatus[]): NoteStatus[] {
  return [...statuses].sort((a, b) => (STATUS_ORDER.get(a) ?? 0) - (STATUS_ORDER.get(b) ?? 0))
}

/**
 * Parse URL search params into typed list filters.
 *
 * Invalid values are ignored (fallbacks to defaults). Unknown keys are ignored.
 * Callers should replace the URL with {@link serializeNotesListSearchParams} when
 * the current string is not canonical (sanitize via replace navigation).
 */
export function parseNotesListSearchParams(
  searchParams: URLSearchParams | string,
): NotesListFilters {
  const params = typeof searchParams === 'string' ? new URLSearchParams(searchParams) : searchParams

  const statusRaw = params.get('status')
  const statuses: NoteStatus[] = []
  if (statusRaw) {
    const seen = new Set<NoteStatus>()
    for (const part of statusRaw.split(',')) {
      const trimmed = part.trim()
      if (trimmed && isNoteStatus(trimmed) && !seen.has(trimmed)) {
        seen.add(trimmed)
        statuses.push(trimmed)
      }
    }
  }

  let assignedReviewerId = DEFAULT_NOTES_LIST_FILTERS.assignedReviewerId
  const reviewerRaw = params.get('reviewer')
  if (reviewerRaw && reviewerRaw.trim() !== '') {
    try {
      assignedReviewerId = parseUserId(reviewerRaw.trim())
    } catch {
      assignedReviewerId = null
    }
  }

  let patientId = DEFAULT_NOTES_LIST_FILTERS.patientId
  const patientRaw = params.get('patient')
  if (patientRaw && patientRaw.trim() !== '') {
    try {
      patientId = parsePatientId(patientRaw.trim())
    } catch {
      patientId = null
    }
  }

  let dateFrom = DEFAULT_NOTES_LIST_FILTERS.dateFrom
  const fromRaw = params.get('from')
  if (fromRaw && fromRaw.trim() !== '') {
    try {
      dateFrom = parseIsoDateTime(fromRaw.trim())
    } catch {
      dateFrom = null
    }
  }

  let dateTo = DEFAULT_NOTES_LIST_FILTERS.dateTo
  const toRaw = params.get('to')
  if (toRaw && toRaw.trim() !== '') {
    try {
      dateTo = parseIsoDateTime(toRaw.trim())
    } catch {
      dateTo = null
    }
  }

  const qRaw = params.get('q')
  const searchQuery = qRaw === null ? '' : qRaw.trim()

  const sortRaw = params.get('sort')
  const sortField = sortRaw && isSortField(sortRaw) ? sortRaw : DEFAULT_NOTES_LIST_FILTERS.sortField

  const directionRaw = params.get('direction')
  const sortDirection =
    directionRaw && isSortDirection(directionRaw)
      ? directionRaw
      : DEFAULT_NOTES_LIST_FILTERS.sortDirection

  return {
    statuses: orderStatuses(statuses),
    assignedReviewerId,
    patientId,
    dateFrom,
    dateTo,
    searchQuery,
    sortField,
    sortDirection,
  }
}

/**
 * Canonical serialization. Omits defaults. Statuses are comma-separated in
 * NOTE_STATUSES order.
 */
export function serializeNotesListSearchParams(filters: NotesListFilters): URLSearchParams {
  const params = new URLSearchParams()

  if (filters.statuses.length > 0) {
    params.set('status', orderStatuses(filters.statuses).join(','))
  }
  if (filters.assignedReviewerId) {
    params.set('reviewer', filters.assignedReviewerId)
  }
  if (filters.patientId) {
    params.set('patient', filters.patientId)
  }
  if (filters.dateFrom) {
    params.set('from', filters.dateFrom)
  }
  if (filters.dateTo) {
    params.set('to', filters.dateTo)
  }
  if (filters.searchQuery.trim() !== '') {
    params.set('q', filters.searchQuery.trim())
  }
  if (filters.sortField !== DEFAULT_NOTES_LIST_FILTERS.sortField) {
    params.set('sort', filters.sortField)
  }
  if (filters.sortDirection !== DEFAULT_NOTES_LIST_FILTERS.sortDirection) {
    params.set('direction', filters.sortDirection)
  }

  return params
}

export function notesListSearchParamsToString(filters: NotesListFilters): string {
  return serializeNotesListSearchParams(filters).toString()
}

export function areNotesListFiltersEqual(a: NotesListFilters, b: NotesListFilters): boolean {
  return notesListSearchParamsToString(a) === notesListSearchParamsToString(b)
}
