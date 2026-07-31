export type SoapEditorStatusProps = {
  readonly saveLabel: string
  readonly baseRevision: number
  readonly baseVersionId: string
  readonly newerVersionWarning: boolean
}

export function SoapEditorStatus({
  saveLabel,
  baseRevision,
  baseVersionId,
  newerVersionWarning,
}: SoapEditorStatusProps) {
  return (
    <div className="soap-editor__status">
      <p className="soap-editor__save-label" data-testid="soap-editor-save-label">
        {saveLabel}
      </p>
      <p className="soap-editor__base-version">
        Editing base revision {baseRevision} ({baseVersionId})
      </p>
      {newerVersionWarning ? (
        <p className="soap-editor__newer-warning" role="status">
          A newer version of this note is available. Your local edits have been preserved.
        </p>
      ) : null}
    </div>
  )
}
