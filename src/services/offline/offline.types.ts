import type { IsoDateTime } from '@/domain/datetime'
import type { ClientMutationId, NoteId, VersionId } from '@/domain/ids'
import type { SoapContent } from '@/domain/models/soap'

export const QUEUED_WRITE_STATUSES = ['QUEUED', 'REPLAYING', 'BLOCKED_CONFLICT', 'FAILED'] as const

export type QueuedWriteStatus = (typeof QUEUED_WRITE_STATUSES)[number]

/**
 * Persistent create-version write. Queue entry `id` is local storage identity;
 * `clientMutationId` is the server idempotency key and must be preserved on replay.
 */
export type QueuedCreateVersionWrite = {
  readonly id: string
  readonly operation: 'CREATE_NOTE_VERSION'
  readonly noteId: NoteId
  readonly baseVersionId: VersionId
  readonly content: SoapContent
  readonly clientMutationId: ClientMutationId
  readonly fingerprint: string
  readonly createdAt: IsoDateTime
  readonly status: QueuedWriteStatus
  readonly retryCount: number
  readonly lastErrorCode: string | null
  /** Optional link to a predecessor write that must succeed first. */
  readonly predecessorQueueId: string | null
  /** Present when status is BLOCKED_CONFLICT. */
  readonly conflictPayload: import('@/domain/schemas/conflict').VersionConflictResponseDto | null
}

export type QueuedWriteInsertInput = {
  readonly noteId: NoteId
  readonly baseVersionId: VersionId
  readonly content: SoapContent
  readonly clientMutationId: ClientMutationId
  readonly fingerprint: string
  readonly createdAt: IsoDateTime
  readonly predecessorQueueId?: string | null
}

export type CachedNoteDetailRecord = {
  readonly noteId: NoteId
  readonly queryKey: string
  readonly payload: unknown
  readonly updatedAt: IsoDateTime
}

export type CachedNoteListRecord = {
  readonly queryKey: string
  readonly payload: unknown
  readonly updatedAt: IsoDateTime
}

export type ReplayMetadataRecord = {
  readonly id: 'singleton'
  readonly lastReplayAt: IsoDateTime | null
  readonly lastErrorCode: string | null
}

export type ConnectivityState =
  | { readonly kind: 'ONLINE' }
  | { readonly kind: 'OFFLINE' }
  | { readonly kind: 'RECONNECTING' }
  | { readonly kind: 'REPLAYING'; readonly remaining: number }
  | { readonly kind: 'DEGRADED'; readonly reason: string }

export const REPLAY_CROSS_NOTE_CONCURRENCY = 2

export const REPLAY_BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000] as const

export const REPLAY_MAX_ATTEMPTS = 6
