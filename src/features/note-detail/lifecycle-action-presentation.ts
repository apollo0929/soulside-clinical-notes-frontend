import { authorize, type Permission } from '@/domain/authorization'
import { combineAuthorizationAndLifecycle } from '@/domain/authorization'
import type { IsoDateTime } from '@/domain/datetime'
import { parseIsoDateTime } from '@/domain/datetime'
import type { UserId } from '@/domain/ids'
import { parseUserId } from '@/domain/ids'
import type { NoteDetailAggregate } from '@/domain/models/note-detail-aggregate'
import type { ReviewEvent } from '@/domain/models/review-event'
import { evaluateNoteTransition, type NoteLifecycleAction } from '@/domain/note-lifecycle'
import {
  type LifecycleActionDescriptor,
  USER_LIFECYCLE_ACTIONS,
  type UserLifecycleAction,
} from '@/features/note-detail/note-detail.types'
import { getActorIdentity } from '@/services/api/actor-provider'

const ACTION_LABELS: Readonly<Record<UserLifecycleAction, string>> = {
  REGENERATE: 'Regenerate',
  START_REVIEW: 'Start review',
  RETURN_TO_QUEUE: 'Return to queue',
  APPROVE: 'Approve',
  REJECT: 'Reject',
  RESUBMIT: 'Resubmit',
  AMEND: 'Amend',
}

const ACTION_PERMISSION: Readonly<Record<UserLifecycleAction, Permission>> = {
  REGENERATE: 'NOTE_REGENERATE',
  START_REVIEW: 'REVIEW_START',
  RETURN_TO_QUEUE: 'REVIEW_RETURN',
  APPROVE: 'REVIEW_APPROVE',
  REJECT: 'REVIEW_REJECT',
  RESUBMIT: 'NOTE_RESUBMIT',
  AMEND: 'NOTE_AMEND',
}

/**
 * Derive approvedAt from the latest ReviewEvent transitioning to APPROVED.
 * Production APIs may expose this field directly.
 */
export function deriveApprovedAtFromEvents(events: readonly ReviewEvent[]): IsoDateTime | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event?.toStatus === 'APPROVED') {
      return event.occurredAt
    }
  }
  return null
}

export function sortVersionsNewestFirst<T extends { readonly revisionNumber: number }>(
  versions: readonly T[],
): readonly T[] {
  return [...versions].sort((a, b) => {
    if (b.revisionNumber !== a.revisionNumber) {
      return b.revisionNumber - a.revisionNumber
    }
    return 0
  })
}

/** Timeline: newest events first (documented chronological direction). */
export function sortReviewEventsNewestFirst(
  events: readonly ReviewEvent[],
): readonly ReviewEvent[] {
  return [...events].sort((a, b) => {
    const delta = Date.parse(b.occurredAt) - Date.parse(a.occurredAt)
    if (delta !== 0) {
      return delta
    }
    return String(b.id).localeCompare(String(a.id))
  })
}

export type BuildLifecycleActionDescriptorsInput = {
  readonly aggregate: NoteDetailAggregate
  readonly occurredAt: IsoDateTime
  readonly actorUserId?: string
  readonly actorRole?: ReturnType<typeof getActorIdentity>['role']
  readonly clinicianId: UserId
}

export function buildLifecycleActionDescriptors(
  input: BuildLifecycleActionDescriptorsInput,
): readonly LifecycleActionDescriptor[] {
  const actorIdentity = getActorIdentity()
  const actorUserId = input.actorUserId ?? actorIdentity.userId
  const actorRole = input.actorRole ?? actorIdentity.role
  const actorId = parseUserId(actorUserId)
  const approvedAt = deriveApprovedAtFromEvents(input.aggregate.reviewEvents)

  const context = {
    actorId,
    actorRole,
    assignedReviewerId: input.aggregate.note.assignedReviewerId,
    // Step 7A has no MFA UI; evaluate with MFA unverified and explain APPROVE denials.
    mfaVerified: false,
    rejectionReason: null,
    approvedAt,
    occurredAt: input.occurredAt,
  }

  return USER_LIFECYCLE_ACTIONS.map((action) => {
    const lifecycle = evaluateNoteTransition({
      status: input.aggregate.note.status,
      action: action as NoteLifecycleAction,
      source: 'USER',
      context,
    })

    const authorization = authorize({
      permission: ACTION_PERMISSION[action],
      actor: { userId: actorId, role: actorRole },
      resource: {
        kind: 'NOTE',
        noteId: input.aggregate.note.id,
        clinicianId: input.clinicianId,
        assignedReviewerId: input.aggregate.note.assignedReviewerId,
      },
    })

    const combined = combineAuthorizationAndLifecycle({ authorization, lifecycle })

    if (combined.allowed) {
      return {
        action,
        label: ACTION_LABELS[action],
        allowed: true,
        denialCode: null,
        denialReason: null,
      }
    }

    if (combined.source === 'AUTHORIZATION') {
      return {
        action,
        label: ACTION_LABELS[action],
        allowed: false,
        denialCode: combined.authorization.reasonCode,
        denialReason: combined.authorization.reason,
      }
    }

    const denialReason =
      combined.lifecycle.reasonCode === 'MFA_REQUIRED'
        ? 'Approval requires MFA verification (not available in this read-only step).'
        : combined.lifecycle.reason

    return {
      action,
      label: ACTION_LABELS[action],
      allowed: false,
      denialCode: combined.lifecycle.reasonCode,
      denialReason,
    }
  })
}

/** Injected UI clock — avoid Date.now inside pure descriptor builders. */
export function getUiOccurredAt(now: Date = new Date()): IsoDateTime {
  return parseIsoDateTime(now.toISOString())
}
