import { useEffect, useId, useRef } from 'react'

import { SOAP_SECTION_KEYS } from '@/domain/models/soap'
import { ConflictSection } from '@/features/note-detail/conflict/ConflictSection'
import { ConflictStatus } from '@/features/note-detail/conflict/ConflictStatus'
import type { UseConflictResolutionResult } from '@/features/note-detail/conflict/use-conflict-resolution'

export type ConflictResolverProps = {
  readonly conflictResolution: UseConflictResolutionResult
  readonly onContinueReviewing: () => void
}

export function ConflictResolver({
  conflictResolution,
  onContinueReviewing,
}: ConflictResolverProps) {
  const headingId = useId()
  const headingRef = useRef<HTMLHeadingElement | null>(null)
  const sectionHeadingRefs = useRef<
    Partial<Record<(typeof SOAP_SECTION_KEYS)[number], HTMLHeadingElement | null>>
  >({})
  const focusedSessionKey = useRef<string | null>(null)

  const {
    hydration,
    resolution,
    dispatch,
    unresolvedCount,
    canSubmit,
    saveStatus,
    submit,
    retrySave,
    session,
  } = conflictResolution

  const sessionFocusKey = session
    ? `${session.serverHeadVersionId}:${session.commonAncestorVersionId}:${session.localBaseVersionId}`
    : null

  useEffect(() => {
    if (!sessionFocusKey || hydration.kind !== 'ready') {
      return
    }
    if (focusedSessionKey.current === sessionFocusKey) {
      return
    }
    focusedSessionKey.current = sessionFocusKey
    headingRef.current?.focus()
  }, [hydration.kind, sessionFocusKey])

  const disabledReason = !session
    ? hydration.kind === 'error'
      ? 'Conflict versions could not be loaded.'
      : 'Conflict versions are still loading.'
    : unresolvedCount > 0
      ? `${unresolvedCount} conflicting section${unresolvedCount === 1 ? '' : 's'} still need a choice.`
      : saveStatus.kind === 'saving'
        ? 'A resolve save is already in progress.'
        : null

  return (
    <section className="conflict-resolver" aria-labelledby={headingId}>
      <h2 id={headingId} ref={headingRef} tabIndex={-1} className="conflict-resolver__heading">
        Version conflict — resolve before continuing
      </h2>
      <p>
        Another version of this note was saved while you were editing. Your local edits have been
        preserved and are shown below. The ordinary editor is frozen until you resolve the conflict.
      </p>

      {session ? (
        <dl className="conflict-resolver__meta">
          <div>
            <dt>Server head revision</dt>
            <dd>{session.serverHeadRevision}</dd>
          </div>
          <div>
            <dt>Common ancestor revision</dt>
            <dd>{session.commonAncestorRevision}</dd>
          </div>
        </dl>
      ) : null}

      {hydration.kind === 'loading' ? (
        <p role="status">Loading server head and common ancestor…</p>
      ) : null}

      {hydration.kind === 'error' ? (
        <div className="conflict-resolver__error" role="alert">
          <p>{hydration.message}</p>
          {hydration.retryable ? (
            <button type="button" onClick={hydration.retry}>
              Retry loading versions
            </button>
          ) : null}
        </div>
      ) : null}

      {session ? (
        <ConflictStatus unresolvedCount={unresolvedCount} saveStatus={saveStatus} />
      ) : null}
      {session && resolution
        ? SOAP_SECTION_KEYS.map((section) => (
            <ConflictSection
              key={section}
              section={section}
              session={session}
              resolution={resolution.sections[section]}
              headingRef={(element) => {
                sectionHeadingRefs.current[section] = element
              }}
              onChooseLocal={() => {
                dispatch({ type: 'CHOOSE_LOCAL', section })
              }}
              onChooseServer={() => {
                dispatch({ type: 'CHOOSE_SERVER', section })
              }}
              onChooseManual={() => {
                dispatch({ type: 'CHOOSE_MANUAL', section })
              }}
              onUpdateManual={(value) => {
                dispatch({ type: 'UPDATE_MANUAL_VALUE', section, value })
              }}
            />
          ))
        : null}

      <div className="conflict-resolver__actions">
        <button
          type="button"
          className="conflict-resolver__submit"
          disabled={!canSubmit}
          aria-disabled={!canSubmit}
          aria-describedby={disabledReason ? 'conflict-resolve-disabled-reason' : undefined}
          onClick={submit}
        >
          {saveStatus.kind === 'saving' ? 'Saving…' : 'Resolve and save'}
        </button>
        {disabledReason ? (
          <p id="conflict-resolve-disabled-reason" className="conflict-resolver__disabled-reason">
            {disabledReason}
          </p>
        ) : null}
        {saveStatus.kind === 'error' && saveStatus.retryable ? (
          <button type="button" onClick={retrySave}>
            Retry save
          </button>
        ) : null}
        <button type="button" onClick={onContinueReviewing}>
          Continue reviewing conflict
        </button>
      </div>
    </section>
  )
}
