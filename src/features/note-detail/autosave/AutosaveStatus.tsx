import type { AutosaveStatus } from './autosave.types'
import { autosaveStatusAriaLive, autosaveStatusLabel } from './autosave-status'

export type AutosaveStatusBannerProps = {
  readonly status: AutosaveStatus
  readonly onRetry: () => void
}

export function AutosaveStatusBanner({ status, onRetry }: AutosaveStatusBannerProps) {
  const label = autosaveStatusLabel(status)
  const showRetry = status.kind === 'ERROR' && status.retryable
  const isConflict = status.kind === 'CONFLICT'

  return (
    <div className="autosave-status" data-testid="autosave-status">
      <p
        className="autosave-status__label"
        aria-live={autosaveStatusAriaLive(status)}
        role="status"
        data-testid="soap-editor-save-label"
      >
        {label}
      </p>
      {isConflict ? (
        <p className="autosave-status__conflict-action" role="status">
          Conflict resolution required
        </p>
      ) : null}
      {showRetry ? (
        <button
          type="button"
          className="autosave-status__retry"
          onClick={onRetry}
          aria-label="Retry save"
        >
          Retry save
        </button>
      ) : null}
    </div>
  )
}
