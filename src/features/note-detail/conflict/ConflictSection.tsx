import type { SoapSectionKey } from '@/domain/models/soap'
import type {
  ConflictResolutionSession,
  SectionResolutionState,
} from '@/features/note-detail/conflict/conflict.types'
import { describeAutomaticDecision } from '@/features/note-detail/conflict/conflict-selectors'
import { ConflictDiff } from '@/features/note-detail/conflict/ConflictDiff'
import { SOAP_SECTION_LABELS } from '@/features/note-detail/editor/soap-editor.types'

export type ConflictSectionProps = {
  readonly section: SoapSectionKey
  readonly session: ConflictResolutionSession
  readonly resolution: SectionResolutionState
  readonly onChooseLocal: () => void
  readonly onChooseServer: () => void
  readonly onChooseManual: () => void
  readonly onUpdateManual: (value: string) => void
  readonly headingRef?: (element: HTMLHeadingElement | null) => void
}

export function ConflictSection({
  section,
  session,
  resolution,
  onChooseLocal,
  onChooseServer,
  onChooseManual,
  onUpdateManual,
  headingRef,
}: ConflictSectionProps) {
  const meta = session.sections[section]
  const label = SOAP_SECTION_LABELS[section]
  const headingId = `conflict-section-${section}`
  const isConflict = meta.conflictKind === 'CONFLICT'
  const choiceName = `conflict-choice-${section}`

  const selected =
    resolution.kind === 'EXPLICIT'
      ? resolution.choice
      : resolution.kind === 'UNRESOLVED'
        ? null
        : 'automatic'

  return (
    <section className="conflict-section" aria-labelledby={headingId}>
      <h3 id={headingId} ref={headingRef} tabIndex={-1} className="conflict-section__heading">
        {label}
        {isConflict ? (
          <span className="conflict-section__badge"> Needs choice</span>
        ) : (
          <span className="conflict-section__badge conflict-section__badge--auto">
            {' '}
            {describeAutomaticDecision(session, section)}
          </span>
        )}
      </h3>

      <ConflictDiff
        label="Ancestor → Local"
        baseLabel="Ancestor"
        compareLabel="Your draft"
        base={meta.ancestor}
        compare={meta.local}
      />
      <ConflictDiff
        label="Ancestor → Server"
        baseLabel="Ancestor"
        compareLabel="Server head"
        base={meta.ancestor}
        compare={meta.server}
      />

      {!isConflict ? (
        <p className="conflict-section__resolved" role="status">
          Resolved value:{' '}
          {resolution.kind === 'AUTOMATIC' ? (
            resolution.value === '' ? (
              <em>Empty section</em>
            ) : (
              resolution.value
            )
          ) : (
            '—'
          )}
        </p>
      ) : (
        <fieldset className="conflict-section__choices">
          <legend>How should {label} be resolved?</legend>
          <label className="conflict-section__choice">
            <input
              type="radio"
              name={choiceName}
              checked={selected === 'KEEP_LOCAL'}
              onChange={onChooseLocal}
            />
            Keep mine
          </label>
          <label className="conflict-section__choice">
            <input
              type="radio"
              name={choiceName}
              checked={selected === 'USE_SERVER'}
              onChange={onChooseServer}
            />
            Use server
          </label>
          <label className="conflict-section__choice">
            <input
              type="radio"
              name={choiceName}
              checked={selected === 'MANUAL'}
              onChange={onChooseManual}
            />
            Manual merge
          </label>
          {resolution.kind === 'EXPLICIT' && resolution.choice === 'MANUAL' ? (
            <label className="conflict-section__manual">
              Manual {label} text
              <textarea
                value={resolution.value}
                onChange={(event) => {
                  onUpdateManual(event.target.value)
                }}
                rows={4}
              />
            </label>
          ) : null}
          {resolution.kind === 'EXPLICIT' ? (
            <p className="conflict-section__resolved" role="status">
              Current choice: {resolution.value === '' ? <em>Empty section</em> : resolution.value}
            </p>
          ) : (
            <p className="conflict-section__unresolved" role="status">
              Unresolved — choose Keep mine, Use server, or Manual merge.
            </p>
          )}
        </fieldset>
      )}
    </section>
  )
}
