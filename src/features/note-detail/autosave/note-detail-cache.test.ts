import { describe, expect, it } from 'vitest'

import { parseNoteId, parseUserId, parseVersionId } from '@/domain/ids'
import type { NoteDetailAggregate } from '@/domain/models/note-detail-aggregate'
import { applySuccessfulVersionToDetail } from '@/features/note-detail/autosave/note-detail-cache'
import { buildNote, buildNoteVersion, buildPatient, buildSoapContent } from '@/test/fixtures/domain'

function baseAggregate(): NoteDetailAggregate {
  const noteId = parseNoteId('note_cache_1')
  const versionId = parseVersionId('ver_cache_1')
  const version = buildNoteVersion({
    id: versionId,
    noteId,
    revisionNumber: 1,
    parentVersionId: versionId,
    content: buildSoapContent({ subjective: 'old' }),
  })
  const note = buildNote({
    id: noteId,
    currentVersionId: versionId,
    status: 'IN_REVIEW',
  })
  return {
    note,
    patient: buildPatient(),
    assignedReviewer: null,
    currentVersion: version,
    versions: [
      {
        id: version.id,
        noteId: version.noteId,
        revisionNumber: version.revisionNumber,
        parentVersionId: version.parentVersionId,
        authorId: version.authorId,
        authorRole: version.authorRole,
        createdAt: version.createdAt,
      },
    ],
    reviewEvents: [],
  }
}

describe('note-detail-cache helpers', () => {
  it('41–43: applySuccessfulVersion updates head and appends once (idempotent)', () => {
    const aggregate = baseAggregate()
    const nextId = parseVersionId('ver_cache_2')
    const saved = buildSoapContent({ subjective: 'saved' })
    const first = applySuccessfulVersionToDetail(aggregate, {
      noteId: aggregate.note.id,
      versionId: nextId,
      revision: 2,
      parentVersionId: aggregate.currentVersion.id,
      savedContent: saved,
      authorId: parseUserId('usr_admin_42'),
      authorRole: 'ADMIN',
    })
    expect(first.currentVersion.id).toBe(nextId)
    expect(first.currentVersion.content.subjective).toBe('saved')
    expect(first.versions).toHaveLength(2)
    expect(first.note.updatedAt).toBe(aggregate.note.updatedAt)

    const second = applySuccessfulVersionToDetail(first, {
      noteId: aggregate.note.id,
      versionId: nextId,
      revision: 2,
      parentVersionId: aggregate.currentVersion.id,
      savedContent: saved,
      authorId: parseUserId('usr_admin_42'),
      authorRole: 'ADMIN',
    })
    expect(second.versions).toHaveLength(2)
    expect(aggregate.versions).toHaveLength(1)
  })
})
