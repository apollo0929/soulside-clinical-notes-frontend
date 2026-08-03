import type { RealtimeEventId } from '@/domain/ids'
import { parseRealtimeEventId } from '@/domain/ids'
import type { RealtimeEventDto } from '@/domain/schemas/realtime'
import type { RealtimeConnectionState } from '@/services/realtime/realtime-events'
import {
  parseRealtimeEvent,
  reportMalformedRealtimeEvent,
} from '@/services/realtime/realtime-events'
import type { RealtimeTransport } from '@/services/realtime/realtime-transport'

export const REALTIME_BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 30_000] as const

export const RECENT_EVENT_ID_CAPACITY = 256

export const LAST_EVENT_ID_STORAGE_KEY = 'soulside.realtime.lastEventId'

function readPersistedLastEventId(): RealtimeEventId | null {
  try {
    const raw = sessionStorage?.getItem(LAST_EVENT_ID_STORAGE_KEY)
    if (!raw) {
      return null
    }
    return parseRealtimeEventId(raw)
  } catch {
    return null
  }
}

function persistLastEventId(eventId: RealtimeEventId): void {
  try {
    sessionStorage?.setItem(LAST_EVENT_ID_STORAGE_KEY, String(eventId))
  } catch {
    // private mode / unavailable
  }
}

export function clearPersistedLastEventId(): void {
  try {
    sessionStorage?.removeItem(LAST_EVENT_ID_STORAGE_KEY)
  } catch {
    // private mode / unavailable
  }
}

export type RealtimeScheduler = {
  schedule(delayMs: number, work: () => void): () => void
}

export type RealtimeCoordinatorHandlers = {
  readonly onReconcile: (event: RealtimeEventDto) => void
  readonly onPresence: (event: RealtimeEventDto) => void
  readonly onResync: () => void
}

export type RealtimeCoordinatorDeps = {
  readonly transport: RealtimeTransport
  readonly connectivity: {
    subscribe(listener: (state: { readonly kind: string }) => void): () => void
    getSnapshot(): { readonly kind: string }
  }
  readonly handlers: RealtimeCoordinatorHandlers
  readonly scheduler?: RealtimeScheduler
  readonly getActorHeaders?: () => Record<string, string>
  readonly recentEventCapacity?: number
}

function defaultScheduler(): RealtimeScheduler {
  return {
    schedule(delayMs, work) {
      const handle = globalThis.setTimeout(work, delayMs)
      return () => globalThis.clearTimeout(handle)
    },
  }
}

function backoffDelay(attempt: number): number {
  const index = Math.min(attempt, REALTIME_BACKOFF_MS.length - 1)
  return REALTIME_BACKOFF_MS[index]!
}

class RecentEventIds {
  readonly #capacity: number
  readonly #ids = new Set<string>()
  readonly #order: string[] = []

  constructor(capacity: number) {
    this.#capacity = capacity
  }

  has(eventId: string): boolean {
    return this.#ids.has(eventId)
  }

  add(eventId: string): void {
    if (this.#ids.has(eventId)) {
      return
    }
    this.#ids.add(eventId)
    this.#order.push(eventId)
    while (this.#order.length > this.#capacity) {
      const evicted = this.#order.shift()
      if (evicted) {
        this.#ids.delete(evicted)
      }
    }
  }

  clear(): void {
    this.#ids.clear()
    this.#order.length = 0
  }
}

export class RealtimeCoordinator {
  readonly #deps: RealtimeCoordinatorDeps
  readonly #scheduler: RealtimeScheduler
  readonly #recentEvents: RecentEventIds
  readonly #connectionListeners = new Set<(state: RealtimeConnectionState) => void>()
  #connectionState: RealtimeConnectionState = 'DISCONNECTED'
  #lastEventId: RealtimeEventId | null = readPersistedLastEventId()
  #lastAppliedSequence = 0
  #connectAttempt = 0
  #disposed = false
  #connectAbort: AbortController | null = null
  #reconnectTimer: (() => void) | null = null
  #connectivityUnsubscribe: (() => void) | null = null
  #processing = Promise.resolve()

  constructor(deps: RealtimeCoordinatorDeps) {
    this.#deps = deps
    this.#scheduler = deps.scheduler ?? defaultScheduler()
    this.#recentEvents = new RecentEventIds(deps.recentEventCapacity ?? RECENT_EVENT_ID_CAPACITY)
  }

  start(): void {
    if (this.#disposed || this.#connectivityUnsubscribe) {
      return
    }
    this.#connectivityUnsubscribe = this.#deps.connectivity.subscribe((state) => {
      if (state.kind === 'OFFLINE') {
        this.#disconnectTransport()
        return
      }
      if (state.kind === 'ONLINE' || state.kind === 'RECONNECTING' || state.kind === 'DEGRADED') {
        this.#scheduleConnect(0)
      }
    })

    const snapshot = this.#deps.connectivity.getSnapshot()
    if (snapshot.kind !== 'OFFLINE') {
      this.#scheduleConnect(0)
    }
  }

  dispose(): void {
    this.#disposed = true
    this.#connectivityUnsubscribe?.()
    this.#connectivityUnsubscribe = null
    this.#reconnectTimer?.()
    this.#reconnectTimer = null
    this.#disconnectTransport()
    this.#connectionListeners.clear()
    this.#recentEvents.clear()
    // Drop any queued handler work; disposed checks bail out of #processEvent.
    this.#processing = Promise.resolve()
  }

  getConnectionState(): RealtimeConnectionState {
    return this.#connectionState
  }

  /** Test helper: true after dispose(). */
  isDisposed(): boolean {
    return this.#disposed
  }

  /** Test helper: whether a reconnect/backoff timer is armed. */
  hasPendingReconnectTimer(): boolean {
    return this.#reconnectTimer !== null
  }

  subscribeConnectionState(listener: (state: RealtimeConnectionState) => void): () => void {
    this.#connectionListeners.add(listener)
    return () => {
      this.#connectionListeners.delete(listener)
    }
  }

  getLastEventId(): RealtimeEventId | null {
    return this.#lastEventId
  }

  getLastAppliedSequence(): number {
    return this.#lastAppliedSequence
  }

  /** DEV/test: enqueue a validated event as if the transport delivered it. */
  injectEvent(event: RealtimeEventDto): void {
    if (this.#disposed) {
      return
    }
    this.#enqueueEvent(event)
  }

  #setConnectionState(state: RealtimeConnectionState): void {
    if (this.#connectionState === state) {
      return
    }
    this.#connectionState = state
    for (const listener of this.#connectionListeners) {
      listener(state)
    }
  }

  #scheduleConnect(delayMs: number): void {
    if (this.#disposed) {
      return
    }
    this.#reconnectTimer?.()
    this.#reconnectTimer = this.#scheduler.schedule(delayMs, () => {
      this.#reconnectTimer = null
      this.#openTransport()
    })
  }

  #openTransport(): void {
    if (this.#disposed || this.#deps.connectivity.getSnapshot().kind === 'OFFLINE') {
      return
    }

    this.#disconnectTransport(false)
    this.#setConnectionState(this.#connectAttempt === 0 ? 'CONNECTING' : 'RECONNECTING')

    const abort = new AbortController()
    this.#connectAbort = abort

    try {
      void this.#deps.transport.connect({
        lastEventId: this.#lastEventId,
        signal: abort.signal,
        ...(this.#deps.getActorHeaders ? { getActorHeaders: this.#deps.getActorHeaders } : {}),
        onStateChange: (state) => {
          if (abort.signal.aborted || this.#disposed) {
            return
          }
          this.#setConnectionState(state)
          if (state === 'CONNECTED') {
            this.#connectAttempt = 0
          }
          if (state === 'RECONNECTING' && !this.#disposed) {
            this.#connectAttempt += 1
            this.#scheduleReconnect()
          }
        },
        onEvent: (raw) => {
          this.#enqueueEvent(raw)
        },
      })
    } catch {
      this.#connectAttempt += 1
      this.#scheduleReconnect()
    }
  }

  #scheduleReconnect(): void {
    if (this.#disposed || this.#deps.connectivity.getSnapshot().kind === 'OFFLINE') {
      return
    }
    const delay = backoffDelay(this.#connectAttempt - 1)
    this.#scheduleConnect(delay)
  }

  #disconnectTransport(resetAttempt = true): void {
    this.#connectAbort?.abort()
    this.#connectAbort = null
    this.#deps.transport.disconnect?.()
    if (resetAttempt) {
      this.#connectAttempt = 0
    }
    this.#setConnectionState('DISCONNECTED')
  }

  #enqueueEvent(raw: RealtimeEventDto): void {
    this.#processing = this.#processing.then(() => this.#processEvent(raw)).catch(() => undefined)
  }

  async #processEvent(raw: RealtimeEventDto): Promise<void> {
    if (this.#disposed) {
      return
    }

    const event = parseRealtimeEvent(raw)
    if (!event) {
      reportMalformedRealtimeEvent({
        reason: 'schema_validation_failed',
        eventId: 'eventId' in raw && typeof raw.eventId === 'string' ? raw.eventId : null,
        eventType: 'eventType' in raw && typeof raw.eventType === 'string' ? raw.eventType : null,
        sequence: 'sequence' in raw && typeof raw.sequence === 'number' ? raw.sequence : null,
      })
      return
    }

    const eventId = String(event.eventId)
    if (this.#recentEvents.has(eventId)) {
      return
    }

    if (event.sequence <= this.#lastAppliedSequence) {
      this.#recentEvents.add(eventId)
      return
    }

    // Actor-filtered delivery intentionally creates sequence holes. Do not treat holes as
    // loss — only server RESYNC_REQUIRED (evicted cursor) forces a full invalidate.
    if (event.eventType === 'RESYNC_REQUIRED') {
      this.#setConnectionState('RESYNCING')
      try {
        this.#deps.handlers.onResync()
      } catch {
        // Handler failures must not stall the serial queue.
      }
      this.#recentEvents.add(eventId)
      this.#advanceCursor(event)
      return
    }

    this.#recentEvents.add(eventId)
    this.#advanceCursor(event)

    try {
      if (
        event.eventType === 'PRESENCE_JOINED' ||
        event.eventType === 'PRESENCE_UPDATED' ||
        event.eventType === 'PRESENCE_LEFT' ||
        event.eventType === 'PRESENCE_SNAPSHOT'
      ) {
        this.#deps.handlers.onPresence(event)
        return
      }

      this.#deps.handlers.onReconcile(event)
    } catch {
      // Handler failures must not stall the serial queue.
    }
  }

  #advanceCursor(event: RealtimeEventDto): void {
    this.#lastEventId = event.eventId
    if (event.sequence > this.#lastAppliedSequence) {
      this.#lastAppliedSequence = event.sequence
    }
    persistLastEventId(event.eventId)
  }
}

export function createRealtimeCoordinator(deps: RealtimeCoordinatorDeps): RealtimeCoordinator {
  return new RealtimeCoordinator(deps)
}
