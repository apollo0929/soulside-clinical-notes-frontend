import type { IsoDateTime } from '@/domain/datetime'
import type { NoteId, ReviewEventId, UserId, VersionId } from '@/domain/ids'
import type { UserRole } from '@/domain/roles'
import type { NoteStatus } from '@/domain/statuses'

/**
 * Append-only audit record for status transitions.
 */
export type ReviewEvent = {
  readonly id: ReviewEventId
  readonly noteId: NoteId
  readonly versionId: VersionId
  readonly fromStatus: NoteStatus
  readonly toStatus: NoteStatus
  readonly actorId: UserId
  readonly actorRole: UserRole
  readonly reason: string | null
  readonly occurredAt: IsoDateTime
}
