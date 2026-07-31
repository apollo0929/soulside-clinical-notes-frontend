export {
  getAllowedAvailableActions,
  getAvailableActions,
  type GetAvailableActionsInput,
} from '@/domain/note-lifecycle/available-actions'
export {
  canTransition,
  evaluateNoteTransition,
  getTransitionDecision,
  isTransitionAllowed,
} from '@/domain/note-lifecycle/evaluate-transition'
export {
  NOTE_LIFECYCLE_ACTIONS,
  type NoteLifecycleAction,
} from '@/domain/note-lifecycle/note-actions'
export {
  AMENDMENT_GRACE_PERIOD_MS,
  denialReasonMessage,
  normalizeRejectionReason,
  type NoteTransitionContext,
  type NoteTransitionInput,
  toEpochMilliseconds,
} from '@/domain/note-lifecycle/transition-context'
export {
  type AllowedTransitionDecision,
  type DeniedTransitionDecision,
  TRANSITION_DENIAL_REASON_CODES,
  type TransitionDecision,
  type TransitionDenialReasonCode,
} from '@/domain/note-lifecycle/transition-decision'
export type {
  AssignReviewerEffect,
  RecordRejectionReasonEffect,
  ReleaseReviewerEffect,
  RequireNewVersionEffect,
  TransitionEffect,
} from '@/domain/note-lifecycle/transition-effects'
export {
  TRANSITION_SOURCES,
  type TransitionSource,
} from '@/domain/note-lifecycle/transition-source'
export {
  findTransitionSpecification,
  NOTE_TRANSITION_SPECIFICATIONS,
  type NoteTransitionSpec,
  TRANSITION_EFFECT_KINDS,
  TRANSITION_GUARD_KINDS,
  type TransitionEffectKind,
  type TransitionGuardKind,
} from '@/domain/note-lifecycle/transition-specification'
