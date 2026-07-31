import { authorize } from '@/domain/authorization'
import type { UserId } from '@/domain/ids'
import type { UserRole } from '@/domain/roles'
import type { MockDatabase } from '@/mock/database/repository'
import { createMockApiError, type MockApiError } from '@/mock/errors'
import {
  MAX_SEED_NOTE_COUNT,
  type SeedConfig,
  seedMockDatabase,
  type SeedResult,
} from '@/mock/seed/seed'

export type ActorContext = {
  readonly userId: UserId
  readonly role: UserRole
}

export type DevSeedRequest = {
  readonly count: number
  readonly seed: number
}

export type DevSeedResult =
  | { readonly ok: true; readonly result: SeedResult }
  | { readonly ok: false; readonly error: MockApiError }

/**
 * Development seed: ADMIN only via ADMIN_SIMULATION_CONTROL.
 */
export function runDevSeed(
  db: MockDatabase,
  actor: ActorContext,
  request: DevSeedRequest,
  extras: Partial<Omit<SeedConfig, 'seed' | 'noteCount'>> = {},
): DevSeedResult {
  const auth = authorize({
    permission: 'ADMIN_SIMULATION_CONTROL',
    actor: { userId: actor.userId, role: actor.role },
    resource: null,
  })

  if (!auth.allowed) {
    return {
      ok: false,
      error: createMockApiError({
        code: 'FORBIDDEN',
        status: 403,
        message: auth.reason,
        details: { reasonCode: auth.reasonCode },
      }),
    }
  }

  if (!Number.isInteger(request.count) || request.count < 0) {
    return {
      ok: false,
      error: createMockApiError({
        code: 'INVALID_REQUEST',
        status: 400,
        message: 'count must be a non-negative integer',
      }),
    }
  }

  if (request.count > MAX_SEED_NOTE_COUNT) {
    return {
      ok: false,
      error: createMockApiError({
        code: 'INVALID_REQUEST',
        status: 400,
        message: `count cannot exceed ${MAX_SEED_NOTE_COUNT}`,
      }),
    }
  }

  if (!Number.isInteger(request.seed)) {
    return {
      ok: false,
      error: createMockApiError({
        code: 'INVALID_REQUEST',
        status: 400,
        message: 'seed must be an integer',
      }),
    }
  }

  const result = seedMockDatabase(db, {
    ...extras,
    seed: request.seed,
    noteCount: request.count,
  })

  return { ok: true, result }
}
