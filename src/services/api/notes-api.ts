import type { IsoDateTime } from '@/domain/datetime'
import type { PatientId, UserId } from '@/domain/ids'
import { mapNoteListItemDtoToNoteSummary } from '@/domain/mappers/note-list'
import type { NoteSummary } from '@/domain/models/note-summary'
import { notesListResponseDtoSchema } from '@/domain/schemas/notes-list'
import type { NoteStatus } from '@/domain/statuses'
import { apiRequest } from '@/services/api/api-client'
import { ApiClientError } from '@/services/api/api-errors'

export const NOTES_LIST_SORT_FIELDS = [
  'updatedAt',
  'createdAt',
  'patientDisplayName',
  'status',
] as const

export type NotesListSortField = (typeof NOTES_LIST_SORT_FIELDS)[number]
export type NotesListSortDirection = 'asc' | 'desc'

export type ListNotesRequest = {
  readonly cursor?: string | null
  readonly limit?: number
  readonly statuses?: readonly NoteStatus[]
  readonly assignedReviewerId?: UserId | null
  readonly patientId?: PatientId | null
  readonly dateFrom?: IsoDateTime | null
  readonly dateTo?: IsoDateTime | null
  readonly searchQuery?: string
  readonly sortField?: NotesListSortField
  readonly sortDirection?: NotesListSortDirection
}

export type ListNotesOptions = {
  readonly signal?: AbortSignal
}

export type ListNotesResult = {
  readonly items: readonly NoteSummary[]
  readonly nextCursor: string | null
  readonly hasMore: boolean
  readonly total: number
  readonly returned: number
  readonly generatedAt: IsoDateTime
}

export const DEFAULT_NOTES_LIST_PAGE_LIMIT = 50

/**
 * Builds query params deterministically: stable key order, omit empties,
 * repeat `status` for each selected status (backend multi-value encoding).
 */
export function buildNotesListSearchParams(request: ListNotesRequest): URLSearchParams {
  const params = new URLSearchParams()

  if (request.limit !== undefined) {
    params.set('limit', String(request.limit))
  }
  if (request.cursor) {
    params.set('cursor', request.cursor)
  }
  if (request.statuses && request.statuses.length > 0) {
    for (const status of request.statuses) {
      params.append('status', status)
    }
  }
  if (request.assignedReviewerId) {
    params.set('assignedReviewerId', request.assignedReviewerId)
  }
  if (request.patientId) {
    params.set('patientId', request.patientId)
  }
  if (request.dateFrom) {
    params.set('dateFrom', request.dateFrom)
  }
  if (request.dateTo) {
    params.set('dateTo', request.dateTo)
  }
  const search = request.searchQuery?.trim() ?? ''
  if (search.length > 0) {
    params.set('q', search)
  }
  if (request.sortField) {
    params.set('sort', request.sortField)
  }
  if (request.sortDirection) {
    params.set('dir', request.sortDirection)
  }

  return params
}

export async function listNotes(
  request: ListNotesRequest = {},
  options: ListNotesOptions = {},
): Promise<ListNotesResult> {
  const { body } = await apiRequest('/api/notes', {
    method: 'GET',
    searchParams: buildNotesListSearchParams(request),
    ...(options.signal ? { signal: options.signal } : {}),
  })

  const parsed = notesListResponseDtoSchema.safeParse(body)
  if (!parsed.success) {
    throw new ApiClientError({
      status: 200,
      code: 'INVALID_RESPONSE_SCHEMA',
      message: 'Notes list response failed contract validation.',
      details: { issueCount: parsed.error.issues.length },
    })
  }

  return {
    items: parsed.data.items.map(mapNoteListItemDtoToNoteSummary),
    nextCursor: parsed.data.cursor.next,
    hasMore: parsed.data.cursor.hasMore,
    total: parsed.data.meta.total,
    returned: parsed.data.meta.returned,
    generatedAt: parsed.data.meta.generatedAt,
  }
}
