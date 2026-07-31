import type {
  PermissionDefinition,
  PermissionGrant,
} from '@/domain/authorization/authorization.types'
import type { Permission } from '@/domain/authorization/permissions'
import { PERMISSIONS } from '@/domain/authorization/permissions'
import type { UserRole } from '@/domain/roles'

function grants(
  ...entries: readonly (readonly [UserRole, PermissionGrant['ownershipRule']])[]
): readonly PermissionGrant[] {
  return entries.map(([role, ownershipRule]) => ({ role, ownershipRule }))
}

/**
 * Single declarative source of truth for role grants and ownership rules.
 * Transition-specific checks (status, MFA, assigned-reviewer for approve/reject/return,
 * amendment window, rejection reason) remain in the lifecycle evaluator.
 */
const permissionDefinitions: PermissionDefinition[] = [
  {
    permission: 'NOTES_VIEW',
    resourceRequirement: 'NONE',
    mutates: false,
    grants: grants(
      ['CLINICIAN', 'NONE'],
      ['REVIEWER', 'NONE'],
      ['ADMIN', 'NONE'],
      ['READONLY_AUDITOR', 'NONE'],
    ),
  },
  {
    permission: 'NOTE_CONTENT_VIEW',
    resourceRequirement: 'NOTE',
    mutates: false,
    grants: grants(
      ['CLINICIAN', 'NONE'],
      ['REVIEWER', 'NONE'],
      ['ADMIN', 'NONE'],
      ['READONLY_AUDITOR', 'NONE'],
    ),
  },
  {
    permission: 'NOTE_HISTORY_VIEW',
    resourceRequirement: 'NOTE',
    mutates: false,
    grants: grants(
      ['CLINICIAN', 'NONE'],
      ['REVIEWER', 'NONE'],
      ['ADMIN', 'NONE'],
      ['READONLY_AUDITOR', 'NONE'],
    ),
  },
  {
    permission: 'REVIEW_EVENTS_VIEW',
    resourceRequirement: 'NOTE',
    mutates: false,
    grants: grants(
      ['CLINICIAN', 'NONE'],
      ['REVIEWER', 'NONE'],
      ['ADMIN', 'NONE'],
      ['READONLY_AUDITOR', 'NONE'],
    ),
  },
  {
    permission: 'NOTE_EDIT',
    resourceRequirement: 'NOTE',
    mutates: true,
    grants: grants(
      ['CLINICIAN', 'CLINICIAN_OWNER'],
      ['REVIEWER', 'ASSIGNED_REVIEWER'],
      ['ADMIN', 'NONE'],
    ),
  },
  {
    permission: 'REVIEW_START',
    resourceRequirement: 'NOTE',
    mutates: true,
    grants: grants(['REVIEWER', 'NONE']),
  },
  {
    permission: 'REVIEW_RETURN',
    resourceRequirement: 'NOTE',
    mutates: true,
    grants: grants(['REVIEWER', 'NONE']),
  },
  {
    permission: 'REVIEW_APPROVE',
    resourceRequirement: 'NOTE',
    mutates: true,
    grants: grants(['REVIEWER', 'NONE']),
  },
  {
    permission: 'REVIEW_REJECT',
    resourceRequirement: 'NOTE',
    mutates: true,
    grants: grants(['REVIEWER', 'NONE']),
  },
  {
    permission: 'NOTE_RESUBMIT',
    resourceRequirement: 'NOTE',
    mutates: true,
    grants: grants(['CLINICIAN', 'CLINICIAN_OWNER']),
  },
  {
    permission: 'NOTE_REGENERATE',
    resourceRequirement: 'NOTE',
    mutates: true,
    grants: grants(['CLINICIAN', 'CLINICIAN_OWNER'], ['ADMIN', 'NONE']),
  },
  {
    permission: 'NOTE_AMEND',
    resourceRequirement: 'NOTE',
    mutates: true,
    grants: grants(['CLINICIAN', 'CLINICIAN_OWNER'], ['ADMIN', 'NONE']),
  },
  {
    permission: 'NOTE_ASSIGN_REVIEWER',
    resourceRequirement: 'NOTE',
    mutates: true,
    grants: grants(['ADMIN', 'NONE']),
  },
  {
    permission: 'NOTE_BULK_ASSIGN_REVIEWER',
    resourceRequirement: 'NONE',
    mutates: true,
    grants: grants(['ADMIN', 'NONE']),
  },
  {
    permission: 'NOTE_BULK_REGENERATE',
    resourceRequirement: 'NONE',
    mutates: true,
    grants: grants(['ADMIN', 'NONE']),
  },
  {
    permission: 'ADMIN_SIMULATION_CONTROL',
    resourceRequirement: 'NONE',
    mutates: true,
    grants: grants(['ADMIN', 'NONE']),
  },
]

function freezePermissionDefinitions(
  definitions: readonly PermissionDefinition[],
): readonly PermissionDefinition[] {
  return Object.freeze(
    definitions.map((definition) =>
      Object.freeze({
        permission: definition.permission,
        resourceRequirement: definition.resourceRequirement,
        mutates: definition.mutates,
        grants: Object.freeze(
          definition.grants.map((grant) =>
            Object.freeze({
              role: grant.role,
              ownershipRule: grant.ownershipRule,
            }),
          ),
        ),
      }),
    ),
  )
}

export const PERMISSION_DEFINITIONS = freezePermissionDefinitions(permissionDefinitions)

const definitionByPermission = new Map<Permission, PermissionDefinition>(
  PERMISSION_DEFINITIONS.map((definition) => [definition.permission, definition]),
)

export function getPermissionDefinition(permission: Permission): PermissionDefinition {
  const definition = definitionByPermission.get(permission)
  if (definition === undefined) {
    throw new Error(`Missing permission definition for ${permission}`)
  }
  return definition
}

/** Compile-time/runtime guard that every permission has exactly one definition. */
export function assertPermissionDefinitionsComplete(): void {
  for (const permission of PERMISSIONS) {
    getPermissionDefinition(permission)
  }

  if (PERMISSION_DEFINITIONS.length !== PERMISSIONS.length) {
    throw new Error('Permission definitions must match the permission catalog one-to-one')
  }
}

assertPermissionDefinitionsComplete()
