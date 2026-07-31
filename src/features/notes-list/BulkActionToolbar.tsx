import type { NoteId, UserId } from '@/domain/ids'

export type BulkActionToolbarProps = {
  readonly selectedCount: number
  readonly reviewerOptions: readonly { id: string; label: string }[]
  readonly selectedReviewerId: string
  readonly onReviewerChange: (value: string) => void
  readonly onAssign: () => void
  readonly onRegenerate: () => void
  readonly onClearSelection: () => void
  readonly isAssignPending: boolean
  readonly isRegeneratePending: boolean
  readonly assignDisabledReason: string | null
  readonly regenerateDisabledReason: string | null
  readonly resultAnnouncement: string | null
  readonly errorMessage: string | null
}

export function BulkActionToolbar({
  selectedCount,
  reviewerOptions,
  selectedReviewerId,
  onReviewerChange,
  onAssign,
  onRegenerate,
  onClearSelection,
  isAssignPending,
  isRegeneratePending,
  assignDisabledReason,
  regenerateDisabledReason,
  resultAnnouncement,
  errorMessage,
}: BulkActionToolbarProps) {
  const pending = isAssignPending || isRegeneratePending
  const assignDisabled = pending || Boolean(assignDisabledReason)
  const regenerateDisabled = pending || Boolean(regenerateDisabledReason)

  return (
    <section
      className="bulk-action-toolbar"
      aria-labelledby="bulk-toolbar-heading"
      data-testid="bulk-action-toolbar"
    >
      <div className="bulk-action-toolbar__header">
        <h2 id="bulk-toolbar-heading">Bulk actions</h2>
        <p className="bulk-action-toolbar__count" aria-live="polite" role="status">
          {selectedCount} {selectedCount === 1 ? 'note' : 'notes'} selected
        </p>
      </div>

      <div className="bulk-action-toolbar__controls">
        <label htmlFor="bulk-reviewer">
          Assign to reviewer
          <select
            id="bulk-reviewer"
            value={selectedReviewerId}
            onChange={(event) => {
              onReviewerChange(event.target.value)
            }}
            disabled={pending}
          >
            <option value="">Select a reviewer</option>
            {reviewerOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={onAssign}
          disabled={assignDisabled}
          aria-disabled={assignDisabled}
          title={assignDisabledReason ?? undefined}
          aria-describedby={assignDisabledReason ? 'bulk-assign-reason' : undefined}
        >
          {isAssignPending ? 'Assigning…' : 'Assign reviewer'}
        </button>
        {assignDisabledReason ? (
          <span id="bulk-assign-reason" className="visually-hidden">
            {assignDisabledReason}
          </span>
        ) : null}

        <button
          type="button"
          onClick={onRegenerate}
          disabled={regenerateDisabled}
          aria-disabled={regenerateDisabled}
          title={regenerateDisabledReason ?? undefined}
          aria-describedby={regenerateDisabledReason ? 'bulk-regenerate-reason' : undefined}
        >
          {isRegeneratePending ? 'Requesting regeneration…' : 'Request regeneration'}
        </button>
        {regenerateDisabledReason ? (
          <span id="bulk-regenerate-reason" className="visually-hidden">
            {regenerateDisabledReason}
          </span>
        ) : null}

        <button type="button" onClick={onClearSelection} disabled={pending}>
          Clear selection
        </button>
      </div>

      {pending ? (
        <p role="status" aria-live="polite">
          Updating selected notes…
        </p>
      ) : null}

      {resultAnnouncement ? (
        <p role="status" aria-live="polite" data-testid="bulk-result-announcement">
          {resultAnnouncement}
        </p>
      ) : null}

      {errorMessage ? (
        <div className="bulk-action-toolbar__error" role="alert">
          <p>{errorMessage}</p>
        </div>
      ) : null}
    </section>
  )
}

export type { NoteId, UserId }
