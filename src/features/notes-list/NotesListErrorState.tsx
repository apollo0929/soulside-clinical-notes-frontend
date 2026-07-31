export type NotesListErrorStateProps = {
  readonly message: string
  readonly onRetry: () => void
}

export function NotesListErrorState({ message, onRetry }: NotesListErrorStateProps) {
  return (
    <div className="notes-list-error" role="alert">
      <p>{message}</p>
      <button type="button" onClick={onRetry}>
        Retry
      </button>
    </div>
  )
}
