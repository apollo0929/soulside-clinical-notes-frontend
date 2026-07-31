import './NotesListPage.css'

import { useEffect, useMemo, useReducer, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { parseIsoDateTime } from '@/domain/datetime'
import type { NoteId } from '@/domain/ids'
import { parsePatientId, parseUserId } from '@/domain/ids'
import type { NoteStatus } from '@/domain/statuses'
import { BulkActionToolbar } from '@/features/notes-list/BulkActionToolbar'
import {
  DEFAULT_NOTES_LIST_FILTERS,
  type NotesListFilters,
} from '@/features/notes-list/notes-list.types'
import {
  areNotesListFiltersEqual,
  parseNotesListSearchParams,
  serializeNotesListSearchParams,
} from '@/features/notes-list/notes-list-search-params'
import { notesKeys } from '@/features/notes-list/notes-query-keys'
import { NotesFilters } from '@/features/notes-list/NotesFilters'
import { NotesListEmptyState } from '@/features/notes-list/NotesListEmptyState'
import { NotesListErrorState } from '@/features/notes-list/NotesListErrorState'
import { NotesListSkeleton } from '@/features/notes-list/NotesListSkeleton'
import { NotesVirtualList } from '@/features/notes-list/NotesVirtualList'
import {
  getSelectAllCheckboxState,
  INITIAL_NOTES_SELECTION,
  notesSelectionReducer,
} from '@/features/notes-list/selection-reducer'
import { useBulkAssignReviewer } from '@/features/notes-list/use-bulk-assign-reviewer'
import { useBulkRegenerate } from '@/features/notes-list/use-bulk-regenerate'
import { useDebouncedValue } from '@/features/notes-list/use-debounced-search-param'
import { getNotesListErrorMessage, useNotesList } from '@/features/notes-list/use-notes-list'
import { DEFAULT_DEV_SEED, getActorIdentity } from '@/services/api/actor-provider'
import { isApiClientError } from '@/services/api/api-errors'
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

const SEEDED_REVIEWER_OPTIONS = Object.freeze(
  Array.from({ length: 5 }, (_, index) =>
    Object.freeze({
      id: `usr_reviewer_${DEFAULT_DEV_SEED}_${index}`,
      label: `Reviewer ${index + 1}`,
    }),
  ),
)

export function NotesListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const listReturnTo = `/notes${searchParams.toString() ? `?${searchParams.toString()}` : ''}`

  const urlFilters = useMemo(() => parseNotesListSearchParams(searchParams), [searchParams])

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
  const listQueryKey = notesKeys.list(filters)

  const { query, rows, total, hasActiveFilters } = useNotesList(filters)

  const [selection, dispatchSelection] = useReducer(notesSelectionReducer, INITIAL_NOTES_SELECTION)
  const [bulkReviewerId, setBulkReviewerId] = useState('')
  const [resultAnnouncement, setResultAnnouncement] = useState<string | null>(null)
  const [bulkError, setBulkError] = useState<string | null>(null)

  const assignMutation = useBulkAssignReviewer()
  const regenerateMutation = useBulkRegenerate()

  const visibleIds = useMemo(() => rows.map((row) => row.id), [rows])

  // After a replacement query successfully loads its first page, prune selection
  // to IDs present in currently loaded rows (not while the query is still pending).
  useEffect(() => {
    if (!query.isSuccess || query.isFetching) {
      return
    }
    dispatchSelection({ type: 'PRUNE', visibleIds })
  }, [query.isSuccess, query.isFetching, query.dataUpdatedAt, visibleIds])

  const pendingIds = useMemo(() => {
    const ids = new Set<NoteId>()
    if (assignMutation.isPending && assignMutation.variables) {
      for (const id of assignMutation.variables.noteIds) {
        ids.add(id)
      }
    }
    if (regenerateMutation.isPending && regenerateMutation.variables) {
      for (const id of regenerateMutation.variables.noteIds) {
        ids.add(id)
      }
    }
    return ids
  }, [
    assignMutation.isPending,
    assignMutation.variables,
    regenerateMutation.isPending,
    regenerateMutation.variables,
  ])

  const reviewerOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const option of SEEDED_REVIEWER_OPTIONS) {
      map.set(option.id, option.label)
    }
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

  const selectAllState = getSelectAllCheckboxState(selection.selectedIds, visibleIds)
  const selectedCount = selection.selectedIds.size
  const actor = getActorIdentity()
  const isAdmin = actor.role === 'ADMIN'

  const selectedRows = useMemo(
    () => rows.filter((row) => selection.selectedIds.has(row.id)),
    [rows, selection.selectedIds],
  )

  const visibleIdSet = useMemo(() => new Set(visibleIds), [visibleIds])
  const hasHiddenSelection = [...selection.selectedIds].some((id) => !visibleIdSet.has(id))

  const assignDisabledReason = (() => {
    if (!isAdmin) {
      return 'Only administrators may assign reviewers.'
    }
    if (selectedCount === 0) {
      return 'Select at least one note.'
    }
    if (hasHiddenSelection) {
      return 'Selection includes notes that are not currently visible. Wait for the list to update, or clear selection.'
    }
    if (!bulkReviewerId) {
      return 'Select a reviewer before assigning.'
    }
    return null
  })()

  const regenerateDisabledReason = (() => {
    if (!isAdmin) {
      return 'Only administrators may request regeneration.'
    }
    if (selectedCount === 0) {
      return 'Select at least one note.'
    }
    if (hasHiddenSelection) {
      return 'Selection includes notes that are not currently visible. Wait for the list to update, or clear selection.'
    }
    const failedSelected = selectedRows.filter((row) => row.status === 'FAILED')
    if (failedSelected.length === 0) {
      return 'Select one or more FAILED notes to regenerate.'
    }
    return null
  })()

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
      // keep typing until valid ISO
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

  function handleToggleSelectAll(): void {
    if (selectAllState === 'checked') {
      dispatchSelection({ type: 'CLEAR_VISIBLE', noteIds: visibleIds })
      return
    }
    dispatchSelection({ type: 'SELECT_VISIBLE', noteIds: visibleIds })
  }

  function handleClearSelection(): void {
    focusResultsHeading()
    dispatchSelection({ type: 'CLEAR_ALL' })
    setResultAnnouncement(null)
    setBulkError(null)
  }

  function summarizeResults(successCount: number, failureCount: number): string {
    return `${successCount} ${successCount === 1 ? 'note' : 'notes'} updated. ${failureCount} ${failureCount === 1 ? 'note' : 'notes'} could not be updated.`
  }

  function formatItemFailures(
    results: readonly {
      readonly success: boolean
      readonly noteId: string
      readonly error?: { readonly message: string }
    }[],
  ): string {
    const failures = results.filter((item) => !item.success)
    const shown = failures.slice(0, 5)
    const details = shown
      .map((item) => `${item.noteId}: ${item.error?.message ?? 'Update failed'}`)
      .join(' ')
    const remaining = failures.length - shown.length
    if (remaining > 0) {
      return `${details} …and ${remaining} more`
    }
    return details || 'Some notes could not be updated.'
  }

  function focusResultsHeading(): void {
    document.getElementById('notes-results-heading')?.focus()
  }

  function handleAssign(): void {
    if (assignDisabledReason || assignMutation.isPending) {
      return
    }
    const reviewer = reviewerOptions.find((option) => option.id === bulkReviewerId)
    if (!reviewer) {
      return
    }
    setBulkError(null)
    setResultAnnouncement(null)
    // Only currently visible selected rows — never mutate hidden/ghost IDs.
    const noteIds = selectedRows.map((row) => row.id)
    if (noteIds.length === 0) {
      return
    }
    void assignMutation
      .mutateAsync({
        noteIds,
        reviewerId: parseUserId(reviewer.id),
        reviewerDisplayName: reviewer.label,
        listQueryKey,
      })
      .then((result) => {
        dispatchSelection({ type: 'REMOVE', noteIds: result.successIds })
        setResultAnnouncement(summarizeResults(result.successIds.length, result.failedIds.length))
        if (result.failedIds.length > 0) {
          setBulkError(formatItemFailures(result.results))
        } else {
          focusResultsHeading()
        }
      })
      .catch((error: unknown) => {
        setBulkError(formatBulkError(error))
      })
  }

  function handleRegenerate(): void {
    if (regenerateDisabledReason || regenerateMutation.isPending) {
      return
    }
    setBulkError(null)
    setResultAnnouncement(null)
    const noteIds = selectedRows.filter((row) => row.status === 'FAILED').map((row) => row.id)
    if (noteIds.length === 0) {
      return
    }
    void regenerateMutation
      .mutateAsync({
        noteIds,
        listQueryKey,
      })
      .then((result) => {
        dispatchSelection({ type: 'REMOVE', noteIds: result.successIds })
        setResultAnnouncement(summarizeResults(result.successIds.length, result.failedIds.length))
        if (result.failedIds.length > 0) {
          setBulkError(formatItemFailures(result.results))
        } else {
          focusResultsHeading()
        }
      })
      .catch((error: unknown) => {
        setBulkError(formatBulkError(error))
      })
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

  const mutationPending = assignMutation.isPending || regenerateMutation.isPending

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

      {selectedCount > 0 ? (
        <BulkActionToolbar
          selectedCount={selectedCount}
          reviewerOptions={reviewerOptions}
          selectedReviewerId={bulkReviewerId}
          onReviewerChange={setBulkReviewerId}
          onAssign={handleAssign}
          onRegenerate={handleRegenerate}
          onClearSelection={handleClearSelection}
          isAssignPending={assignMutation.isPending}
          isRegeneratePending={regenerateMutation.isPending}
          assignDisabledReason={assignDisabledReason}
          regenerateDisabledReason={regenerateDisabledReason}
          resultAnnouncement={resultAnnouncement}
          errorMessage={bulkError}
        />
      ) : null}

      {/* Keep announcements reachable after successful rows are deselected and the toolbar unmounts. */}
      {selectedCount === 0 && resultAnnouncement ? (
        <p role="status" aria-live="polite" data-testid="bulk-result-announcement">
          {resultAnnouncement}
        </p>
      ) : null}
      {selectedCount === 0 && bulkError ? (
        <div className="bulk-action-toolbar__error" role="alert">
          <p>{bulkError}</p>
        </div>
      ) : null}

      <section className="notes-list-page__results" aria-labelledby="notes-results-heading">
        <div className="notes-list-page__results-header">
          <h2 id="notes-results-heading" tabIndex={-1}>
            Results
          </h2>
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
            selectedIds={selection.selectedIds}
            selectAllState={selectAllState}
            onToggleRow={(noteId) => {
              dispatchSelection({ type: 'TOGGLE', noteId })
            }}
            onToggleSelectAll={handleToggleSelectAll}
            pendingIds={pendingIds}
            selectionDisabled={mutationPending}
            listReturnTo={listReturnTo}
          />
        ) : null}
      </section>
    </div>
  )
}

function formatBulkError(error: unknown): string {
  if (isApiClientError(error)) {
    if (error.code === 'FORBIDDEN' || error.status === 403) {
      return `Permission denied: ${error.message}`
    }
    return error.message
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'The bulk action failed.'
}
