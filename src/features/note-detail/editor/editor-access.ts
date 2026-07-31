import { authorize } from '@/domain/authorization'
import type { AuthorizationActor } from '@/domain/authorization/authorization.types'
import type { NoteId, UserId } from '@/domain/ids'
import { evaluateVersionSavePolicy } from '@/domain/note-version'
import type { NoteStatus } from '@/domain/statuses'

import type { EditorAccessDecision } from './soap-editor.types'

export type EvaluateEditorAccessInput = {
  readonly actor: AuthorizationActor
  readonly noteId: NoteId
  readonly status: NoteStatus
  readonly clinicianId: UserId
  readonly assignedReviewerId: UserId | null
}

/**
 * Compose NOTE_EDIT authorization with version-save content policy.
 * Does not duplicate lifecycle/MFA/amendment-window rules.
 */
export function evaluateEditorAccess(input: EvaluateEditorAccessInput): EditorAccessDecision {
  const auth = authorize({
    permission: 'NOTE_EDIT',
    actor: input.actor,
    resource: {
      kind: 'NOTE',
      noteId: input.noteId,
      clinicianId: input.clinicianId,
      assignedReviewerId: input.assignedReviewerId,
    },
  })

  if (!auth.allowed) {
    return {
      editable: false,
      reasonCode: auth.reasonCode,
      reason: auth.reason,
    }
  }

  const isOwner = input.actor.userId === input.clinicianId
  const isAssignedReviewer =
    input.assignedReviewerId !== null && input.actor.userId === input.assignedReviewerId

  const savePolicy = evaluateVersionSavePolicy({
    status: input.status,
    actorRole: input.actor.role,
    isOwner,
    isAssignedReviewer,
  })

  if (!savePolicy.allowed) {
    return {
      editable: false,
      reasonCode: savePolicy.reasonCode,
      reason: savePolicy.reason,
    }
  }

  return { editable: true }
}

/**
 * Clinician owner is the author of the lowest revision (first version).
 */
export function resolveClinicianOwnerId(
  versions: readonly { readonly revisionNumber: number; readonly authorId: UserId }[],
  fallbackAuthorId: UserId,
): UserId {
  if (versions.length === 0) {
    return fallbackAuthorId
  }
  let oldest = versions[0]!
  for (let index = 1; index < versions.length; index += 1) {
    const candidate = versions[index]!
    if (candidate.revisionNumber < oldest.revisionNumber) {
      oldest = candidate
    }
  }
  return oldest.authorId
}
