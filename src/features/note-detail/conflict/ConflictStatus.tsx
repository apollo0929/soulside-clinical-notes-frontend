import type { ConflictSaveStatus } from '@/features/note-detail/conflict/use-conflict-resolution'

export type ConflictStatusProps = {
  readonly unresolvedCount: number
  readonly saveStatus: ConflictSaveStatus
  readonly hydrationMessage?: string
}

export function ConflictStatus({
  unresolvedCount,
  saveStatus,
  hydrationMessage,
}: ConflictStatusProps) {
  let saveAnnouncement = ''
  if (saveStatus.kind === 'saving') {
    saveAnnouncement = 'Saving resolved version…'
  } else if (saveStatus.kind === 'success') {
    saveAnnouncement = 'Conflict resolved and saved.'
  } else if (saveStatus.kind === 'error') {
    saveAnnouncement = `Save failed: ${saveStatus.message}`
  }

  return (
    <div className="conflict-status">
      <p className="conflict-status__count" role="status">
        {unresolvedCount === 0
          ? 'All conflicting sections resolved.'
          : `${unresolvedCount} conflicting section${unresolvedCount === 1 ? '' : 's'} still need a choice.`}
      </p>
      {hydrationMessage ? (
        <p className="conflict-status__hydration" role="alert">
          {hydrationMessage}
        </p>
      ) : null}
      <p className="visually-hidden" aria-live="polite">
        {saveAnnouncement}
      </p>
      {saveStatus.kind === 'saving' ? (
        <p className="conflict-status__saving" role="status">
          Saving resolved version…
        </p>
      ) : null}
      {saveStatus.kind === 'error' ? (
        <p className="conflict-status__error" role="alert">
          Save failed: {saveStatus.message}
        </p>
      ) : null}
      {saveStatus.kind === 'success' ? (
        <p className="conflict-status__success" role="status">
          Conflict resolved and saved.
        </p>
      ) : null}
    </div>
  )
}
