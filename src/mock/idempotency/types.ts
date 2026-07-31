import type { IsoDateTime } from '@/domain/datetime'
import type { ClientMutationId, NoteId, UserId } from '@/domain/ids'
import type {
  BulkAssignReviewerResponseDto,
  BulkRegenerateResponseDto,
  CreateVersionSuccessResponseDto,
  NotesListItemDto,
} from '@/domain/schemas'

export type CompletedCreateVersionMutation = {
  readonly operation: 'CREATE_NOTE_VERSION'
  readonly clientMutationId: ClientMutationId
  readonly noteId: NoteId
  readonly fingerprint: string
  readonly response: CreateVersionSuccessResponseDto
  readonly completedAt: IsoDateTime
}

export type CompletedBulkAssignMutation = {
  readonly operation: 'BULK_ASSIGN_REVIEWER'
  readonly clientMutationId: ClientMutationId
  readonly fingerprint: string
  readonly response: BulkAssignReviewerResponseDto
  readonly completedAt: IsoDateTime
}

export type CompletedBulkRegenerateMutation = {
  readonly operation: 'BULK_REGENERATE'
  readonly clientMutationId: ClientMutationId
  readonly fingerprint: string
  readonly response: BulkRegenerateResponseDto
  readonly completedAt: IsoDateTime
}

/**
 * Extensible union for completed idempotent mutations.
 */
export type CompletedMutationRecord =
  CompletedCreateVersionMutation | CompletedBulkAssignMutation | CompletedBulkRegenerateMutation

export type IdempotencyBinding = {
  readonly clientMutationId: ClientMutationId
  readonly fingerprint: string
  readonly boundAt: IsoDateTime
}

function cloneBulkListNote(note: NotesListItemDto): NotesListItemDto {
  return Object.freeze({
    ...note,
    patient: Object.freeze({ ...note.patient }),
    currentVersion: Object.freeze({ ...note.currentVersion }),
    assignedReviewer:
      note.assignedReviewer === null ? null : Object.freeze({ ...note.assignedReviewer }),
  })
}

function cloneBulkResultItem(
  item:
    BulkAssignReviewerResponseDto['results'][number] | BulkRegenerateResponseDto['results'][number],
) {
  if (item.success) {
    return Object.freeze({
      ...item,
      note: cloneBulkListNote(item.note),
    })
  }
  return Object.freeze({
    ...item,
    error: Object.freeze({ ...item.error }),
  })
}

export function cloneCompletedMutation(record: CompletedMutationRecord): CompletedMutationRecord {
  if (record.operation === 'CREATE_NOTE_VERSION') {
    return Object.freeze({
      ...record,
      response: Object.freeze({
        version: Object.freeze({ ...record.response.version }),
      }),
    })
  }

  return Object.freeze({
    ...record,
    response: Object.freeze({
      results: record.response.results.map((item) => cloneBulkResultItem(item)),
    }),
  })
}

export function cloneIdempotencyBinding(binding: IdempotencyBinding): IdempotencyBinding {
  return Object.freeze({ ...binding })
}

export function buildBulkAssignFingerprint(input: {
  readonly noteIds: readonly NoteId[]
  readonly reviewerId: UserId
  readonly actorUserId: UserId
}): string {
  const sorted = [...input.noteIds].map(String).sort()
  return ['BULK_ASSIGN_REVIEWER', input.actorUserId, input.reviewerId, ...sorted].join('\u001f')
}

export function buildBulkRegenerateFingerprint(input: {
  readonly noteIds: readonly NoteId[]
  readonly actorUserId: UserId
}): string {
  const sorted = [...input.noteIds].map(String).sort()
  return ['BULK_REGENERATE', input.actorUserId, ...sorted].join('\u001f')
}
