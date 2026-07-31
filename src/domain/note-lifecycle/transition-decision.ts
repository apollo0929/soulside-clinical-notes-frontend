import type { NoteLifecycleAction } from '@/domain/note-lifecycle/note-actions'
import type { TransitionEffect } from '@/domain/note-lifecycle/transition-effects'
import type { NoteStatus } from '@/domain/statuses'

export const TRANSITION_DENIAL_REASON_CODES = [
  'INVALID_TRANSITION',
  'INVALID_SOURCE',
  'ROLE_NOT_ALLOWED',
  'NOT_ASSIGNED_REVIEWER',
  'MFA_REQUIRED',
  'REJECTION_REASON_REQUIRED',
  'APPROVAL_TIMESTAMP_REQUIRED',
  'AMENDMENT_GRACE_EXPIRED',
  'INVALID_TIME_RANGE',
] as const

export type TransitionDenialReasonCode = (typeof TRANSITION_DENIAL_REASON_CODES)[number]

export type AllowedTransitionDecision = {
  readonly allowed: true
  readonly action: NoteLifecycleAction
  readonly fromStatus: NoteStatus
  readonly toStatus: NoteStatus
  readonly effects: readonly TransitionEffect[]
}

export type DeniedTransitionDecision = {
  readonly allowed: false
  readonly action: NoteLifecycleAction
  readonly fromStatus: NoteStatus
  readonly reasonCode: TransitionDenialReasonCode
  readonly reason: string
}

export type TransitionDecision = AllowedTransitionDecision | DeniedTransitionDecision
