import type { NoteId, VersionId } from '@/domain/ids'
import type { NoteVersionDetailDto } from '@/domain/schemas'
import type { MockDatabase } from '@/mock/database/repository'
import { createMockApiError, type MockApiError } from '@/mock/errors'

export type NoteVersionDetailResult =
  | { readonly ok: true; readonly version: NoteVersionDetailDto }
  | { readonly ok: false; readonly error: MockApiError }

/**
 * Loads one immutable historical version for a note.
 * Returns NOT_FOUND when the version is missing or belongs to another note.
 */
export function getNoteVersionFromDatabase(
  db: MockDatabase,
  noteId: NoteId,
  versionId: VersionId,
): NoteVersionDetailResult {
  const note = db.getNote(noteId)
  if (!note) {
    return {
      ok: false,
      error: createMockApiError({
        code: 'NOT_FOUND',
        status: 404,
        message: `Note ${noteId} was not found.`,
      }),
    }
  }

  const version = db.getVersion(versionId)
  if (!version) {
    return {
      ok: false,
      error: createMockApiError({
        code: 'NOT_FOUND',
        status: 404,
        message: `Version ${versionId} was not found.`,
      }),
    }
  }

  if (version.noteId !== noteId) {
    return {
      ok: false,
      error: createMockApiError({
        code: 'NOT_FOUND',
        status: 404,
        message: `Version ${versionId} does not belong to note ${noteId}.`,
        details: { reasonCode: 'VERSION_NOTE_MISMATCH' },
      }),
    }
  }

  const dto: NoteVersionDetailDto = Object.freeze({
    id: version.id,
    revision: version.revisionNumber,
    parentVersionId: version.parentVersionId,
    content: Object.freeze({
      sections: Object.freeze({
        S: version.content.subjective,
        O: version.content.objective,
        A: version.content.assessment,
        P: version.content.plan,
      }),
    }),
    authoredBy: Object.freeze({
      id: version.authorId,
      role: version.authorRole,
    }),
    createdAt: version.createdAt,
  })

  return { ok: true, version: dto }
}
