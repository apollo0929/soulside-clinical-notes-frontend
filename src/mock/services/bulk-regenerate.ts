import { authorize } from '@/domain/authorization'
import type { IsoDateTime } from '@/domain/datetime'
import type { ClientMutationId, NoteId } from '@/domain/ids'
import type {
  BulkRegenerateItemResultDto,
  BulkRegenerateResponseDto,
} from '@/domain/schemas/bulk-actions'
import type { MockDatabase } from '@/mock/database/repository'
import { createMockApiError, isMockApiError, type MockApiError } from '@/mock/errors'
import {
  buildBulkRegenerateFingerprint,
  type CompletedBulkRegenerateMutation,
} from '@/mock/idempotency/types'
import { buildNotesListItemDto } from '@/mock/services/notes-list'
import type { ActorContext } from '@/mock/services/seed-service'
import { transitionNote } from '@/mock/services/transition'

export const MAX_BULK_REGENERATE_SIZE = 100

export type BulkRegenerateInput = {
  readonly actor: ActorContext
  readonly noteIds: readonly NoteId[]
  readonly clientMutationId: ClientMutationId
  readonly occurredAt: IsoDateTime
}

export type BulkRegenerateResult =
  | { readonly ok: true; readonly response: BulkRegenerateResponseDto }
  | { readonly ok: false; readonly error: MockApiError }

/**
 * Transport-independent bulk regeneration.
 *
 * - Request-wide auth: NOTE_BULK_REGENERATE (ADMIN)
 * - Per-note: existing transitionNote with REGENERATE / USER
 * - Successful FAILED -> GENERATING appends one ReviewEvent via transition service
 * - Partial success across notes
 * - Idempotent via clientMutationId + fingerprint (sorted note IDs)
 */
export function bulkRegenerateNotes(
  db: MockDatabase,
  input: BulkRegenerateInput,
): BulkRegenerateResult {
  const auth = authorize({
    permission: 'NOTE_BULK_REGENERATE',
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

  if (input.noteIds.length > MAX_BULK_REGENERATE_SIZE) {
    return {
      ok: false,
      error: createMockApiError({
        code: 'INVALID_REQUEST',
        status: 400,
        message: `noteIds cannot exceed ${MAX_BULK_REGENERATE_SIZE}.`,
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

  const fingerprint = buildBulkRegenerateFingerprint({
    noteIds: input.noteIds,
    actorUserId: input.actor.userId,
  })

  const completed = db.getCompletedMutation(input.clientMutationId)
  if (completed) {
    if (completed.operation !== 'BULK_REGENERATE') {
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

  const results: BulkRegenerateItemResultDto[] = []
  for (const noteId of input.noteIds) {
    results.push(regenerateOne(db, noteId, input))
  }

  const response: BulkRegenerateResponseDto = { results }
  const mutation: CompletedBulkRegenerateMutation = {
    operation: 'BULK_REGENERATE',
    clientMutationId: input.clientMutationId,
    fingerprint,
    response,
    completedAt: input.occurredAt,
  }
  db.saveCompletedMutation(mutation)

  return { ok: true, response }
}

function regenerateOne(
  db: MockDatabase,
  noteId: NoteId,
  input: BulkRegenerateInput,
): BulkRegenerateItemResultDto {
  const result = transitionNote(db, {
    actor: input.actor,
    noteId,
    action: 'REGENERATE',
    source: 'USER',
    mfaVerified: false,
    rejectionReason: null,
    approvedAt: null,
    occurredAt: input.occurredAt,
  })

  if (!result.ok) {
    return {
      noteId,
      success: false,
      error: {
        code: result.error.code,
        message: result.error.message,
      },
    }
  }

  // transitionNote already committed FAILED → GENERATING + one ReviewEvent.
  // Never report per-item failure after commit (would desync client rollback).
  return {
    noteId,
    success: true,
    note: buildNotesListItemDto(result.value.note, db),
  }
}
