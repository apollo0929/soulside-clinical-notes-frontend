import { authorize } from '@/domain/authorization'
import type { IsoDateTime } from '@/domain/datetime'
import type { ClientMutationId, NoteId, UserId } from '@/domain/ids'
import { evaluateReviewerAssignment } from '@/domain/note-assignment'
import type {
  BulkAssignItemResultDto,
  BulkAssignReviewerResponseDto,
} from '@/domain/schemas/bulk-actions'
import type { MockDatabase } from '@/mock/database/repository'
import { createMockApiError, isMockApiError, type MockApiError } from '@/mock/errors'
import {
  buildBulkAssignFingerprint,
  type CompletedBulkAssignMutation,
} from '@/mock/idempotency/types'
import { buildNotesListItemDto } from '@/mock/services/notes-list'
import type { ActorContext } from '@/mock/services/seed-service'

export const MAX_BULK_ASSIGN_SIZE = 100

export type BulkAssignReviewerInput = {
  readonly actor: ActorContext
  readonly noteIds: readonly NoteId[]
  readonly reviewerId: UserId
  readonly clientMutationId: ClientMutationId
  readonly occurredAt: IsoDateTime
}

export type BulkAssignReviewerResult =
  | { readonly ok: true; readonly response: BulkAssignReviewerResponseDto }
  | { readonly ok: false; readonly error: MockApiError }

/**
 * Transport-independent bulk reviewer assignment.
 *
 * - Request-wide auth: NOTE_BULK_ASSIGN_REVIEWER (ADMIN)
 * - Per-note: NOTE_ASSIGN_REVIEWER + status policy
 * - Status is never changed; no ReviewEvent is appended (no same-status lifecycle event)
 * - Each note mutation is independent (partial success)
 * - Idempotent via clientMutationId + fingerprint (sorted note IDs)
 */
export function bulkAssignReviewer(
  db: MockDatabase,
  input: BulkAssignReviewerInput,
): BulkAssignReviewerResult {
  const auth = authorize({
    permission: 'NOTE_BULK_ASSIGN_REVIEWER',
    actor: { userId: input.actor.userId, role: input.actor.role },
    resource: null,
  })
  if (!auth.allowed) {
    return {
      ok: false,
      error: createMockApiError({
        code: 'FORBIDDEN',
        status: 403,
        message: auth.reason,
        details: { reasonCode: auth.reasonCode },
      }),
    }
  }

  if (input.noteIds.length === 0) {
    return {
      ok: false,
      error: createMockApiError({
        code: 'INVALID_REQUEST',
        status: 400,
        message: 'noteIds must not be empty.',
      }),
    }
  }

  if (input.noteIds.length > MAX_BULK_ASSIGN_SIZE) {
    return {
      ok: false,
      error: createMockApiError({
        code: 'INVALID_REQUEST',
        status: 400,
        message: `noteIds cannot exceed ${MAX_BULK_ASSIGN_SIZE}.`,
      }),
    }
  }

  const unique = new Set(input.noteIds)
  if (unique.size !== input.noteIds.length) {
    return {
      ok: false,
      error: createMockApiError({
        code: 'INVALID_REQUEST',
        status: 400,
        message: 'noteIds must be unique.',
      }),
    }
  }

  const fingerprint = buildBulkAssignFingerprint({
    noteIds: input.noteIds,
    reviewerId: input.reviewerId,
    actorUserId: input.actor.userId,
  })

  const completed = db.getCompletedMutation(input.clientMutationId)
  if (completed) {
    if (completed.operation !== 'BULK_ASSIGN_REVIEWER') {
      return {
        ok: false,
        error: createMockApiError({
          code: 'IDEMPOTENCY_KEY_REUSED',
          status: 409,
          message: 'clientMutationId was already used for a different operation.',
          details: { clientMutationId: input.clientMutationId },
        }),
      }
    }
    if (completed.fingerprint !== fingerprint) {
      return {
        ok: false,
        error: createMockApiError({
          code: 'IDEMPOTENCY_KEY_REUSED',
          status: 409,
          message: 'clientMutationId was already used with a different request fingerprint.',
          details: { clientMutationId: input.clientMutationId },
        }),
      }
    }
    return { ok: true, response: completed.response }
  }

  try {
    db.bindIdempotencyKey({
      clientMutationId: input.clientMutationId,
      fingerprint,
      boundAt: input.occurredAt,
    })
  } catch (error) {
    if (isMockApiError(error)) {
      return { ok: false, error }
    }
    throw error
  }

  const reviewer = db.getUser(input.reviewerId)
  if (!reviewer) {
    return {
      ok: false,
      error: createMockApiError({
        code: 'INVALID_REQUEST',
        status: 400,
        message: 'Unknown reviewerId.',
      }),
    }
  }
  if (reviewer.role !== 'REVIEWER') {
    return {
      ok: false,
      error: createMockApiError({
        code: 'INVALID_REQUEST',
        status: 400,
        message: 'reviewerId must refer to a user with role REVIEWER.',
      }),
    }
  }

  const results: BulkAssignItemResultDto[] = []
  for (const noteId of input.noteIds) {
    results.push(assignOne(db, noteId, input))
  }

  const response: BulkAssignReviewerResponseDto = { results }
  const mutation: CompletedBulkAssignMutation = {
    operation: 'BULK_ASSIGN_REVIEWER',
    clientMutationId: input.clientMutationId,
    fingerprint,
    response,
    completedAt: input.occurredAt,
  }
  db.saveCompletedMutation(mutation)

  return { ok: true, response }
}

function resolveClinicianId(db: MockDatabase, noteId: NoteId): UserId | null {
  const versions = db.listVersionsForNote(noteId)
  const first = [...versions].sort((a, b) => a.revisionNumber - b.revisionNumber)[0]
  return first?.authorId ?? null
}

function assignOne(
  db: MockDatabase,
  noteId: NoteId,
  input: BulkAssignReviewerInput,
): BulkAssignItemResultDto {
  const note = db.getNote(noteId)
  if (!note) {
    return {
      noteId,
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Note ${noteId} was not found.`,
      },
    }
  }

  const clinicianId = resolveClinicianId(db, note.id)
  if (!clinicianId) {
    return {
      noteId,
      success: false,
      error: {
        code: 'INVALID_REQUEST',
        message: 'Unable to resolve owning clinician for note.',
      },
    }
  }

  const noteAuth = authorize({
    permission: 'NOTE_ASSIGN_REVIEWER',
    actor: { userId: input.actor.userId, role: input.actor.role },
    resource: {
      kind: 'NOTE',
      noteId: note.id,
      clinicianId,
      assignedReviewerId: note.assignedReviewerId,
    },
  })
  if (!noteAuth.allowed) {
    return {
      noteId,
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: noteAuth.reason,
      },
    }
  }

  const policy = evaluateReviewerAssignment({
    status: note.status,
    isAdmin: input.actor.role === 'ADMIN',
  })
  if (!policy.allowed) {
    return {
      noteId,
      success: false,
      error: {
        code: policy.reasonCode,
        message: policy.reason,
      },
    }
  }

  const updated = Object.freeze({
    ...note,
    assignedReviewerId: input.reviewerId,
    updatedAt: input.occurredAt,
  })
  db.updateNote(updated)

  return {
    noteId,
    success: true,
    note: buildNotesListItemDto(updated, db),
  }
}
