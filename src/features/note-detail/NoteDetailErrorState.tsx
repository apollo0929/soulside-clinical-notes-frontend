import { Link } from 'react-router-dom'

export type NoteDetailErrorKind = 'forbidden' | 'not-found' | 'invalid-route' | 'generic'

export type NoteDetailErrorStateProps = {
  readonly kind: NoteDetailErrorKind
  readonly message: string
  readonly onRetry?: () => void
  readonly backHref: string
}

export function NoteDetailErrorState({
  kind,
  message,
  onRetry,
  backHref,
}: NoteDetailErrorStateProps) {
  const title =
    kind === 'forbidden'
      ? 'Permission denied'
      : kind === 'not-found'
        ? 'Note not found'
        : kind === 'invalid-route'
          ? 'Invalid note link'
          : 'Unable to load note'

  return (
    <div className="note-detail-error" role="alert">
      <h1 id="note-detail-heading">{title}</h1>
      <p>{message}</p>
      {kind === 'generic' && onRetry ? (
        <button type="button" onClick={onRetry}>
          Retry
        </button>
      ) : null}
      <p>
        <Link to={backHref}>Back to notes</Link>
      </p>
    </div>
  )
}
