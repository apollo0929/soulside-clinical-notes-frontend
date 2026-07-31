import type {
  AuthorizationActor,
  NoteAuthorizationResource,
} from '@/domain/authorization/authorization.types'
import { type NoteId, parseNoteId, parseUserId, type UserId } from '@/domain/ids'
import type { UserRole } from '@/domain/roles'

export function buildAuthorizationActor(
  overrides: {
    userId?: UserId
    role?: UserRole
  } = {},
): AuthorizationActor {
  return {
    userId: overrides.userId ?? parseUserId('usr_actor_1'),
    role: overrides.role ?? 'CLINICIAN',
  }
}

export function buildNoteAuthorizationResource(
  overrides: {
    noteId?: NoteId
    clinicianId?: UserId
    assignedReviewerId?: UserId | null
  } = {},
): NoteAuthorizationResource {
  return {
    kind: 'NOTE',
    noteId: overrides.noteId ?? parseNoteId('note_auth_1'),
    clinicianId: overrides.clinicianId ?? parseUserId('usr_clinician_1'),
    assignedReviewerId:
      overrides.assignedReviewerId === undefined
        ? parseUserId('usr_reviewer_1')
        : overrides.assignedReviewerId,
  }
}
