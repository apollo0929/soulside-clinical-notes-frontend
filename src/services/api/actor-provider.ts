import type { UserRole } from '@/domain/roles'
import { userRoleSchema } from '@/domain/schemas/primitives'

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

/**
 * First seeded clinician for development actor switching.
 * ID pattern: usr_clinician_<seed>_<index>
 */
export const DEFAULT_DEV_CLINICIAN_ACTOR: ActorIdentity = Object.freeze({
  userId: `usr_clinician_${DEFAULT_DEV_SEED}_0`,
  role: 'CLINICIAN',
})

/**
 * Seeded read-only auditor for development actor switching.
 * ID pattern: usr_auditor_<seed>
 */
export const DEFAULT_DEV_READONLY_AUDITOR_ACTOR: ActorIdentity = Object.freeze({
  userId: `usr_auditor_${DEFAULT_DEV_SEED}`,
  role: 'READONLY_AUDITOR',
})

let currentActor: ActorIdentity = DEFAULT_DEV_REVIEWER_ACTOR
const actorListeners = new Set<() => void>()

function notifyActorListeners(): void {
  for (const listener of actorListeners) {
    listener()
  }
}

/**
 * Subscribe to actor identity changes. Compatible with useSyncExternalStore.
 * Returns an unsubscribe function.
 */
export function subscribeActorIdentity(listener: () => void): () => void {
  actorListeners.add(listener)
  return () => {
    actorListeners.delete(listener)
  }
}

export function getActorIdentity(): ActorIdentity {
  return currentActor
}

/**
 * Replace the active development actor. Intended for future role-switch UI.
 *
 * Validates at runtime so that calls from the browser console (which bypass
 * TypeScript) fail immediately with a clear message instead of producing an
 * undefined userId that crashes later in parseUserId, or an invalid role.
 */
export function setActorIdentity(actor: ActorIdentity): void {
  if (!actor || typeof actor.userId !== 'string' || actor.userId.trim() === '') {
    throw new Error(
      `setActorIdentity: actor.userId must be a non-empty string (received ${JSON.stringify((actor as Record<string, unknown>)?.userId)}).`,
    )
  }
  const roleResult = userRoleSchema.safeParse(actor.role)
  if (!roleResult.success) {
    throw new Error(
      `setActorIdentity: actor.role must be one of CLINICIAN | REVIEWER | ADMIN | READONLY_AUDITOR (received ${JSON.stringify((actor as Record<string, unknown>)?.role)}).`,
    )
  }
  const next: ActorIdentity = {
    userId: actor.userId.trim(),
    role: roleResult.data,
  }
  if (currentActor.userId === next.userId && currentActor.role === next.role) {
    return
  }
  currentActor = next
  notifyActorListeners()
}

export function resetActorIdentity(): void {
  if (
    currentActor.userId === DEFAULT_DEV_REVIEWER_ACTOR.userId &&
    currentActor.role === DEFAULT_DEV_REVIEWER_ACTOR.role
  ) {
    return
  }
  currentActor = DEFAULT_DEV_REVIEWER_ACTOR
  notifyActorListeners()
}

/**
 * DEV/test hook for switching the mock actor without authentication UI.
 * Installed on globalThis in development bootstrap for Playwright.
 */
export type SoulsideActorApi = {
  setActorIdentity: typeof setActorIdentity
  getActorIdentity: typeof getActorIdentity
  resetActorIdentity: typeof resetActorIdentity
  subscribeActorIdentity: typeof subscribeActorIdentity
  DEFAULT_DEV_ADMIN_ACTOR: typeof DEFAULT_DEV_ADMIN_ACTOR
  DEFAULT_DEV_REVIEWER_ACTOR: typeof DEFAULT_DEV_REVIEWER_ACTOR
  DEFAULT_DEV_CLINICIAN_ACTOR: typeof DEFAULT_DEV_CLINICIAN_ACTOR
  DEFAULT_DEV_READONLY_AUDITOR_ACTOR: typeof DEFAULT_DEV_READONLY_AUDITOR_ACTOR
}

export function installDevActorApi(): void {
  const target = globalThis as typeof globalThis & {
    __SOULSIDE_ACTOR__?: SoulsideActorApi
  }
  target.__SOULSIDE_ACTOR__ = {
    setActorIdentity,
    getActorIdentity,
    resetActorIdentity,
    subscribeActorIdentity,
    DEFAULT_DEV_ADMIN_ACTOR,
    DEFAULT_DEV_REVIEWER_ACTOR,
    DEFAULT_DEV_CLINICIAN_ACTOR,
    DEFAULT_DEV_READONLY_AUDITOR_ACTOR,
  }
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
