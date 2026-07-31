import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'

import type { NoteId } from '@/domain/ids'
import type { NoteSummary } from '@/domain/models/note-summary'
import { NOTES_VIRTUAL_ROW_HEIGHT } from '@/features/notes-list/notes-virtual-row'
import type { NotesListSortField } from '@/services/api/notes-api'

const OVERSCAN = 8

export type NotesVirtualListProps = {
  readonly rows: readonly NoteSummary[]
  readonly sortField: NotesListSortField
  readonly sortDirection: 'asc' | 'desc'
  readonly onSortFieldChange: (field: NotesListSortField) => void
  readonly hasNextPage: boolean
  readonly isFetchingNextPage: boolean
  readonly onLoadMore: () => void
  readonly selectedIds: ReadonlySet<NoteId>
  readonly selectAllState: 'checked' | 'unchecked' | 'indeterminate'
  readonly onToggleRow: (noteId: NoteId) => void
  readonly onToggleSelectAll: () => void
  readonly pendingIds: ReadonlySet<NoteId>
  readonly selectionDisabled: boolean
  /** Path + search for returning from note detail without open redirects. */
  readonly listReturnTo: string
}

function formatTimestamp(value: string): string {
  return value.replace('T', ' ').replace(/\.\d{3}Z$/, 'Z')
}

function ariaSortFor(
  column: NotesListSortField,
  sortField: NotesListSortField,
  sortDirection: 'asc' | 'desc',
): 'ascending' | 'descending' | 'none' {
  if (column !== sortField) {
    return 'none'
  }
  return sortDirection === 'asc' ? 'ascending' : 'descending'
}

export function NotesVirtualList({
  rows,
  sortField,
  sortDirection,
  onSortFieldChange,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  selectedIds,
  selectAllState,
  onToggleRow,
  onToggleSelectAll,
  pendingIds,
  selectionDisabled,
  listReturnTo,
}: NotesVirtualListProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const onLoadMoreRef = useRef(onLoadMore)
  const selectAllRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    onLoadMoreRef.current = onLoadMore
  }, [onLoadMore])

  useEffect(() => {
    const node = selectAllRef.current
    if (!node) {
      return
    }
    node.indeterminate = selectAllState === 'indeterminate'
  }, [selectAllState])

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => NOTES_VIRTUAL_ROW_HEIGHT,
    overscan: OVERSCAN,
  })

  const virtualItems = virtualizer.getVirtualItems()
  const lastVirtualIndex = virtualItems[virtualItems.length - 1]?.index

  useEffect(() => {
    if (lastVirtualIndex === undefined) {
      return
    }
    if (lastVirtualIndex >= rows.length - 5 && hasNextPage && !isFetchingNextPage) {
      onLoadMoreRef.current()
    }
  }, [lastVirtualIndex, rows.length, hasNextPage, isFetchingNextPage])

  return (
    <div
      className="notes-virtual"
      style={{ ['--notes-row-height' as string]: `${NOTES_VIRTUAL_ROW_HEIGHT}px` }}
    >
      <div
        ref={parentRef}
        className="notes-virtual__scroller"
        tabIndex={0}
        role="region"
        aria-label="Notes table"
      >
        <div role="table" aria-rowcount={rows.length + 1} className="notes-virtual__table">
          <div role="rowgroup" className="notes-virtual__header">
            <div
              role="row"
              aria-rowindex={1}
              className="notes-virtual__row notes-virtual__row--header"
            >
              <div role="columnheader" className="notes-virtual__cell notes-virtual__cell--check">
                <label htmlFor="notes-select-all" className="notes-virtual__check-label">
                  <input
                    ref={selectAllRef}
                    id="notes-select-all"
                    type="checkbox"
                    checked={selectAllState === 'checked'}
                    onChange={onToggleSelectAll}
                    disabled={selectionDisabled || rows.length === 0}
                    aria-label="Select all visible notes"
                    aria-checked={
                      selectAllState === 'indeterminate' ? 'mixed' : selectAllState === 'checked'
                    }
                  />
                  <span className="visually-hidden">Select all visible notes</span>
                </label>
              </div>
              <SortableHeader
                label="Patient"
                field="patientDisplayName"
                sortField={sortField}
                sortDirection={sortDirection}
                onSortFieldChange={onSortFieldChange}
              />
              <SortableHeader
                label="Status"
                field="status"
                sortField={sortField}
                sortDirection={sortDirection}
                onSortFieldChange={onSortFieldChange}
              />
              <div role="columnheader" className="notes-virtual__cell">
                Revision
              </div>
              <div role="columnheader" className="notes-virtual__cell">
                Reviewer
              </div>
              <SortableHeader
                label="Created"
                field="createdAt"
                sortField={sortField}
                sortDirection={sortDirection}
                onSortFieldChange={onSortFieldChange}
              />
              <SortableHeader
                label="Updated"
                field="updatedAt"
                sortField={sortField}
                sortDirection={sortDirection}
                onSortFieldChange={onSortFieldChange}
              />
            </div>
          </div>

          <div
            role="rowgroup"
            className="notes-virtual__body"
            style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}
          >
            {virtualItems.map((virtualRow) => {
              const note = rows[virtualRow.index]
              if (!note) {
                return null
              }
              const checkboxId = `note-select-${note.id}`
              const isPending = pendingIds.has(note.id)
              return (
                <div
                  key={note.id}
                  role="row"
                  aria-rowindex={virtualRow.index + 2}
                  className="notes-virtual__row"
                  data-note-id={note.id}
                  aria-selected={selectedIds.has(note.id)}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <div role="cell" className="notes-virtual__cell notes-virtual__cell--check">
                    <label htmlFor={checkboxId} className="notes-virtual__check-label">
                      <input
                        id={checkboxId}
                        type="checkbox"
                        checked={selectedIds.has(note.id)}
                        onChange={() => {
                          onToggleRow(note.id)
                        }}
                        disabled={selectionDisabled || isPending}
                        aria-label={`Select note for ${note.patientDisplayName} (${note.id})`}
                      />
                    </label>
                  </div>
                  <div role="cell" className="notes-virtual__cell notes-virtual__cell--patient">
                    <Link
                      to={`/notes/${note.id}`}
                      state={{ fromList: listReturnTo }}
                      className="notes-virtual__patient-link"
                    >
                      <span className="notes-virtual__patient">{note.patientDisplayName}</span>
                      <span className="visually-hidden"> Open note {note.id}</span>
                    </Link>
                  </div>
                  <div role="cell" className="notes-virtual__cell">
                    <span className={`notes-status notes-status--${note.status.toLowerCase()}`}>
                      {note.status.replaceAll('_', ' ')}
                      {isPending ? ' (Updating)' : null}
                    </span>
                  </div>
                  <div role="cell" className="notes-virtual__cell">
                    {note.currentRevision}
                  </div>
                  <div role="cell" className="notes-virtual__cell">
                    {note.assignedReviewer?.displayName ?? 'Unassigned'}
                  </div>
                  <div role="cell" className="notes-virtual__cell">
                    <time dateTime={note.createdAt}>{formatTimestamp(note.createdAt)}</time>
                  </div>
                  <div role="cell" className="notes-virtual__cell">
                    <time dateTime={note.updatedAt}>{formatTimestamp(note.updatedAt)}</time>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="notes-virtual__footer">
        {isFetchingNextPage ? (
          <p role="status" aria-live="polite">
            Loading more notes…
          </p>
        ) : null}
        {hasNextPage ? (
          <button
            type="button"
            onClick={onLoadMore}
            disabled={isFetchingNextPage}
            aria-label="Load more notes"
          >
            Load more
          </button>
        ) : null}
      </div>
    </div>
  )
}

function SortableHeader({
  label,
  field,
  sortField,
  sortDirection,
  onSortFieldChange,
}: {
  label: string
  field: NotesListSortField
  sortField: NotesListSortField
  sortDirection: 'asc' | 'desc'
  onSortFieldChange: (field: NotesListSortField) => void
}) {
  const ariaSort = ariaSortFor(field, sortField, sortDirection)
  return (
    <div role="columnheader" aria-sort={ariaSort} className="notes-virtual__cell">
      <button
        type="button"
        className="notes-virtual__sort"
        onClick={() => {
          onSortFieldChange(field)
        }}
      >
        {label}
        {ariaSort !== 'none' ? (
          <span className="visually-hidden">
            {ariaSort === 'ascending' ? ', sorted ascending' : ', sorted descending'}
          </span>
        ) : null}
      </button>
    </div>
  )
}
