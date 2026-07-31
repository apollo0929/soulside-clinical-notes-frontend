export function NoteDetailSkeleton() {
  return (
    <div className="note-detail-skeleton" aria-busy="true">
      <p id="note-detail-heading" className="visually-hidden" role="status">
        Loading note detail…
      </p>
      <div className="note-detail-skeleton__header" />
      <div className="note-detail-skeleton__layout">
        <div className="note-detail-skeleton__main">
          <div className="note-detail-skeleton__block" />
          <div className="note-detail-skeleton__block" />
          <div className="note-detail-skeleton__block" />
          <div className="note-detail-skeleton__block" />
        </div>
        <div className="note-detail-skeleton__side">
          <div className="note-detail-skeleton__block" />
          <div className="note-detail-skeleton__block" />
        </div>
      </div>
    </div>
  )
}
