export type NotesListEmptyStateProps = {
  readonly variant: 'empty' | 'no-results'
  readonly onClearFilters?: () => void
}

export function NotesListEmptyState({ variant, onClearFilters }: NotesListEmptyStateProps) {
  if (variant === 'empty') {
    return (
      <div className="notes-list-empty" role="status">
        <p>No notes are available.</p>
      </div>
    )
  }

  return (
    <div className="notes-list-empty" role="status">
      <p>No notes match the current filters.</p>
      {onClearFilters ? (
        <button type="button" onClick={onClearFilters}>
          Clear filters
        </button>
      ) : null}
    </div>
  )
}
