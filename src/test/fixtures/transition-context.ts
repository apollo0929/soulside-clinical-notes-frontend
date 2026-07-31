import { type IsoDateTime, parseIsoDateTime } from '@/domain/datetime'
import { parseUserId, type UserId } from '@/domain/ids'
import type { NoteTransitionContext } from '@/domain/note-lifecycle/transition-context'
import type { UserRole } from '@/domain/roles'

const DEFAULT_OCCURRED_AT = parseIsoDateTime('2025-11-04T15:00:00.000Z')
const DEFAULT_APPROVED_AT = parseIsoDateTime('2025-11-04T12:00:00.000Z')

export function buildNoteTransitionContext(
  overrides: {
    actorId?: UserId | null
    actorRole?: UserRole | null
    assignedReviewerId?: UserId | null
    mfaVerified?: boolean
    rejectionReason?: string | null
    approvedAt?: IsoDateTime | null
    occurredAt?: IsoDateTime
  } = {},
): NoteTransitionContext {
  return {
    actorId: overrides.actorId === undefined ? parseUserId('usr_reviewer_1') : overrides.actorId,
    actorRole: overrides.actorRole === undefined ? 'REVIEWER' : overrides.actorRole,
    assignedReviewerId:
      overrides.assignedReviewerId === undefined
        ? parseUserId('usr_reviewer_1')
        : overrides.assignedReviewerId,
    mfaVerified: overrides.mfaVerified ?? true,
    rejectionReason: overrides.rejectionReason === undefined ? null : overrides.rejectionReason,
    approvedAt: overrides.approvedAt === undefined ? DEFAULT_APPROVED_AT : overrides.approvedAt,
    occurredAt: overrides.occurredAt ?? DEFAULT_OCCURRED_AT,
  }
}
