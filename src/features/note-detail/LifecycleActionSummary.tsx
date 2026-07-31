import type { LifecycleActionDescriptor } from '@/features/note-detail/note-detail.types'

export type LifecycleActionSummaryProps = {
  readonly descriptors: readonly LifecycleActionDescriptor[]
  readonly isLocked: boolean
}

/**
 * Step 7A: present lifecycle availability as status information only.
 * No enabled controls that would imply mutation execution.
 */
export function LifecycleActionSummary({ descriptors, isLocked }: LifecycleActionSummaryProps) {
  return (
    <section className="lifecycle-actions" aria-labelledby="lifecycle-actions-heading">
      <h2 id="lifecycle-actions-heading">Available actions</h2>
      {isLocked ? (
        <p className="lifecycle-actions__locked" role="status">
          This note is locked. Content is read-only. Action availability is derived from the
          lifecycle machine (no hard-coded UI shortcuts).
        </p>
      ) : null}
      <p className="lifecycle-actions__preview">
        Action execution will be connected in a later step. The list below is a read-only preview of
        lifecycle and authorization outcomes for the current actor.
      </p>
      <ul className="lifecycle-actions__list">
        {descriptors.map((descriptor) => {
          const reasonId = `action-reason-${descriptor.action}`
          return (
            <li key={descriptor.action} className="lifecycle-actions__item">
              <div className="lifecycle-actions__row">
                <span className="lifecycle-actions__label">{descriptor.label}</span>
                <span
                  className={
                    descriptor.allowed
                      ? 'lifecycle-actions__state lifecycle-actions__state--allowed'
                      : 'lifecycle-actions__state lifecycle-actions__state--denied'
                  }
                >
                  {descriptor.allowed ? 'Available (preview only)' : 'Not available'}
                </span>
              </div>
              {!descriptor.allowed && descriptor.denialReason ? (
                <p id={reasonId} className="lifecycle-actions__reason">
                  {descriptor.denialReason}
                </p>
              ) : null}
              {descriptor.allowed ? (
                <p className="lifecycle-actions__reason">
                  Allowed by lifecycle and authorization; not executable in this step.
                </p>
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
