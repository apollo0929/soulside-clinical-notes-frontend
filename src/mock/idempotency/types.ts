import type { IsoDateTime } from '@/domain/datetime'
import type { ClientMutationId, NoteId } from '@/domain/ids'
import type { CreateVersionSuccessResponseDto } from '@/domain/schemas'

export type CompletedCreateVersionMutation = {
  readonly operation: 'CREATE_NOTE_VERSION'
  readonly clientMutationId: ClientMutationId
  readonly noteId: NoteId
  readonly fingerprint: string
  readonly response: CreateVersionSuccessResponseDto
  readonly completedAt: IsoDateTime
}

/**
 * Extensible union for completed idempotent mutations.
 * Transition idempotency is not implemented yet.
 */
export type CompletedMutationRecord = CompletedCreateVersionMutation

export type IdempotencyBinding = {
  readonly clientMutationId: ClientMutationId
  readonly fingerprint: string
  readonly boundAt: IsoDateTime
}

export function cloneCompletedMutation(record: CompletedMutationRecord): CompletedMutationRecord {
  return Object.freeze({
    ...record,
    response: Object.freeze({
      version: Object.freeze({ ...record.response.version }),
    }),
  })
}

export function cloneIdempotencyBinding(binding: IdempotencyBinding): IdempotencyBinding {
  return Object.freeze({ ...binding })
}
