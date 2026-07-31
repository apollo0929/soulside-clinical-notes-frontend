import type { Permission } from '@/domain/authorization/permissions'
import type { NoteId, UserId } from '@/domain/ids'
import type { UserRole } from '@/domain/roles'

export const AUTHORIZATION_DENIAL_REASON_CODES = [
  'ROLE_NOT_PERMITTED',
  'NOTE_OWNERSHIP_REQUIRED',
  'ASSIGNED_REVIEWER_REQUIRED',
  'RESOURCE_CONTEXT_REQUIRED',
  'READ_ONLY_ROLE',
  'PERMISSION_NOT_APPLICABLE',
] as const

export type AuthorizationDenialReasonCode = (typeof AUTHORIZATION_DENIAL_REASON_CODES)[number]

export type AuthorizationActor = {
  readonly userId: UserId
  readonly role: UserRole
}

export type NoteAuthorizationResource = {
  readonly kind: 'NOTE'
  readonly noteId: NoteId
  readonly clinicianId: UserId
  readonly assignedReviewerId: UserId | null
}

export type AuthorizeInput = {
  readonly permission: Permission
  readonly actor: AuthorizationActor
  readonly resource: NoteAuthorizationResource | null
}

export type AllowedAuthorizationDecision = {
  readonly allowed: true
  readonly permission: Permission
  readonly role: UserRole
}

export type DeniedAuthorizationDecision = {
  readonly allowed: false
  readonly permission: Permission
  readonly role: UserRole
  readonly reasonCode: AuthorizationDenialReasonCode
  readonly reason: string
}

export type AuthorizationDecision = AllowedAuthorizationDecision | DeniedAuthorizationDecision

export type ResourceRequirement = 'NONE' | 'NOTE'

export type OwnershipRule = 'NONE' | 'CLINICIAN_OWNER' | 'ASSIGNED_REVIEWER'

export type PermissionGrant = {
  readonly role: UserRole
  readonly ownershipRule: OwnershipRule
}

export type PermissionDefinition = {
  readonly permission: Permission
  readonly resourceRequirement: ResourceRequirement
  readonly mutates: boolean
  readonly grants: readonly PermissionGrant[]
}
