import { getPermissionDefinition } from '@/domain/authorization/authorization.specification'
import type {
  AuthorizationActor,
  AuthorizationDecision,
  AuthorizationDenialReasonCode,
  AuthorizeInput,
  NoteAuthorizationResource,
  OwnershipRule,
  PermissionDefinition,
} from '@/domain/authorization/authorization.types'
import { type Permission, PERMISSIONS } from '@/domain/authorization/permissions'
import type { UserRole } from '@/domain/roles'

function denialMessage(reasonCode: AuthorizationDenialReasonCode, permission: Permission): string {
  switch (reasonCode) {
    case 'ROLE_NOT_PERMITTED':
      return 'Your role does not permit this action.'
    case 'NOTE_OWNERSHIP_REQUIRED':
      if (permission === 'NOTE_EDIT') {
        return 'Only the clinician who owns this note can edit it.'
      }
      if (permission === 'NOTE_RESUBMIT') {
        return 'Only the clinician who owns this note can resubmit it.'
      }
      if (permission === 'NOTE_REGENERATE') {
        return 'Only the clinician who owns this note can regenerate it.'
      }
      if (permission === 'NOTE_AMEND') {
        return 'Only the clinician who owns this note can amend it.'
      }
      return 'Only the clinician who owns this note can perform this action.'
    case 'ASSIGNED_REVIEWER_REQUIRED':
      return 'Only the assigned reviewer can edit this note.'
    case 'RESOURCE_CONTEXT_REQUIRED':
      return 'This operation requires note context.'
    case 'READ_ONLY_ROLE':
      return 'Read-only auditors cannot modify notes.'
    case 'PERMISSION_NOT_APPLICABLE':
      return 'This permission is not applicable for the current request.'
    default: {
      const _exhaustive: never = reasonCode
      return _exhaustive
    }
  }
}

function deny(
  input: AuthorizeInput,
  reasonCode: AuthorizationDenialReasonCode,
): AuthorizationDecision {
  return {
    allowed: false,
    permission: input.permission,
    role: input.actor.role,
    reasonCode,
    reason: denialMessage(reasonCode, input.permission),
  }
}

function allow(input: AuthorizeInput): AuthorizationDecision {
  return {
    allowed: true,
    permission: input.permission,
    role: input.actor.role,
  }
}

function findGrant(definition: PermissionDefinition, role: UserRole) {
  for (const grant of definition.grants) {
    if (grant.role === role) {
      return grant
    }
  }
  return null
}

function evaluateOwnership(
  rule: OwnershipRule,
  actor: AuthorizationActor,
  resource: NoteAuthorizationResource,
): AuthorizationDenialReasonCode | null {
  switch (rule) {
    case 'NONE':
      return null
    case 'CLINICIAN_OWNER':
      return actor.userId === resource.clinicianId ? null : 'NOTE_OWNERSHIP_REQUIRED'
    case 'ASSIGNED_REVIEWER':
      if (resource.assignedReviewerId === null || actor.userId !== resource.assignedReviewerId) {
        return 'ASSIGNED_REVIEWER_REQUIRED'
      }
      return null
    default: {
      const _exhaustive: never = rule
      return _exhaustive
    }
  }
}

/**
 * Pure authorization evaluator.
 * Confirms role permission and general resource ownership only — not lifecycle validity.
 */
export function authorize(input: AuthorizeInput): AuthorizationDecision {
  const definition = getPermissionDefinition(input.permission)
  const grant = findGrant(definition, input.actor.role)

  if (grant === null) {
    if (input.actor.role === 'READONLY_AUDITOR' && definition.mutates) {
      return deny(input, 'READ_ONLY_ROLE')
    }
    return deny(input, 'ROLE_NOT_PERMITTED')
  }

  if (definition.resourceRequirement === 'NONE') {
    return allow(input)
  }

  if (input.resource === null) {
    return deny(input, 'RESOURCE_CONTEXT_REQUIRED')
  }

  const ownershipDenial = evaluateOwnership(grant.ownershipRule, input.actor, input.resource)
  if (ownershipDenial !== null) {
    return deny(input, ownershipDenial)
  }

  return allow(input)
}

export function hasPermission(input: AuthorizeInput): boolean {
  return authorize(input).allowed
}

export function getPermissionDecision(input: AuthorizeInput): AuthorizationDecision {
  return authorize(input)
}

/**
 * Role-level catalog only. Resource ownership still requires `authorize`.
 */
export function getPermissionsForRole(role: UserRole): readonly Permission[] {
  return PERMISSIONS.filter((permission) => {
    const definition = getPermissionDefinition(permission)
    return findGrant(definition, role) !== null
  })
}

/**
 * Evaluates every permission for the actor (with optional note resource).
 * Suitable for future route/component/action guard surfaces.
 */
export function getAuthorizedPermissions(
  actor: AuthorizationActor,
  resource: NoteAuthorizationResource | null,
): readonly AuthorizationDecision[] {
  return PERMISSIONS.map((permission) =>
    authorize({
      permission,
      actor,
      resource,
    }),
  )
}
