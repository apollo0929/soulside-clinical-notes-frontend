import { evaluateNoteTransition } from '@/domain/note-lifecycle/evaluate-transition'
import { NOTE_LIFECYCLE_ACTIONS } from '@/domain/note-lifecycle/note-actions'
import type { NoteTransitionContext } from '@/domain/note-lifecycle/transition-context'
import type { TransitionDecision } from '@/domain/note-lifecycle/transition-decision'
import type { TransitionSource } from '@/domain/note-lifecycle/transition-source'
import type { NoteStatus } from '@/domain/statuses'

export type GetAvailableActionsInput = {
  readonly status: NoteStatus
  readonly source: TransitionSource
  readonly context: NoteTransitionContext
}

/**
 * Returns a decision for every lifecycle action using the shared evaluator.
 * Callers should filter on `allowed` rather than re-implementing guards.
 */
export function getAvailableActions(
  input: GetAvailableActionsInput,
): readonly TransitionDecision[] {
  return NOTE_LIFECYCLE_ACTIONS.map((action) =>
    evaluateNoteTransition({
      status: input.status,
      action,
      source: input.source,
      context: input.context,
    }),
  )
}

export function getAllowedAvailableActions(
  input: GetAvailableActionsInput,
): readonly TransitionDecision[] {
  return getAvailableActions(input).filter((decision) => decision.allowed)
}
