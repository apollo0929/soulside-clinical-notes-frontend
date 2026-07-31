import type { NoteLifecycleAction } from '@/domain/note-lifecycle/note-actions'
import type { TransitionSource } from '@/domain/note-lifecycle/transition-source'
import type { UserRole } from '@/domain/roles'
import type { NoteStatus } from '@/domain/statuses'

export const TRANSITION_GUARD_KINDS = [
  'ASSIGNED_REVIEWER',
  'MFA_VERIFIED',
  'REJECTION_REASON_REQUIRED',
  'WITHIN_AMENDMENT_GRACE',
] as const

export type TransitionGuardKind = (typeof TRANSITION_GUARD_KINDS)[number]

export const TRANSITION_EFFECT_KINDS = [
  'ASSIGN_REVIEWER',
  'RELEASE_REVIEWER',
  'REQUIRE_NEW_VERSION',
  'RECORD_REJECTION_REASON',
] as const

export type TransitionEffectKind = (typeof TRANSITION_EFFECT_KINDS)[number]

/**
 * Declarative transition edge. Guards and effects are evaluated by the shared evaluator.
 * `allowedRoles: null` means no role check (ownership/time/source guards may still apply).
 */
export type NoteTransitionSpec = {
  readonly from: NoteStatus
  readonly action: NoteLifecycleAction
  readonly to: NoteStatus
  readonly allowedSources: readonly TransitionSource[]
  readonly allowedRoles: readonly UserRole[] | null
  readonly guards: readonly TransitionGuardKind[]
  readonly effectKinds: readonly TransitionEffectKind[]
}

/**
 * Single source of truth for note lifecycle edges.
 * No other status/action pairs are valid.
 */
export const NOTE_TRANSITION_SPECIFICATIONS: readonly NoteTransitionSpec[] = [
  {
    from: 'GENERATING',
    action: 'GENERATION_COMPLETED',
    to: 'READY_FOR_REVIEW',
    allowedSources: ['SERVER', 'SYSTEM'],
    allowedRoles: null,
    guards: [],
    effectKinds: [],
  },
  {
    from: 'GENERATING',
    action: 'GENERATION_FAILED',
    to: 'FAILED',
    allowedSources: ['SERVER', 'SYSTEM'],
    allowedRoles: null,
    guards: [],
    effectKinds: [],
  },
  {
    from: 'FAILED',
    action: 'REGENERATE',
    to: 'GENERATING',
    allowedSources: ['USER'],
    allowedRoles: ['CLINICIAN', 'ADMIN'],
    guards: [],
    effectKinds: [],
  },
  {
    from: 'READY_FOR_REVIEW',
    action: 'START_REVIEW',
    to: 'IN_REVIEW',
    allowedSources: ['USER'],
    allowedRoles: ['REVIEWER'],
    guards: [],
    effectKinds: ['ASSIGN_REVIEWER'],
  },
  {
    from: 'IN_REVIEW',
    action: 'RETURN_TO_QUEUE',
    to: 'READY_FOR_REVIEW',
    allowedSources: ['USER'],
    allowedRoles: null,
    guards: ['ASSIGNED_REVIEWER'],
    effectKinds: ['RELEASE_REVIEWER'],
  },
  {
    from: 'IN_REVIEW',
    action: 'APPROVE',
    to: 'APPROVED',
    allowedSources: ['USER'],
    allowedRoles: ['REVIEWER'],
    guards: ['ASSIGNED_REVIEWER', 'MFA_VERIFIED'],
    effectKinds: [],
  },
  {
    from: 'IN_REVIEW',
    action: 'REJECT',
    to: 'REJECTED',
    allowedSources: ['USER'],
    allowedRoles: ['REVIEWER'],
    guards: ['ASSIGNED_REVIEWER', 'REJECTION_REASON_REQUIRED'],
    effectKinds: ['RECORD_REJECTION_REASON'],
  },
  {
    from: 'REJECTED',
    action: 'RESUBMIT',
    to: 'READY_FOR_REVIEW',
    allowedSources: ['USER'],
    allowedRoles: ['CLINICIAN'],
    guards: [],
    effectKinds: ['REQUIRE_NEW_VERSION'],
  },
  {
    from: 'APPROVED',
    action: 'AMEND',
    to: 'AMENDED',
    allowedSources: ['USER'],
    allowedRoles: null,
    guards: ['WITHIN_AMENDMENT_GRACE'],
    effectKinds: ['REQUIRE_NEW_VERSION'],
  },
  {
    from: 'APPROVED',
    action: 'GRACE_EXPIRED',
    to: 'LOCKED',
    allowedSources: ['SERVER', 'SYSTEM'],
    allowedRoles: null,
    guards: [],
    effectKinds: [],
  },
  {
    from: 'AMENDED',
    action: 'START_REVIEW',
    to: 'IN_REVIEW',
    allowedSources: ['USER'],
    allowedRoles: ['REVIEWER'],
    guards: [],
    effectKinds: ['ASSIGN_REVIEWER'],
  },
] as const

export function findTransitionSpecification(
  status: NoteStatus,
  action: NoteLifecycleAction,
): NoteTransitionSpec | null {
  for (const spec of NOTE_TRANSITION_SPECIFICATIONS) {
    if (spec.from === status && spec.action === action) {
      return spec
    }
  }

  return null
}
