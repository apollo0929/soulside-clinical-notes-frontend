import type { NoteStatus } from '@/domain/statuses'

export type AssignmentDecision =
  | { readonly allowed: true }
  | {
      readonly allowed: false
      readonly reasonCode: 'STATUS_NOT_ASSIGNABLE' | 'ROLE_NOT_PERMITTED'
      readonly reason: string
    }

/**
 * Pure reviewer-assignment policy.
 *
 * Status matrix (status does not change on assign):
 * - READY_FOR_REVIEW: ADMIN may assign
 * - IN_REVIEW: ADMIN may reassign
 * - AMENDED: ADMIN may assign
 * - all other statuses: denied
 *
 * Role gate is applied separately via NOTE_ASSIGN_REVIEWER / NOTE_BULK_ASSIGN_REVIEWER
 * (ADMIN only). This helper encodes the status matrix only.
 */
export function evaluateReviewerAssignment(input: {
  readonly status: NoteStatus
  readonly isAdmin: boolean
}): AssignmentDecision {
  if (!input.isAdmin) {
    return {
      allowed: false,
      reasonCode: 'ROLE_NOT_PERMITTED',
      reason: 'Only administrators may assign reviewers.',
    }
  }

  switch (input.status) {
    case 'READY_FOR_REVIEW':
    case 'IN_REVIEW':
    case 'AMENDED':
      return { allowed: true }
    default:
      return {
        allowed: false,
        reasonCode: 'STATUS_NOT_ASSIGNABLE',
        reason: 'Reviewer assignment is not available for this note.',
      }
  }
}
