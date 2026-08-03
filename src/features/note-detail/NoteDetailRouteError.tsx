import { useEffect } from 'react'
import { useRouteError } from 'react-router-dom'

import { NoteDetailErrorState } from '@/features/note-detail/NoteDetailErrorState'

/**
 * Catches any error thrown during NoteDetailPage rendering (Zod parse failures,
 * undefined actor userId, network errors, etc.) and renders the application's
 * own error UI instead of React Router's generic "Unexpected Application Error".
 *
 * The raw error is logged to the console for developers and intentionally NOT
 * exposed in the rendered UI.
 */
export function NoteDetailRouteError() {
  const error = useRouteError()

  useEffect(() => {
    console.error('[NoteDetailRouteError] Caught route error:', error)
  }, [error])

  return (
    <main className="note-detail-page" aria-labelledby="note-detail-heading">
      <NoteDetailErrorState
        kind="generic"
        message="Something went wrong while loading this note. Please go back and try again."
        backHref="/notes"
      />
    </main>
  )
}
