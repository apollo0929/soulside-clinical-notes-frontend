import type { InfiniteData } from '@tanstack/react-query'

import type { NoteId } from '@/domain/ids'
import type { NoteSummary } from '@/domain/models/note-summary'
import type { NotesListPage } from '@/features/notes-list/use-notes-list'

export type NotesInfiniteData = InfiniteData<NotesListPage, string | null>

function replaceNoteInPages(
  data: NotesInfiniteData,
  replacements: ReadonlyMap<NoteId, NoteSummary>,
): NotesInfiniteData {
  if (replacements.size === 0) {
    return data
  }

  let anyPageChanged = false
  const pages = data.pages.map((page) => {
    let anyItemChanged = false
    const items = page.items.map((item) => {
      const replacement = replacements.get(item.id)
      if (!replacement || replacement === item) {
        return item
      }
      anyItemChanged = true
      return replacement
    })
    if (!anyItemChanged) {
      return page
    }
    anyPageChanged = true
    return {
      ...page,
      items,
    }
  })

  if (!anyPageChanged) {
    return data
  }

  return {
    ...data,
    pages,
    pageParams: data.pageParams,
  }
}

/**
 * Immutable patch: replace matching notes by ID. Preserves page/cursor metadata.
 * Untouched page objects retain identity when no items on that page change.
 */
export function patchNotesInInfiniteData(
  data: NotesInfiniteData,
  patchById: ReadonlyMap<NoteId, Partial<NoteSummary>>,
): NotesInfiniteData {
  if (patchById.size === 0) {
    return data
  }

  const replacements = new Map<NoteId, NoteSummary>()
  for (const page of data.pages) {
    for (const item of page.items) {
      const patch = patchById.get(item.id)
      if (!patch) {
        continue
      }
      replacements.set(item.id, { ...item, ...patch })
    }
  }
  return replaceNoteInPages(data, replacements)
}

export function restoreNotesInInfiniteData(
  data: NotesInfiniteData,
  snapshotById: ReadonlyMap<NoteId, NoteSummary>,
): NotesInfiniteData {
  return replaceNoteInPages(data, snapshotById)
}

export function applyBulkResultsToInfiniteData(
  data: NotesInfiniteData,
  input: {
    readonly successes: ReadonlyMap<NoteId, NoteSummary>
    readonly failures: ReadonlyMap<NoteId, NoteSummary>
  },
): NotesInfiniteData {
  const combined = new Map<NoteId, NoteSummary>()
  for (const [id, note] of input.failures) {
    combined.set(id, note)
  }
  for (const [id, note] of input.successes) {
    combined.set(id, note)
  }
  return replaceNoteInPages(data, combined)
}

export function snapshotNotesById(
  data: NotesInfiniteData | undefined,
  noteIds: ReadonlySet<NoteId> | readonly NoteId[],
): Map<NoteId, NoteSummary> {
  const wanted = noteIds instanceof Set ? noteIds : new Set(noteIds)
  const snapshot = new Map<NoteId, NoteSummary>()
  if (!data || wanted.size === 0) {
    return snapshot
  }
  for (const page of data.pages) {
    for (const item of page.items) {
      if (wanted.has(item.id) && !snapshot.has(item.id)) {
        snapshot.set(item.id, item)
      }
    }
  }
  return snapshot
}
