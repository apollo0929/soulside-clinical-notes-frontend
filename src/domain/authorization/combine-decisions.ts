import type {
  AllowedAuthorizationDecision,
  AuthorizationDecision,
  DeniedAuthorizationDecision,
} from '@/domain/authorization/authorization.types'
import type {
  AllowedTransitionDecision,
  DeniedTransitionDecision,
  TransitionDecision,
} from '@/domain/note-lifecycle/transition-decision'

export type CombinedAllowedDecision = {
  readonly allowed: true
  readonly authorization: AllowedAuthorizationDecision
  readonly lifecycle: AllowedTransitionDecision
}

export type CombinedAuthorizationDeniedDecision = {
  readonly allowed: false
  readonly source: 'AUTHORIZATION'
  readonly authorization: DeniedAuthorizationDecision
  readonly lifecycle: TransitionDecision | null
}

export type CombinedLifecycleDeniedDecision = {
  readonly allowed: false
  readonly source: 'LIFECYCLE'
  readonly authorization: AllowedAuthorizationDecision
  readonly lifecycle: DeniedTransitionDecision
}

export type CombinedAccessDecision =
  CombinedAllowedDecision | CombinedAuthorizationDeniedDecision | CombinedLifecycleDeniedDecision

/**
 * Combines authorization and lifecycle decisions without collapsing reason codes.
 * Authorization denial short-circuits before lifecycle denial is returned.
 */
export function combineAuthorizationAndLifecycle(input: {
  readonly authorization: AuthorizationDecision
  readonly lifecycle: TransitionDecision
}): CombinedAccessDecision {
  if (!input.authorization.allowed) {
    return {
      allowed: false,
      source: 'AUTHORIZATION',
      authorization: input.authorization,
      lifecycle: input.lifecycle,
    }
  }

  if (!input.lifecycle.allowed) {
    return {
      allowed: false,
      source: 'LIFECYCLE',
      authorization: input.authorization,
      lifecycle: input.lifecycle,
    }
  }

  return {
    allowed: true,
    authorization: input.authorization,
    lifecycle: input.lifecycle,
  }
}
