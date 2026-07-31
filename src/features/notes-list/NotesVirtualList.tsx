import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useRef } from 'react'

import type { NoteSummary } from '@/domain/models/note-summary'
import type { NotesListSortField } from '@/services/api/notes-api'

const ROW_HEIGHT = 44
const OVERSCAN = 8

export type NotesVirtualListProps = {
  readonly rows: readonly NoteSummary[]
  readonly sortField: NotesListSortField
  readonly sortDirection: 'asc' | 'desc'
  readonly onSortFieldChange: (field: NotesListSortField) => void
  readonly hasNextPage: boolean
  readonly isFetchingNextPage: boolean
  readonly onLoadMore: () => void
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
}: NotesVirtualListProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const onLoadMoreRef = useRef(onLoadMore)

  useEffect(() => {
    onLoadMoreRef.current = onLoadMore
  }, [onLoadMore])

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
  })

  const virtualItems = virtualizer.getVirtualItems()
  const lastVirtualIndex = virtualItems[virtualItems.length - 1]?.index

  // Depend on the scalar last index — not the virtualItems array identity —
  // and call through a ref so unstable parent callbacks cannot re-fire fetches.
  useEffect(() => {
    if (lastVirtualIndex === undefined) {
      return
    }
    if (lastVirtualIndex >= rows.length - 5 && hasNextPage && !isFetchingNextPage) {
      onLoadMoreRef.current()
    }
  }, [lastVirtualIndex, rows.length, hasNextPage, isFetchingNextPage])

  return (
    <div className="notes-virtual">
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
              return (
                <div
                  key={note.id}
                  role="row"
                  aria-rowindex={virtualRow.index + 2}
                  className="notes-virtual__row"
                  data-note-id={note.id}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <div role="cell" className="notes-virtual__cell">
                    <span className="notes-virtual__patient">{note.patientDisplayName}</span>
                    <span className="notes-virtual__note-id">{note.id}</span>
                  </div>
                  <div role="cell" className="notes-virtual__cell">
                    <span className={`notes-status notes-status--${note.status.toLowerCase()}`}>
                      {note.status.replaceAll('_', ' ')}
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
