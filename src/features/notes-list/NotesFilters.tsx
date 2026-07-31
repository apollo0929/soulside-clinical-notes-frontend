import { NOTE_STATUSES, type NoteStatus } from '@/domain/statuses'
import type { NotesListFilters } from '@/features/notes-list/notes-list.types'
import { notesListFiltersAreDefault } from '@/features/notes-list/notes-list.types'
import {
  NOTES_LIST_SORT_FIELDS,
  type NotesListSortDirection,
  type NotesListSortField,
} from '@/services/api/notes-api'

export type NotesFiltersProps = {
  readonly filters: NotesListFilters
  /** Immediate search input value (may lead URL by debounce). */
  readonly searchInput: string
  readonly dateFromInput: string
  readonly dateToInput: string
  readonly onSearchInputChange: (value: string) => void
  readonly onStatusesChange: (statuses: readonly NoteStatus[]) => void
  readonly onReviewerChange: (value: string) => void
  readonly onPatientChange: (value: string) => void
  readonly onDateFromChange: (value: string) => void
  readonly onDateToChange: (value: string) => void
  readonly onSortFieldChange: (field: NotesListSortField) => void
  readonly onSortDirectionChange: (direction: NotesListSortDirection) => void
  readonly onClearFilters: () => void
  readonly reviewerOptions: readonly { id: string; label: string }[]
  readonly patientOptions: readonly { id: string; label: string }[]
}

function toggleStatus(
  current: readonly NoteStatus[],
  status: NoteStatus,
  checked: boolean,
): NoteStatus[] {
  if (checked) {
    if (current.includes(status)) {
      return [...current]
    }
    return [...current, status]
  }
  return current.filter((item) => item !== status)
}

export function NotesFilters({
  filters,
  searchInput,
  dateFromInput,
  dateToInput,
  onSearchInputChange,
  onStatusesChange,
  onReviewerChange,
  onPatientChange,
  onDateFromChange,
  onDateToChange,
  onSortFieldChange,
  onSortDirectionChange,
  onClearFilters,
  reviewerOptions,
  patientOptions,
}: NotesFiltersProps) {
  const clearDisabled =
    notesListFiltersAreDefault({
      ...filters,
      searchQuery: searchInput.trim(),
    }) &&
    dateFromInput === (filters.dateFrom ?? '') &&
    dateToInput === (filters.dateTo ?? '')

  return (
    <section className="notes-filters" aria-labelledby="notes-filters-heading">
      <h2 id="notes-filters-heading">Filters</h2>

      <fieldset className="notes-filters__statuses">
        <legend>Status</legend>
        <div className="notes-filters__status-grid" role="group" aria-label="Note status">
          {NOTE_STATUSES.map((status) => {
            const id = `notes-status-${status}`
            const checked = filters.statuses.includes(status)
            return (
              <label key={status} htmlFor={id} className="notes-filters__checkbox">
                <input
                  id={id}
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => {
                    onStatusesChange(toggleStatus(filters.statuses, status, event.target.checked))
                  }}
                />
                <span>{status.replaceAll('_', ' ')}</span>
              </label>
            )
          })}
        </div>
      </fieldset>

      <div className="notes-filters__grid">
        <label htmlFor="notes-reviewer">
          Assigned reviewer
          <select
            id="notes-reviewer"
            value={filters.assignedReviewerId ?? ''}
            onChange={(event) => {
              onReviewerChange(event.target.value)
            }}
          >
            <option value="">Any reviewer</option>
            {reviewerOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label htmlFor="notes-patient">
          Patient
          <select
            id="notes-patient"
            value={filters.patientId ?? ''}
            onChange={(event) => {
              onPatientChange(event.target.value)
            }}
          >
            <option value="">Any patient</option>
            {patientOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label htmlFor="notes-from">
          Updated from
          <input
            id="notes-from"
            type="text"
            inputMode="text"
            placeholder="2024-06-01T00:00:00.000Z"
            value={dateFromInput}
            onChange={(event) => {
              onDateFromChange(event.target.value)
            }}
            autoComplete="off"
          />
        </label>

        <label htmlFor="notes-to">
          Updated to
          <input
            id="notes-to"
            type="text"
            inputMode="text"
            placeholder="2024-12-31T23:59:59.999Z"
            value={dateToInput}
            onChange={(event) => {
              onDateToChange(event.target.value)
            }}
            autoComplete="off"
          />
        </label>

        <label htmlFor="notes-search">
          Search
          <input
            id="notes-search"
            type="search"
            value={searchInput}
            onChange={(event) => {
              onSearchInputChange(event.target.value)
            }}
            placeholder="Patient name or clinical text"
            autoComplete="off"
          />
        </label>

        <label htmlFor="notes-sort">
          Sort by
          <select
            id="notes-sort"
            value={filters.sortField}
            onChange={(event) => {
              onSortFieldChange(event.target.value as NotesListSortField)
            }}
          >
            {NOTES_LIST_SORT_FIELDS.map((field) => (
              <option key={field} value={field}>
                {field}
              </option>
            ))}
          </select>
        </label>

        <label htmlFor="notes-direction">
          Sort direction
          <select
            id="notes-direction"
            value={filters.sortDirection}
            onChange={(event) => {
              onSortDirectionChange(event.target.value as NotesListSortDirection)
            }}
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </label>
      </div>

      <div className="notes-filters__actions">
        <button type="button" onClick={onClearFilters} disabled={clearDisabled}>
          Clear filters
        </button>
      </div>
    </section>
  )
}
