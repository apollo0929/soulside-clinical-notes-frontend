export {
  getPermissionDefinition,
  PERMISSION_DEFINITIONS,
} from '@/domain/authorization/authorization.specification'
export {
  type AllowedAuthorizationDecision,
  AUTHORIZATION_DENIAL_REASON_CODES,
  type AuthorizationActor,
  type AuthorizationDecision,
  type AuthorizationDenialReasonCode,
  type AuthorizeInput,
  type DeniedAuthorizationDecision,
  type NoteAuthorizationResource,
  type OwnershipRule,
  type PermissionDefinition,
  type PermissionGrant,
  type ResourceRequirement,
} from '@/domain/authorization/authorization.types'
export {
  authorize,
  getAuthorizedPermissions,
  getPermissionDecision,
  getPermissionsForRole,
  hasPermission,
} from '@/domain/authorization/authorize'
export {
  combineAuthorizationAndLifecycle,
  type CombinedAccessDecision,
  type CombinedAllowedDecision,
  type CombinedAuthorizationDeniedDecision,
  type CombinedLifecycleDeniedDecision,
} from '@/domain/authorization/combine-decisions'
export { type Permission, PERMISSIONS } from '@/domain/authorization/permissions'
