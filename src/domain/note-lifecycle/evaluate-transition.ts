import {
  AMENDMENT_GRACE_PERIOD_MS,
  denialReasonMessage,
  normalizeRejectionReason,
  type NoteTransitionInput,
  toEpochMilliseconds,
} from '@/domain/note-lifecycle/transition-context'
import type {
  AllowedTransitionDecision,
  DeniedTransitionDecision,
  TransitionDecision,
} from '@/domain/note-lifecycle/transition-decision'
import type { TransitionEffect } from '@/domain/note-lifecycle/transition-effects'
import {
  findTransitionSpecification,
  type NoteTransitionSpec,
  type TransitionGuardKind,
} from '@/domain/note-lifecycle/transition-specification'

function deny(
  input: NoteTransitionInput,
  reasonCode: DeniedTransitionDecision['reasonCode'],
  reason: string = denialReasonMessage(reasonCode, input.status, input.action),
): DeniedTransitionDecision {
  return {
    allowed: false,
    action: input.action,
    fromStatus: input.status,
    reasonCode,
    reason,
  }
}

function allow(
  input: NoteTransitionInput,
  toStatus: NoteTransitionSpec['to'],
  effects: readonly TransitionEffect[],
): AllowedTransitionDecision {
  return {
    allowed: true,
    action: input.action,
    fromStatus: input.status,
    toStatus,
    effects: Object.freeze(effects.map((effect) => Object.freeze({ ...effect }))),
  }
}

function evaluateGuard(
  guard: TransitionGuardKind,
  input: NoteTransitionInput,
): DeniedTransitionDecision | null {
  const { context } = input

  switch (guard) {
    case 'ASSIGNED_REVIEWER': {
      if (context.actorId === null || context.actorId !== context.assignedReviewerId) {
        return deny(input, 'NOT_ASSIGNED_REVIEWER')
      }
      return null
    }
    case 'MFA_VERIFIED': {
      if (!context.mfaVerified) {
        return deny(input, 'MFA_REQUIRED')
      }
      return null
    }
    case 'REJECTION_REASON_REQUIRED': {
      if (context.rejectionReason === null) {
        return deny(input, 'REJECTION_REASON_REQUIRED')
      }
      if (normalizeRejectionReason(context.rejectionReason) === '') {
        return deny(input, 'REJECTION_REASON_REQUIRED')
      }
      return null
    }
    case 'WITHIN_AMENDMENT_GRACE': {
      if (context.approvedAt === null) {
        return deny(input, 'APPROVAL_TIMESTAMP_REQUIRED')
      }

      const approvedMs = toEpochMilliseconds(context.approvedAt)
      const occurredMs = toEpochMilliseconds(context.occurredAt)

      if (Number.isNaN(approvedMs) || Number.isNaN(occurredMs)) {
        return deny(input, 'INVALID_TIME_RANGE')
      }

      if (occurredMs < approvedMs) {
        return deny(input, 'INVALID_TIME_RANGE')
      }

      const elapsedMs = occurredMs - approvedMs
      if (elapsedMs > AMENDMENT_GRACE_PERIOD_MS) {
        return deny(input, 'AMENDMENT_GRACE_EXPIRED')
      }

      return null
    }
    default: {
      const _exhaustive: never = guard
      return _exhaustive
    }
  }
}

function buildEffects(
  spec: NoteTransitionSpec,
  input: NoteTransitionInput,
):
  | { readonly ok: true; readonly effects: TransitionEffect[] }
  | { readonly ok: false; readonly decision: DeniedTransitionDecision } {
  const effects: TransitionEffect[] = []

  for (const effectKind of spec.effectKinds) {
    switch (effectKind) {
      case 'ASSIGN_REVIEWER': {
        if (input.context.actorId === null) {
          return { ok: false, decision: deny(input, 'ROLE_NOT_ALLOWED') }
        }
        effects.push({
          type: 'ASSIGN_REVIEWER',
          reviewerId: input.context.actorId,
        })
        break
      }
      case 'RELEASE_REVIEWER':
        effects.push({ type: 'RELEASE_REVIEWER' })
        break
      case 'REQUIRE_NEW_VERSION':
        effects.push({ type: 'REQUIRE_NEW_VERSION' })
        break
      case 'RECORD_REJECTION_REASON': {
        if (input.context.rejectionReason === null) {
          return { ok: false, decision: deny(input, 'REJECTION_REASON_REQUIRED') }
        }
        effects.push({
          type: 'RECORD_REJECTION_REASON',
          reason: normalizeRejectionReason(input.context.rejectionReason),
        })
        break
      }
      default: {
        const _exhaustive: never = effectKind
        return _exhaustive
      }
    }
  }

  return { ok: true, effects }
}

/**
 * Pure note lifecycle evaluator. Single decision function for user and server/system sources.
 * Does not mutate notes, create events, or perform I/O.
 */
export function evaluateNoteTransition(input: NoteTransitionInput): TransitionDecision {
  const spec = findTransitionSpecification(input.status, input.action)

  if (spec === null) {
    return deny(input, 'INVALID_TRANSITION')
  }

  if (!spec.allowedSources.includes(input.source)) {
    return deny(input, 'INVALID_SOURCE')
  }

  if (spec.allowedRoles !== null) {
    if (input.context.actorRole === null || !spec.allowedRoles.includes(input.context.actorRole)) {
      return deny(input, 'ROLE_NOT_ALLOWED')
    }
  }

  for (const guard of spec.guards) {
    const denial = evaluateGuard(guard, input)
    if (denial !== null) {
      return denial
    }
  }

  const built = buildEffects(spec, input)
  if (!built.ok) {
    return built.decision
  }

  return allow(input, spec.to, built.effects)
}

export function getTransitionDecision(input: NoteTransitionInput): TransitionDecision {
  return evaluateNoteTransition(input)
}

export function isTransitionAllowed(input: NoteTransitionInput): boolean {
  return evaluateNoteTransition(input).allowed
}

export function canTransition(input: NoteTransitionInput): boolean {
  return isTransitionAllowed(input)
}
