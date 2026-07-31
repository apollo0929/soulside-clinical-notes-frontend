import type { SoapSectionKey } from './soap-editor.types'
import { SOAP_SECTION_LABELS } from './soap-editor.types'

export type SoapEditorSectionProps = {
  readonly section: SoapSectionKey
  readonly value: string
  readonly dirty: boolean
  readonly onChange: (value: string) => void
  readonly onReset: () => void
  readonly autoFocus?: boolean
}

export function SoapEditorSection({
  section,
  value,
  dirty,
  onChange,
  onReset,
  autoFocus = false,
}: SoapEditorSectionProps) {
  const label = SOAP_SECTION_LABELS[section]
  const fieldId = `soap-editor-${section}`
  const statusId = `${fieldId}-status`
  const hintId = `${fieldId}-hint`

  return (
    <div className="soap-editor__section">
      <div className="soap-editor__section-header">
        <label htmlFor={fieldId} className="soap-editor__label">
          {label}
        </label>
        <span id={statusId} className="soap-editor__section-status">
          {dirty ? 'Modified' : 'Saved'}
        </span>
        <button
          type="button"
          className="soap-editor__reset-section"
          disabled={!dirty}
          onClick={onReset}
          aria-label={`Reset ${label} to saved content`}
        >
          Reset {label}
        </button>
      </div>
      <p id={hintId} className="visually-hidden">
        Edit the {label} section. Whitespace is significant for unsaved-change tracking.
      </p>
      <textarea
        id={fieldId}
        name={section}
        className="soap-editor__textarea"
        value={value}
        onChange={(event) => {
          onChange(event.target.value)
        }}
        rows={6}
        autoComplete="off"
        spellCheck
        aria-describedby={`${statusId} ${hintId}`}
        autoFocus={autoFocus}
      />
    </div>
  )
}
