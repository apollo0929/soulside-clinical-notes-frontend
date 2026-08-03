import { type ReactNode, Suspense } from 'react'
import { type RouteObject } from 'react-router-dom'

import { LazyNoteDetailPage, LazyNotesListPage } from '@/app/lazy-pages'
import { HomePage } from '@/app/pages/HomePage'
import { NotFoundPage } from '@/app/pages/NotFoundPage'
import { NoteDetailRouteError } from '@/features/note-detail/NoteDetailRouteError'

function withSuspense(element: ReactNode) {
  return <Suspense fallback={<p role="status">Loading page…</p>}>{element}</Suspense>
}

/** Child routes under the app shell layout (data router). */
export const appChildRoutes: RouteObject[] = [
  { index: true, element: <HomePage /> },
  { path: 'notes', element: withSuspense(<LazyNotesListPage />) },
  {
    path: 'notes/:noteId',
    element: withSuspense(<LazyNoteDetailPage />),
    errorElement: <NoteDetailRouteError />,
  },
  { path: '*', element: <NotFoundPage /> },
]
