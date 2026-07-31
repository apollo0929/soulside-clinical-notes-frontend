import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'

import { HomePage } from '@/app/pages/HomePage'
import { NotFoundPage } from '@/app/pages/NotFoundPage'

const NotesListPage = lazy(async () => {
  const module = await import('@/features/notes-list')
  return { default: module.NotesListPage }
})

export function AppRoutes() {
  return (
    <Suspense fallback={<p role="status">Loading page…</p>}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/notes" element={<NotesListPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  )
}
