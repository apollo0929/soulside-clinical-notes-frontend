import type { UserRole } from '@/domain/roles'

export const ACTOR_USER_ID_HEADER = 'x-user-id'
export const ACTOR_USER_ROLE_HEADER = 'x-user-role'

/**
 * Development actor identity. Replaceable for future role switching.
 * Not authentication — headers for the mock backend only.
 */
export type ActorIdentity = {
  readonly userId: string
  readonly role: UserRole
}

/** Matches DEFAULT_SEED_CONFIG.seed in the mock seed module. */
export const DEFAULT_DEV_SEED = 42

/**
 * Fixed REVIEWER user created by the deterministic default seed.
 * ID pattern: usr_reviewer_<seed>_<index>
 */
export const DEFAULT_DEV_REVIEWER_ACTOR: ActorIdentity = Object.freeze({
  userId: `usr_reviewer_${DEFAULT_DEV_SEED}_0`,
  role: 'REVIEWER',
})

/** Admin used only for one-time development seeding. */
export const DEFAULT_DEV_ADMIN_ACTOR: ActorIdentity = Object.freeze({
  userId: `usr_admin_${DEFAULT_DEV_SEED}`,
  role: 'ADMIN',
})

let currentActor: ActorIdentity = DEFAULT_DEV_REVIEWER_ACTOR

export function getActorIdentity(): ActorIdentity {
  return currentActor
}

/**
 * Replace the active development actor. Intended for future role-switch UI.
 */
export function setActorIdentity(actor: ActorIdentity): void {
  currentActor = actor
}

export function resetActorIdentity(): void {
  currentActor = DEFAULT_DEV_REVIEWER_ACTOR
}

export function getActorHeaders(): Record<string, string> {
  const actor = getActorIdentity()
  return {
    [ACTOR_USER_ID_HEADER]: actor.userId,
    [ACTOR_USER_ROLE_HEADER]: actor.role,
  }
}

export function getAdminActorHeaders(): Record<string, string> {
  return {
    [ACTOR_USER_ID_HEADER]: DEFAULT_DEV_ADMIN_ACTOR.userId,
    [ACTOR_USER_ROLE_HEADER]: DEFAULT_DEV_ADMIN_ACTOR.role,
  }
}
