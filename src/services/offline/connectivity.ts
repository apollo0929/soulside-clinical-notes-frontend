import type { ConnectivityState } from '@/services/offline/offline.types'

export type ConnectivityClock = {
  now(): number
}

export type ConnectivityDeps = {
  readonly getNavigatorOnline?: () => boolean
  readonly addWindowListener?: (type: 'online' | 'offline', listener: () => void) => () => void
  readonly clock?: ConnectivityClock
}

/**
 * Singleton-friendly connectivity service.
 * `navigator.onLine` is only a hint — request failures may mark DEGRADED.
 */
export class ConnectivityService {
  readonly #getNavigatorOnline: () => boolean
  readonly #addWindowListener: (type: 'online' | 'offline', listener: () => void) => () => void
  #state: ConnectivityState
  #listeners = new Set<(state: ConnectivityState) => void>()
  #cleanups: Array<() => void> = []
  #started = false
  #conflictCount = 0
  #failedCount = 0
  #queuedCount = 0
  #queueSummarySnapshot: {
    readonly queued: number
    readonly conflicts: number
    readonly failed: number
  } = Object.freeze({ queued: 0, conflicts: 0, failed: 0 })

  constructor(deps: ConnectivityDeps = {}) {
    this.#getNavigatorOnline =
      deps.getNavigatorOnline ??
      (() => (typeof navigator === 'undefined' ? true : navigator.onLine))
    this.#addWindowListener =
      deps.addWindowListener ??
      ((type, listener) => {
        if (typeof window === 'undefined') {
          return () => undefined
        }
        window.addEventListener(type, listener)
        return () => window.removeEventListener(type, listener)
      })
    this.#state = this.#getNavigatorOnline() ? { kind: 'ONLINE' } : { kind: 'OFFLINE' }
  }

  start(): void {
    if (this.#started) {
      return
    }
    this.#started = true
    this.#cleanups.push(
      this.#addWindowListener('offline', () => {
        this.#setState({ kind: 'OFFLINE' })
      }),
    )
    this.#cleanups.push(
      this.#addWindowListener('online', () => {
        this.#setState({ kind: 'RECONNECTING' })
      }),
    )
  }

  stop(): void {
    for (const cleanup of this.#cleanups) {
      cleanup()
    }
    this.#cleanups = []
    this.#started = false
    this.#listeners.clear()
  }

  subscribe(listener: (state: ConnectivityState) => void): () => void {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  getSnapshot(): ConnectivityState {
    return this.#state
  }

  markOffline(): void {
    this.#setState({ kind: 'OFFLINE' })
  }

  markDegraded(reason: string): void {
    this.#setState({ kind: 'DEGRADED', reason })
  }

  markReconnecting(): void {
    this.#setState({ kind: 'RECONNECTING' })
  }

  markReplaying(remaining: number): void {
    this.#setState({ kind: 'REPLAYING', remaining })
  }

  markOnline(): void {
    this.#conflictCount = 0
    this.#failedCount = 0
    this.#queuedCount = 0
    this.#queueSummarySnapshot = Object.freeze({ queued: 0, conflicts: 0, failed: 0 })
    this.#setState({ kind: 'ONLINE' })
  }

  setQueueSummary(input: {
    readonly queued: number
    readonly conflicts: number
    readonly failed: number
  }): void {
    if (
      this.#queuedCount === input.queued &&
      this.#conflictCount === input.conflicts &&
      this.#failedCount === input.failed
    ) {
      return
    }
    this.#queuedCount = input.queued
    this.#conflictCount = input.conflicts
    this.#failedCount = input.failed
    this.#queueSummarySnapshot = Object.freeze({
      queued: input.queued,
      conflicts: input.conflicts,
      failed: input.failed,
    })
    // Notify subscribers so banner queue counts update without a connectivity kind change.
    for (const listener of this.#listeners) {
      listener(this.#state)
    }
  }

  getQueueSummary(): {
    readonly queued: number
    readonly conflicts: number
    readonly failed: number
  } {
    return this.#queueSummarySnapshot
  }

  #setState(state: ConnectivityState): void {
    this.#state = state
    for (const listener of this.#listeners) {
      listener(state)
    }
  }
}

let sharedConnectivity: ConnectivityService | null = null

export function getConnectivityService(): ConnectivityService {
  if (!sharedConnectivity) {
    sharedConnectivity = new ConnectivityService()
  }
  return sharedConnectivity
}

export function installConnectivityServiceForTests(service: ConnectivityService): void {
  sharedConnectivity?.stop()
  sharedConnectivity = service
}

export function resetConnectivityServiceForTests(): void {
  sharedConnectivity?.stop()
  sharedConnectivity = null
}
