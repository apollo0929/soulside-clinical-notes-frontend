import type { ClientMutationId } from '@/domain/ids'
import { parseClientMutationId } from '@/domain/ids'

export type ClientMutationIdGenerator = {
  next(): ClientMutationId
}

/**
 * Browser generator. Prefer crypto.randomUUID when available.
 */
export function createBrowserClientMutationIdGenerator(): ClientMutationIdGenerator {
  return {
    next(): ClientMutationId {
      const value =
        typeof globalThis.crypto?.randomUUID === 'function'
          ? `mut_${globalThis.crypto.randomUUID()}`
          : `mut_${Date.now().toString(36)}_${performance.now().toString(36)}`
      return parseClientMutationId(value)
    },
  }
}

/**
 * Deterministic sequence for tests: mut_test_1, mut_test_2, ...
 */
export function createDeterministicClientMutationIdGenerator(
  prefix = 'mut_test',
): ClientMutationIdGenerator {
  let sequence = 0
  return {
    next(): ClientMutationId {
      sequence += 1
      return parseClientMutationId(`${prefix}_${sequence}`)
    },
  }
}
