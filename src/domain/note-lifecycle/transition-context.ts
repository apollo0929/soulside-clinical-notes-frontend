import type { IsoDateTime } from '@/domain/datetime'
import type { UserId } from '@/domain/ids'
import type { NoteLifecycleAction } from '@/domain/note-lifecycle/note-actions'
import type { TransitionDenialReasonCode } from '@/domain/note-lifecycle/transition-decision'
import type { TransitionSource } from '@/domain/note-lifecycle/transition-source'
import type { UserRole } from '@/domain/roles'
import type { NoteStatus } from '@/domain/statuses'

/**
 * Strict guard/evaluation context. Use null when a domain value is absent.
 * `occurredAt` is always required and must be injected by the caller (no Date.now()).
 */
export type NoteTransitionContext = {
  readonly actorId: UserId | null
  readonly actorRole: UserRole | null
  readonly assignedReviewerId: UserId | null
  readonly mfaVerified: boolean
  readonly rejectionReason: string | null
  readonly approvedAt: IsoDateTime | null
  readonly occurredAt: IsoDateTime
}

export type NoteTransitionInput = {
  readonly status: NoteStatus
  readonly action: NoteLifecycleAction
  readonly source: TransitionSource
  readonly context: NoteTransitionContext
}

/** Amendment is allowed when elapsed time is less than or equal to 24 hours. */
export const AMENDMENT_GRACE_PERIOD_MS = 24 * 60 * 60 * 1000

export function denialReasonMessage(
  reasonCode: TransitionDenialReasonCode,
  status: NoteStatus,
  action: NoteLifecycleAction | null = null,
): string {
  switch (reasonCode) {
    case 'INVALID_TRANSITION':
      return `This action is not available while the note is ${status}.`
    case 'INVALID_SOURCE':
      return 'This action cannot be invoked from the provided transition source.'
    case 'ROLE_NOT_ALLOWED':
      return 'Your role is not permitted to perform this action.'
    case 'NOT_ASSIGNED_REVIEWER':
      if (action === 'APPROVE') {
        return 'Only the assigned reviewer can approve this note.'
      }
      if (action === 'REJECT') {
        return 'Only the assigned reviewer can reject this note.'
      }
      if (action === 'RETURN_TO_QUEUE') {
        return 'Only the assigned reviewer can return this note to the queue.'
      }
      return 'Only the assigned reviewer can perform this action on this note.'
    case 'MFA_REQUIRED':
      return 'MFA verification is required before approval.'
    case 'REJECTION_REASON_REQUIRED':
      return 'A rejection reason is required.'
    case 'APPROVAL_TIMESTAMP_REQUIRED':
      return 'An approval timestamp is required before amending this note.'
    case 'AMENDMENT_GRACE_EXPIRED':
      return 'The 24-hour amendment grace period has expired.'
    case 'INVALID_TIME_RANGE':
      return 'The current time cannot be earlier than the approval timestamp.'
    default: {
      const _exhaustive: never = reasonCode
      return _exhaustive
    }
  }
}

export function normalizeRejectionReason(reason: string): string {
  return reason.trim()
}

export function toEpochMilliseconds(value: IsoDateTime): number {
  return Date.parse(value)
}
