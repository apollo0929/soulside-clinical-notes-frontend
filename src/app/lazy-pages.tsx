import { lazy } from 'react'

export const LazyNotesListPage = lazy(async () => {
  const module = await import('@/features/notes-list')
  return { default: module.NotesListPage }
})

export const LazyNoteDetailPage = lazy(async () => {
  const module = await import('@/features/note-detail')
  return { default: module.NoteDetailPage }
})
