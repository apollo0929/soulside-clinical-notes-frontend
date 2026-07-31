import { describe, expect, it } from 'vitest'

import { parseIsoDateTime } from '@/domain/datetime'
import { parseNoteId, parsePatientId, parseUserId, parseVersionId } from '@/domain/ids'
import type { NoteSummary } from '@/domain/models/note-summary'
import {
  applyBulkResultsToInfiniteData,
  type NotesInfiniteData,
  patchNotesInInfiniteData,
  restoreNotesInInfiniteData,
} from '@/features/notes-list/notes-list-cache'

function note(id: string, status: NoteSummary['status'] = 'FAILED'): NoteSummary {
  return {
    id: parseNoteId(id),
    patientId: parsePatientId('pat_1'),
    patientDisplayName: 'Pat',
    status,
    currentVersionId: parseVersionId(`ver_${id}`),
    currentRevision: 1,
    assignedReviewer: null,
    createdAt: parseIsoDateTime('2024-06-01T12:00:00.000Z'),
    updatedAt: parseIsoDateTime('2024-06-02T12:00:00.000Z'),
  }
}

function sampleData(): NotesInfiniteData {
  return {
    pages: [
      {
        items: [note('note_1'), note('note_2'), note('note_3', 'APPROVED')],
        nextCursor: 'cursor-1',
        hasMore: true,
        total: 3,
        returned: 3,
        generatedAt: parseIsoDateTime('2024-07-01T00:00:00.000Z'),
      },
    ],
    pageParams: [null],
  }
}

describe('notes-list-cache helpers', () => {
  it('26–29: assignment patch updates only selected notes; cursors preserved; no mutation', () => {
    const data = sampleData()
    const pageRef = data.pages[0]!
    const untouched = pageRef.items[2]!
    const next = patchNotesInInfiniteData(
      data,
      new Map([
        [
          parseNoteId('note_1'),
          {
            assignedReviewer: {
              id: parseUserId('usr_reviewer_42_0'),
              displayName: 'Reviewer 1',
            },
          },
        ],
      ]),
    )
    expect(next.pages[0]!.nextCursor).toBe('cursor-1')
    expect(next.pages[0]!.hasMore).toBe(true)
    expect(next.pages[0]!.items[0]!.assignedReviewer?.displayName).toBe('Reviewer 1')
    expect(next.pages[0]!.items[1]).toBe(pageRef.items[1])
    expect(next.pages[0]!.items[2]).toBe(untouched)
    expect(data.pages[0]!.items[0]!.assignedReviewer).toBeNull()
  })

  it('27: regeneration patch changes selected notes', () => {
    const data = sampleData()
    const next = patchNotesInInfiniteData(
      data,
      new Map([
        [parseNoteId('note_1'), { status: 'GENERATING' }],
        [parseNoteId('note_3'), { status: 'GENERATING' }],
      ]),
    )
    expect(next.pages[0]!.items[0]!.status).toBe('GENERATING')
    expect(next.pages[0]!.items[2]!.status).toBe('GENERATING')
  })

  it('30–33: rollback and apply results; no duplicates', () => {
    const data = sampleData()
    const snapshot = new Map([[parseNoteId('note_1'), data.pages[0]!.items[0]!]])
    const optimistic = patchNotesInInfiniteData(
      data,
      new Map([[parseNoteId('note_1'), { status: 'GENERATING' }]]),
    )
    const restored = restoreNotesInInfiniteData(optimistic, snapshot)
    expect(restored.pages[0]!.items[0]!.status).toBe('FAILED')

    const serverNote = { ...data.pages[0]!.items[0]!, status: 'GENERATING' as const }
    const applied = applyBulkResultsToInfiniteData(optimistic, {
      successes: new Map([[parseNoteId('note_1'), serverNote]]),
      failures: new Map([[parseNoteId('note_2'), data.pages[0]!.items[1]!]]),
    })
    const ids = applied.pages[0]!.items.map((item) => item.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(applied.pages[0]!.items[0]!.status).toBe('GENERATING')
  })
})
