import type { UserRole } from '@/domain/roles'
import type { NoteStatus } from '@/domain/statuses'

export const VERSION_SAVE_DENIAL_REASON_CODES = [
  'STATUS_NOT_EDITABLE',
  'ROLE_NOT_ALLOWED_TO_EDIT',
  'NOTE_OWNERSHIP_REQUIRED',
  'ASSIGNED_REVIEWER_REQUIRED',
] as const

export type VersionSaveDenialReasonCode = (typeof VERSION_SAVE_DENIAL_REASON_CODES)[number]

export type VersionSaveDecision =
  | { readonly allowed: true }
  | {
      readonly allowed: false
      readonly reasonCode: VersionSaveDenialReasonCode
      readonly reason: string
    }

export type EvaluateVersionSavePolicyInput = {
  readonly status: NoteStatus
  readonly actorRole: UserRole
  readonly isOwner: boolean
  readonly isAssignedReviewer: boolean
}

/**
 * Content-editability policy distinct from lifecycle transitions.
 *
 * Editable statuses: IN_REVIEW, REJECTED, AMENDED.
 * - IN_REVIEW: assigned reviewer (or ADMIN) may save
 * - REJECTED: owning clinician (or ADMIN) may save a resubmission draft
 * - AMENDED: owning clinician (or ADMIN) may save amendment content
 *
 * GENERATING, FAILED, READY_FOR_REVIEW, APPROVED, LOCKED: not editable.
 */
export function evaluateVersionSavePolicy(
  input: EvaluateVersionSavePolicyInput,
): VersionSaveDecision {
  switch (input.status) {
    case 'IN_REVIEW': {
      if (input.actorRole === 'ADMIN') {
        return { allowed: true }
      }
      if (input.actorRole === 'REVIEWER') {
        if (!input.isAssignedReviewer) {
          return deny(
            'ASSIGNED_REVIEWER_REQUIRED',
            'Only the assigned reviewer can save content while the note is in review.',
          )
        }
        return { allowed: true }
      }
      return deny(
        'ROLE_NOT_ALLOWED_TO_EDIT',
        'Only the assigned reviewer can save content while the note is in review.',
      )
    }
    case 'REJECTED':
    case 'AMENDED': {
      if (input.actorRole === 'ADMIN') {
        return { allowed: true }
      }
      if (input.actorRole === 'CLINICIAN') {
        if (!input.isOwner) {
          return deny(
            'NOTE_OWNERSHIP_REQUIRED',
            'Only the owning clinician can save content for this note status.',
          )
        }
        return { allowed: true }
      }
      return deny(
        'ROLE_NOT_ALLOWED_TO_EDIT',
        'Only the owning clinician can save content for this note status.',
      )
    }
    case 'GENERATING':
    case 'FAILED':
    case 'READY_FOR_REVIEW':
    case 'APPROVED':
    case 'LOCKED':
      return deny(
        'STATUS_NOT_EDITABLE',
        `Content cannot be saved while the note is ${input.status}.`,
      )
    default: {
      const _exhaustive: never = input.status
      return _exhaustive
    }
  }
}

function deny(reasonCode: VersionSaveDenialReasonCode, reason: string): VersionSaveDecision {
  return { allowed: false, reasonCode, reason }
}
