import {
  type InfiniteData,
  useInfiniteQuery,
  type UseInfiniteQueryResult,
} from '@tanstack/react-query'
import { useMemo } from 'react'

import type { NoteSummary } from '@/domain/models/note-summary'
import type { NotesListFilters } from '@/features/notes-list/notes-list.types'
import { notesKeys } from '@/features/notes-list/notes-query-keys'
import { isApiClientError, isNetworkApiError } from '@/services/api/api-errors'
import {
  DEFAULT_NOTES_LIST_PAGE_LIMIT,
  listNotes,
  type ListNotesResult,
} from '@/services/api/notes-api'

export type NotesListPage = ListNotesResult

export type UseNotesListResult = {
  readonly query: UseInfiniteQueryResult<InfiniteData<NotesListPage>, Error>
  readonly rows: readonly NoteSummary[]
  readonly total: number | null
  readonly hasActiveFilters: boolean
}

function filtersToListRequest(filters: NotesListFilters) {
  return {
    statuses: filters.statuses,
    assignedReviewerId: filters.assignedReviewerId,
    patientId: filters.patientId,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    searchQuery: filters.searchQuery,
    sortField: filters.sortField,
    sortDirection: filters.sortDirection,
    limit: DEFAULT_NOTES_LIST_PAGE_LIMIT,
  }
}

export function flattenNotesPages(data: InfiniteData<NotesListPage> | undefined): NoteSummary[] {
  if (!data) {
    return []
  }
  const seen = new Set<string>()
  const rows: NoteSummary[] = []
  for (const page of data.pages) {
    for (const item of page.items) {
      if (seen.has(item.id)) {
        continue
      }
      seen.add(item.id)
      rows.push(item)
    }
  }
  return rows
}

export function useNotesList(filters: NotesListFilters): UseNotesListResult {
  const queryKey = notesKeys.list(filters)

  const query = useInfiniteQuery({
    queryKey,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      listNotes(
        {
          ...filtersToListRequest(filters),
          cursor: pageParam,
        },
        { signal },
      ),
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor : undefined),
  })

  const rows = useMemo(() => flattenNotesPages(query.data), [query.data])

  const total = query.data?.pages[0]?.total ?? null

  const hasActiveFilters =
    filters.statuses.length > 0 ||
    filters.assignedReviewerId !== null ||
    filters.patientId !== null ||
    filters.dateFrom !== null ||
    filters.dateTo !== null ||
    filters.searchQuery.trim() !== ''

  return { query, rows, total, hasActiveFilters }
}

export function getNotesListErrorMessage(error: unknown): string {
  if (isApiClientError(error) || isNetworkApiError(error)) {
    return error.message
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'An unexpected error occurred while loading notes.'
}
