import type { ClientMutationId, VersionId } from '@/domain/ids'

const DEFAULT_TTL_MS = 60_000
const DEFAULT_MAX_ENTRIES = 256

type CorrelationEntry = {
  readonly mutationId: ClientMutationId | null
  readonly versionId: VersionId | null
  readonly expiresAtMs: number
}

/**
 * Bounded TTL set of recent local save correlation keys.
 * Used to ignore self-echoed realtime version events.
 */
export class MutationCorrelationStore {
  readonly #ttlMs: number
  readonly #maxEntries: number
  readonly #now: () => number
  readonly #mutationIds = new Map<string, number>()
  readonly #versionIds = new Map<string, number>()
  readonly #order: CorrelationEntry[] = []

  constructor(
    options: {
      readonly ttlMs?: number
      readonly maxEntries?: number
      readonly now?: () => number
    } = {},
  ) {
    this.#ttlMs = options.ttlMs ?? DEFAULT_TTL_MS
    this.#maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES
    this.#now = options.now ?? (() => Date.now())
  }

  rememberLocalMutation(input: {
    readonly mutationId: ClientMutationId
    readonly versionId?: VersionId
    readonly nowMs?: number
  }): void {
    const nowMs = input.nowMs ?? this.#now()
    const expiresAtMs = nowMs + this.#ttlMs
    this.#mutationIds.set(String(input.mutationId), expiresAtMs)
    if (input.versionId) {
      this.#versionIds.set(String(input.versionId), expiresAtMs)
    }
    this.#order.push({
      mutationId: input.mutationId,
      versionId: input.versionId ?? null,
      expiresAtMs,
    })
    this.#sweep(nowMs)
  }

  isLocalMutation(key: ClientMutationId | VersionId): boolean {
    this.#sweep()
    const asString = String(key)
    const mutationExpiry = this.#mutationIds.get(asString)
    if (mutationExpiry !== undefined && mutationExpiry > this.#now()) {
      return true
    }
    const versionExpiry = this.#versionIds.get(asString)
    return versionExpiry !== undefined && versionExpiry > this.#now()
  }

  clear(): void {
    this.#mutationIds.clear()
    this.#versionIds.clear()
    this.#order.length = 0
  }

  #sweep(nowMs: number = this.#now()): void {
    while (this.#order.length > 0) {
      const head = this.#order[0]
      if (!head || head.expiresAtMs > nowMs) {
        break
      }
      this.#order.shift()
      if (head.mutationId) {
        const key = String(head.mutationId)
        if (this.#mutationIds.get(key) === head.expiresAtMs) {
          this.#mutationIds.delete(key)
        }
      }
      if (head.versionId) {
        const key = String(head.versionId)
        if (this.#versionIds.get(key) === head.expiresAtMs) {
          this.#versionIds.delete(key)
        }
      }
    }

    while (this.#order.length > this.#maxEntries) {
      const evicted = this.#order.shift()
      if (!evicted) {
        break
      }
      if (evicted.mutationId) {
        const key = String(evicted.mutationId)
        if (this.#mutationIds.get(key) === evicted.expiresAtMs) {
          this.#mutationIds.delete(key)
        }
      }
      if (evicted.versionId) {
        const key = String(evicted.versionId)
        if (this.#versionIds.get(key) === evicted.expiresAtMs) {
          this.#versionIds.delete(key)
        }
      }
    }
  }
}

let sharedCorrelation: MutationCorrelationStore | null = null

export function getMutationCorrelationStore(): MutationCorrelationStore {
  if (!sharedCorrelation) {
    sharedCorrelation = new MutationCorrelationStore()
  }
  return sharedCorrelation
}

export function rememberLocalMutation(input: {
  readonly mutationId: ClientMutationId
  readonly versionId?: VersionId
}): void {
  getMutationCorrelationStore().rememberLocalMutation(input)
}

export function isLocalMutation(key: ClientMutationId | VersionId): boolean {
  return getMutationCorrelationStore().isLocalMutation(key)
}

export function resetMutationCorrelationForTests(): void {
  sharedCorrelation?.clear()
  sharedCorrelation = null
}
