import { useEffect, useRef } from 'react'

import { useDialogFocus } from './use-unsaved-navigation-guard'

export type UnsavedChangesDialogProps = {
  readonly open: boolean
  readonly title: string
  readonly description: string
  readonly stayLabel?: string
  readonly leaveLabel?: string
  readonly onStay: () => void
  readonly onLeave: () => void
}

export function UnsavedChangesDialog({
  open,
  title,
  description,
  stayLabel = 'Stay and continue editing',
  leaveLabel = 'Discard and leave',
  onStay,
  onLeave,
}: UnsavedChangesDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { titleId } = useDialogFocus(open, dialogRef)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog || !open) {
      return
    }
    const onCancel = (event: Event) => {
      event.preventDefault()
      onStay()
    }
    dialog.addEventListener('cancel', onCancel)
    return () => {
      dialog.removeEventListener('cancel', onCancel)
    }
  }, [open, onStay])

  if (!open) {
    return null
  }

  return (
    <dialog
      ref={dialogRef}
      className="unsaved-changes-dialog"
      aria-labelledby={titleId}
      aria-modal="true"
    >
      <form
        method="dialog"
        className="unsaved-changes-dialog__form"
        onSubmit={(event) => {
          event.preventDefault()
        }}
      >
        <h2 id={titleId}>{title}</h2>
        <p>{description}</p>
        <div className="unsaved-changes-dialog__actions">
          <button type="button" data-dialog-initial-focus onClick={onStay}>
            {stayLabel}
          </button>
          <button type="button" onClick={onLeave}>
            {leaveLabel}
          </button>
        </div>
      </form>
    </dialog>
  )
}
