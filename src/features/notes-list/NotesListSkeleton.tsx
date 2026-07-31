export function NotesListSkeleton() {
  return (
    <div
      className="notes-list-skeleton"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading notes"
    >
      <span className="visually-hidden">Loading notes…</span>
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="notes-list-skeleton__row" aria-hidden="true">
          <div className="notes-list-skeleton__cell" />
          <div className="notes-list-skeleton__cell" />
          <div className="notes-list-skeleton__cell" />
          <div className="notes-list-skeleton__cell" />
          <div className="notes-list-skeleton__cell" />
          <div className="notes-list-skeleton__cell" />
        </div>
      ))}
    </div>
  )
}
