import { type ReactNode, type RefObject, useEffect, useId, useRef, useState } from 'react'

import { SOAP_SECTION_KEYS, type SoapEditorState, type SoapSectionKey } from './soap-editor.types'
import { SoapEditorSection } from './SoapEditorSection'
import { SoapEditorStatus } from './SoapEditorStatus'
import { UnsavedChangesDialog } from './UnsavedChangesDialog'
import { useUnsavedNavigationGuard } from './use-unsaved-navigation-guard'

export type SoapEditorProps = {
  readonly state: SoapEditorState
  readonly saveLabel: string
  readonly baseRevision: number
  readonly newerVersionWarning: boolean
  readonly guardActive?: boolean
  readonly frozen?: boolean
  readonly autosaveSlot?: ReactNode
  readonly conflictSlot?: ReactNode
  readonly onUpdateSection: (section: SoapSectionKey, value: string) => void
  readonly onResetSection: (section: SoapSectionKey) => void
  readonly onDiscardAndExit: () => void
  readonly onCancelClean: () => void
  readonly editButtonRef: RefObject<HTMLButtonElement | null>
}

export function SoapEditor({
  state,
  saveLabel,
  baseRevision,
  newerVersionWarning,
  guardActive = false,
  frozen = false,
  autosaveSlot = null,
  conflictSlot = null,
  onUpdateSection,
  onResetSection,
  onDiscardAndExit,
  onCancelClean,
  editButtonRef,
}: SoapEditorProps) {
  const headingId = useId()
  const [discardOpen, setDiscardOpen] = useState(false)
  const dirty = state.dirtySections.size > 0
  // Conflict navigation protection takes precedence: freeze also blocks discard dialogs.
  const { blocker, confirmStay, confirmLeave } = useUnsavedNavigationGuard(
    dirty || guardActive || frozen,
  )
  const focusedOnOpen = useRef(false)
  const navBlocked = blocker.state === 'blocked'
  // Single confirmation surface: navigation block supersedes in-editor discard.
  // While frozen (conflict), suppress the editor discard dialog entirely.
  const showDiscardDialog = discardOpen && !navBlocked && !frozen
  const dialogOpen = navBlocked || showDiscardDialog
  const dialogMode = navBlocked ? 'navigate' : 'discard'

  useEffect(() => {
    if (focusedOnOpen.current) {
      return
    }
    focusedOnOpen.current = true
    const subjective = document.getElementById('soap-editor-subjective')
    if (subjective instanceof HTMLTextAreaElement) {
      subjective.focus()
    }
  }, [])

  const focusEditButton = () => {
    queueMicrotask(() => {
      editButtonRef.current?.focus()
    })
  }

  const requestExit = () => {
    if (!dirty) {
      onCancelClean()
      focusEditButton()
      return
    }
    setDiscardOpen(true)
  }

  const confirmDiscard = () => {
    setDiscardOpen(false)
    onDiscardAndExit()
    focusEditButton()
  }

  const handleNavLeave = () => {
    setDiscardOpen(false)
    onDiscardAndExit()
    confirmLeave()
  }

  return (
    <section className="soap-editor" aria-labelledby={headingId} data-testid="soap-editor">
      <h2 id={headingId} tabIndex={-1}>
        Edit SOAP content
      </h2>

      <SoapEditorStatus
        saveLabel={autosaveSlot ? '' : saveLabel}
        baseRevision={baseRevision}
        baseVersionId={String(state.baseVersionId)}
        newerVersionWarning={newerVersionWarning}
      />
      {autosaveSlot}
      {conflictSlot}

      {frozen ? (
        <p className="soap-editor__frozen-notice" role="status">
          Editing is paused while you resolve the version conflict below.
        </p>
      ) : null}

      <form
        className="soap-editor__form"
        onSubmit={(event) => {
          event.preventDefault()
        }}
      >
        {SOAP_SECTION_KEYS.map((section) => (
          <SoapEditorSection
            key={section}
            section={section}
            value={state.draftContent[section]}
            dirty={state.dirtySections.has(section)}
            readOnly={frozen}
            onChange={(value) => {
              if (!frozen) {
                onUpdateSection(section, value)
              }
            }}
            onReset={() => {
              if (!frozen) {
                onResetSection(section)
              }
            }}
          />
        ))}

        <div className="soap-editor__toolbar">
          <button type="button" onClick={requestExit} disabled={frozen}>
            {dirty ? 'Discard changes' : 'Cancel'}
          </button>
        </div>
      </form>

      <UnsavedChangesDialog
        open={dialogOpen}
        title={dialogMode === 'navigate' ? 'Leave without saving?' : 'Discard unsaved changes?'}
        description={
          dialogMode === 'navigate'
            ? frozen
              ? 'You have an unresolved version conflict with local edits. Leaving this page will discard those changes.'
              : 'You have unsaved SOAP edits. Leaving this page will discard those changes.'
            : 'Your unsaved SOAP edits will be discarded. This cannot be undone.'
        }
        stayLabel="Stay and continue editing"
        leaveLabel={dialogMode === 'navigate' ? 'Discard and leave' : 'Discard and exit edit mode'}
        onStay={() => {
          if (dialogMode === 'navigate') {
            confirmStay()
          } else {
            setDiscardOpen(false)
          }
        }}
        onLeave={dialogMode === 'navigate' ? handleNavLeave : confirmDiscard}
      />
    </section>
  )
}
