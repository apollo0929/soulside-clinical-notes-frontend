import './NotesListPage.css'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { parseIsoDateTime } from '@/domain/datetime'
import { parsePatientId, parseUserId } from '@/domain/ids'
import type { NoteStatus } from '@/domain/statuses'
import {
  DEFAULT_NOTES_LIST_FILTERS,
  type NotesListFilters,
} from '@/features/notes-list/notes-list.types'
import {
  areNotesListFiltersEqual,
  parseNotesListSearchParams,
  serializeNotesListSearchParams,
} from '@/features/notes-list/notes-list-search-params'
import { NotesFilters } from '@/features/notes-list/NotesFilters'
import { NotesListEmptyState } from '@/features/notes-list/NotesListEmptyState'
import { NotesListErrorState } from '@/features/notes-list/NotesListErrorState'
import { NotesListSkeleton } from '@/features/notes-list/NotesListSkeleton'
import { NotesVirtualList } from '@/features/notes-list/NotesVirtualList'
import { useDebouncedValue } from '@/features/notes-list/use-debounced-search-param'
import { getNotesListErrorMessage, useNotesList } from '@/features/notes-list/use-notes-list'
import type { NotesListSortDirection, NotesListSortField } from '@/services/api/notes-api'

function applyFiltersToSearchParams(
  current: URLSearchParams,
  filters: NotesListFilters,
): URLSearchParams {
  const next = new URLSearchParams(current)
  for (const key of ['status', 'reviewer', 'patient', 'from', 'to', 'q', 'sort', 'direction']) {
    next.delete(key)
  }
  const serialized = serializeNotesListSearchParams(filters)
  for (const [key, value] of serialized.entries()) {
    next.set(key, value)
  }
  return next
}

export function NotesListPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const urlFilters = useMemo(() => parseNotesListSearchParams(searchParams), [searchParams])

  // Canonicalize invalid/non-canonical URL params via replace navigation.
  useEffect(() => {
    const desired = applyFiltersToSearchParams(searchParams, urlFilters)
    if (desired.toString() !== searchParams.toString()) {
      setSearchParams(desired, { replace: true })
    }
  }, [searchParams, urlFilters, setSearchParams])

  const [searchInput, setSearchInput] = useState(urlFilters.searchQuery)
  const [dateFromInput, setDateFromInput] = useState(urlFilters.dateFrom ?? '')
  const [dateToInput, setDateToInput] = useState(urlFilters.dateTo ?? '')
  const [syncedSearchQuery, setSyncedSearchQuery] = useState(urlFilters.searchQuery)
  const [syncedDateFrom, setSyncedDateFrom] = useState(urlFilters.dateFrom)
  const [syncedDateTo, setSyncedDateTo] = useState(urlFilters.dateTo)

  // Align draft inputs when URL filters change (back/forward/clear) without an effect.
  if (urlFilters.searchQuery !== syncedSearchQuery) {
    setSyncedSearchQuery(urlFilters.searchQuery)
    setSearchInput(urlFilters.searchQuery)
  }
  if (urlFilters.dateFrom !== syncedDateFrom) {
    setSyncedDateFrom(urlFilters.dateFrom)
    setDateFromInput(urlFilters.dateFrom ?? '')
  }
  if (urlFilters.dateTo !== syncedDateTo) {
    setSyncedDateTo(urlFilters.dateTo)
    setDateToInput(urlFilters.dateTo ?? '')
  }

  const debouncedSearch = useDebouncedValue(searchInput)

  // Push debounced search into the URL only after the input has settled
  // (debounced value matches the live input). Prevents a stale debounce write
  // from re-applying filters after Clear filters resets the URL.
  useEffect(() => {
    if (debouncedSearch !== searchInput) {
      return
    }
    const trimmed = debouncedSearch.trim()
    setSearchParams(
      (current) => {
        const parsed = parseNotesListSearchParams(current)
        if (trimmed === parsed.searchQuery) {
          return current
        }
        return applyFiltersToSearchParams(current, { ...parsed, searchQuery: trimmed })
      },
      { replace: true },
    )
  }, [debouncedSearch, searchInput, setSearchParams])

  const filters: NotesListFilters = urlFilters

  const { query, rows, total, hasActiveFilters } = useNotesList(filters)

  const reviewerOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const row of rows) {
      if (row.assignedReviewer) {
        map.set(row.assignedReviewer.id, row.assignedReviewer.displayName)
      }
    }
    return [...map.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [rows])

  const patientOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const row of rows) {
      map.set(row.patientId, row.patientDisplayName)
    }
    return [...map.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [rows])

  function updateFilters(patch: Partial<NotesListFilters>): void {
    const next: NotesListFilters = { ...filters, ...patch }
    if (areNotesListFiltersEqual(filters, next)) {
      return
    }
    setSearchParams(applyFiltersToSearchParams(searchParams, next), { replace: false })
  }

  function handleSearchInputChange(value: string): void {
    setSearchInput(value)
    if (value.trim() === '') {
      updateFilters({ searchQuery: '' })
    }
  }

  function handleClearFilters(): void {
    setSearchInput('')
    setSyncedSearchQuery('')
    setDateFromInput('')
    setDateToInput('')
    setSyncedDateFrom(null)
    setSyncedDateTo(null)
    setSearchParams((current) => applyFiltersToSearchParams(current, DEFAULT_NOTES_LIST_FILTERS), {
      replace: false,
    })
  }

  function handleStatusesChange(statuses: readonly NoteStatus[]): void {
    updateFilters({ statuses })
  }

  function handleReviewerChange(value: string): void {
    if (value.trim() === '') {
      updateFilters({ assignedReviewerId: null })
      return
    }
    try {
      updateFilters({ assignedReviewerId: parseUserId(value.trim()) })
    } catch {
      // ignore invalid select values
    }
  }

  function handlePatientChange(value: string): void {
    if (value.trim() === '') {
      updateFilters({ patientId: null })
      return
    }
    try {
      updateFilters({ patientId: parsePatientId(value.trim()) })
    } catch {
      // ignore invalid select values
    }
  }

  function handleDateFromChange(value: string): void {
    setDateFromInput(value)
    if (value.trim() === '') {
      updateFilters({ dateFrom: null })
      return
    }
    try {
      updateFilters({ dateFrom: parseIsoDateTime(value.trim()) })
    } catch {
      // keep typing until valid ISO — do not crash; leave prior valid filter
    }
  }

  function handleDateToChange(value: string): void {
    setDateToInput(value)
    if (value.trim() === '') {
      updateFilters({ dateTo: null })
      return
    }
    try {
      updateFilters({ dateTo: parseIsoDateTime(value.trim()) })
    } catch {
      // leave prior valid filter while user edits
    }
  }

  function handleSortFieldChange(sortField: NotesListSortField): void {
    if (sortField === filters.sortField) {
      updateFilters({
        sortDirection: filters.sortDirection === 'asc' ? 'desc' : 'asc',
      })
      return
    }
    updateFilters({ sortField, sortDirection: 'desc' })
  }

  function handleSortDirectionChange(sortDirection: NotesListSortDirection): void {
    updateFilters({ sortDirection })
  }

  function handleLoadMore(): void {
    if (query.hasNextPage && !query.isFetchingNextPage) {
      void query.fetchNextPage()
    }
  }

  const isInitialLoading = query.isPending && rows.length === 0
  const isError = query.isError && rows.length === 0
  const isEmptyDataset =
    query.isSuccess && rows.length === 0 && !hasActiveFilters && filters.searchQuery === ''
  const isNoResults =
    query.isSuccess && rows.length === 0 && (hasActiveFilters || filters.searchQuery.trim() !== '')

  const statusMessage = (() => {
    if (isInitialLoading) {
      return 'Loading notes.'
    }
    if (isError) {
      return getNotesListErrorMessage(query.error)
    }
    if (isEmptyDataset) {
      return 'Result count: 0 notes available.'
    }
    if (isNoResults) {
      return 'Result count: 0 matching notes.'
    }
    if (total !== null) {
      return `Showing ${rows.length} of ${total} notes.`
    }
    return `Showing ${rows.length} notes.`
  })()

  return (
    <div className="notes-list-page">
      <header className="notes-list-page__header">
        <h1 id="notes-list-heading">Clinical notes</h1>
        <p>Browse notes with server-side filters, search, and cursor pagination.</p>
      </header>

      <NotesFilters
        filters={filters}
        searchInput={searchInput}
        dateFromInput={dateFromInput}
        dateToInput={dateToInput}
        onSearchInputChange={handleSearchInputChange}
        onStatusesChange={handleStatusesChange}
        onReviewerChange={handleReviewerChange}
        onPatientChange={handlePatientChange}
        onDateFromChange={handleDateFromChange}
        onDateToChange={handleDateToChange}
        onSortFieldChange={handleSortFieldChange}
        onSortDirectionChange={handleSortDirectionChange}
        onClearFilters={handleClearFilters}
        reviewerOptions={reviewerOptions}
        patientOptions={patientOptions}
      />

      <section className="notes-list-page__results" aria-labelledby="notes-results-heading">
        <div className="notes-list-page__results-header">
          <h2 id="notes-results-heading">Results</h2>
          <p className="notes-list-page__status" aria-live="polite" role="status">
            {statusMessage}
            {query.isFetching && !query.isPending && !query.isFetchingNextPage
              ? ' Refreshing…'
              : null}
          </p>
        </div>

        {isInitialLoading ? <NotesListSkeleton /> : null}

        {isError ? (
          <NotesListErrorState
            message={getNotesListErrorMessage(query.error)}
            onRetry={() => {
              void query.refetch()
            }}
          />
        ) : null}

        {isEmptyDataset ? <NotesListEmptyState variant="empty" /> : null}

        {isNoResults ? (
          <NotesListEmptyState variant="no-results" onClearFilters={handleClearFilters} />
        ) : null}

        {rows.length > 0 ? (
          <NotesVirtualList
            rows={rows}
            sortField={filters.sortField}
            sortDirection={filters.sortDirection}
            onSortFieldChange={handleSortFieldChange}
            hasNextPage={Boolean(query.hasNextPage)}
            isFetchingNextPage={query.isFetchingNextPage}
            onLoadMore={handleLoadMore}
          />
        ) : null}
      </section>
    </div>
  )
}
