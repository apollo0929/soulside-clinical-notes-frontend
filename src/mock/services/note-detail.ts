import type { IsoDateTime } from '@/domain/datetime'
import type { NoteId } from '@/domain/ids'
import type { NoteDetailDto } from '@/domain/schemas'
import type { MockDatabase } from '@/mock/database/repository'
import { createMockApiError, type MockApiError } from '@/mock/errors'

export type NoteDetailResult =
  | { readonly ok: true; readonly detail: NoteDetailDto }
  | { readonly ok: false; readonly error: MockApiError }

export function getNoteDetailFromDatabase(db: MockDatabase, noteId: NoteId): NoteDetailResult {
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

  const patient = db.getPatient(note.patientId)
  if (!patient) {
    return {
      ok: false,
      error: createMockApiError({
        code: 'NOT_FOUND',
        status: 404,
        message: `Patient for note ${noteId} was not found.`,
      }),
    }
  }

  const currentVersion = db.getVersion(note.currentVersionId)
  if (!currentVersion) {
    return {
      ok: false,
      error: createMockApiError({
        code: 'NOT_FOUND',
        status: 404,
        message: `Current version for note ${noteId} was not found.`,
      }),
    }
  }

  const versions = db.listVersionsForNote(noteId)
  const events = db.listReviewEvents(noteId)

  let assignedReviewer: NoteDetailDto['assignedReviewer'] = null
  if (note.assignedReviewerId) {
    const reviewer = db.getUser(note.assignedReviewerId)
    if (!reviewer) {
      return {
        ok: false,
        error: createMockApiError({
          code: 'NOT_FOUND',
          status: 404,
          message: `Assigned reviewer for note ${noteId} was not found.`,
        }),
      }
    }
    assignedReviewer = {
      id: reviewer.id,
      displayName: reviewer.displayName,
      role: reviewer.role,
    }
  }

  const detail: NoteDetailDto = {
    id: note.id,
    patient: { id: patient.id, displayName: patient.displayName },
    status: note.status,
    assignedReviewer,
    currentVersion: {
      id: currentVersion.id,
      revision: currentVersion.revisionNumber,
      parentVersionId: currentVersion.parentVersionId,
      content: {
        sections: {
          S: currentVersion.content.subjective,
          O: currentVersion.content.objective,
          A: currentVersion.content.assessment,
          P: currentVersion.content.plan,
        },
      },
      authoredBy: {
        id: currentVersion.authorId,
        role: currentVersion.authorRole,
      },
      createdAt: currentVersion.createdAt,
    },
    versions: versions.map((version) => ({
      id: version.id,
      revision: version.revisionNumber,
      parentVersionId: version.parentVersionId,
      authoredBy: {
        id: version.authorId,
        role: version.authorRole,
      },
      createdAt: version.createdAt,
    })),
    review: {
      events: events.map((event) => ({
        id: event.id,
        versionId: event.versionId,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        actorId: event.actorId,
        actorRole: event.actorRole,
        reason: event.reason,
        occurredAt: event.occurredAt,
      })),
    },
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  }

  return { ok: true, detail }
}

export type { IsoDateTime }
