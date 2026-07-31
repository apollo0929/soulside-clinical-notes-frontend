import { type RefObject, useEffect, useId, useRef } from 'react'
import { useBlocker } from 'react-router-dom'

export type UnsavedNavigationGuardResult = {
  readonly blocker: ReturnType<typeof useBlocker>
  readonly confirmStay: () => void
  readonly confirmLeave: () => void
}

/**
 * Blocks internal navigations while `isDirty`. Registers `beforeunload` only while dirty.
 * Requires a data router (createBrowserRouter / createMemoryRouter).
 */
export function useUnsavedNavigationGuard(isDirty: boolean): UnsavedNavigationGuardResult {
  const blocker = useBlocker(isDirty)

  useEffect(() => {
    if (!isDirty) {
      return
    }
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [isDirty])

  const confirmStay = () => {
    if (blocker.state === 'blocked') {
      blocker.reset()
    }
  }

  const confirmLeave = () => {
    if (blocker.state === 'blocked') {
      blocker.proceed()
    }
  }

  return { blocker, confirmStay, confirmLeave }
}

export function useDialogFocus(
  open: boolean,
  dialogRef: RefObject<HTMLDialogElement | null>,
): { readonly titleId: string } {
  const previouslyFocused = useRef<HTMLElement | null>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!open || !dialog) {
      return
    }
    previouslyFocused.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (typeof dialog.showModal === 'function' && !dialog.open) {
      dialog.showModal()
    }
    const stayButton = dialog.querySelector<HTMLElement>('[data-dialog-initial-focus]')
    stayButton?.focus()

    return () => {
      if (dialog.open && typeof dialog.close === 'function') {
        dialog.close()
      }
      previouslyFocused.current?.focus()
    }
  }, [open, dialogRef])

  return { titleId }
}
