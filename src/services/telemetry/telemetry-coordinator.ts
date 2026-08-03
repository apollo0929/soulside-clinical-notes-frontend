import { parseIsoDateTime } from '@/domain/datetime'
import type { TelemetryBatchId } from '@/domain/ids'
import type { TelemetryEvent } from '@/domain/schemas/telemetry'
import { isApiClientError, isNetworkApiError } from '@/services/api/api-errors'
import type { ConnectivityService } from '@/services/offline/connectivity'
import type { StoredTelemetryBatch } from '@/services/telemetry/telemetry.types'
import type { TelemetryTransport } from '@/services/telemetry/telemetry-api'
import {
  createBrowserTelemetryBatchIdGenerator,
  fingerprintTelemetryBatch,
} from '@/services/telemetry/telemetry-batch-id'
import type { TelemetryClient, TelemetryDiagnostics } from '@/services/telemetry/telemetry-client'
import {
  CRITICAL_TELEMETRY_EVENT_NAMES,
  TELEMETRY_BACKOFF_MS,
  TELEMETRY_BATCH_SIZE,
  TELEMETRY_FLUSH_INTERVAL_MS,
  TELEMETRY_MAX_DELIVERY_ATTEMPTS,
  TELEMETRY_MAX_IN_MEMORY_EVENTS,
  type TelemetryFlushReason,
} from '@/services/telemetry/telemetry-constants'
import { redactTelemetryEvent } from '@/services/telemetry/telemetry-redaction'
import type { TelemetryBatchRepository } from '@/services/telemetry/telemetry-repository'

export type TelemetryScheduler = {
  schedule(delayMs: number, work: () => void): () => void
  interval(delayMs: number, work: () => void): () => void
}

export type TelemetryCoordinatorDeps = {
  readonly transport: TelemetryTransport
  readonly repository: TelemetryBatchRepository
  readonly connectivity: ConnectivityService
  readonly scheduler?: TelemetryScheduler
  readonly batchSize?: number
  readonly flushIntervalMs?: number
  readonly maxInMemoryEvents?: number
  readonly maxDeliveryAttempts?: number
  readonly nextBatchId?: () => TelemetryBatchId
  readonly now?: () => ReturnType<typeof parseIsoDateTime>
}

function defaultScheduler(): TelemetryScheduler {
  return {
    schedule(delayMs, work) {
      const handle = globalThis.setTimeout(work, delayMs)
      return () => globalThis.clearTimeout(handle)
    },
    interval(delayMs, work) {
      const handle = globalThis.setInterval(work, delayMs)
      return () => globalThis.clearInterval(handle)
    },
  }
}

function backoffDelay(attempt: number): number {
  const index = Math.min(Math.max(attempt, 0), TELEMETRY_BACKOFF_MS.length - 1)
  return TELEMETRY_BACKOFF_MS[index]!
}

function isTransientDeliveryError(error: unknown): boolean {
  if (isNetworkApiError(error)) {
    return true
  }
  if (isApiClientError(error)) {
    return error.status >= 500 || error.status === 0
  }
  return false
}

function isFatalDeliveryError(error: unknown): boolean {
  if (isApiClientError(error)) {
    return error.status === 400 || error.status === 403
  }
  return false
}

type InFlightBatch = {
  readonly batchId: TelemetryBatchId
  readonly events: readonly TelemetryEvent[]
  readonly fingerprint: string
  readonly createdAt: ReturnType<typeof parseIsoDateTime>
  retryCount: number
}

type DeliveryOutcome = 'delivered' | 'deferred' | 'dropped'

/**
 * Batches, redacts, delivers, and persists privacy-safe telemetry.
 * Never throws into callers of `track`. Never mutates connectivity to OFFLINE.
 */
export class TelemetryCoordinator implements TelemetryClient {
  readonly #deps: TelemetryCoordinatorDeps
  readonly #scheduler: TelemetryScheduler
  readonly #batchSize: number
  readonly #maxInMemory: number
  readonly #maxAttempts: number
  readonly #nextBatchId: () => TelemetryBatchId
  readonly #now: () => ReturnType<typeof parseIsoDateTime>

  #buffer: TelemetryEvent[] = []
  #droppedEvents = 0
  #disposed = false
  #started = false
  #flushInFlight: Promise<void> | null = null
  #followUpFlush = false
  #retryTimer: (() => void) | null = null
  #intervalStop: (() => void) | null = null
  #connectivityUnsub: (() => void) | null = null
  #pagehideUnsub: (() => void) | null = null
  #visibilityUnsub: (() => void) | null = null
  #inFlight: InFlightBatch | null = null

  constructor(deps: TelemetryCoordinatorDeps) {
    this.#deps = deps
    this.#scheduler = deps.scheduler ?? defaultScheduler()
    this.#batchSize = deps.batchSize ?? TELEMETRY_BATCH_SIZE
    this.#maxInMemory = deps.maxInMemoryEvents ?? TELEMETRY_MAX_IN_MEMORY_EVENTS
    this.#maxAttempts = deps.maxDeliveryAttempts ?? TELEMETRY_MAX_DELIVERY_ATTEMPTS
    this.#nextBatchId = deps.nextBatchId ?? createBrowserTelemetryBatchIdGenerator().next
    this.#now = deps.now ?? (() => parseIsoDateTime(new Date().toISOString()))
  }

  start(): void {
    if (this.#disposed || this.#started) {
      return
    }
    this.#started = true

    this.#intervalStop = this.#scheduler.interval(
      this.#deps.flushIntervalMs ?? TELEMETRY_FLUSH_INTERVAL_MS,
      () => {
        void this.flush('interval').catch(() => undefined)
      },
    )

    this.#connectivityUnsub = this.#deps.connectivity.subscribe((state) => {
      if (state.kind === 'ONLINE' || state.kind === 'RECONNECTING' || state.kind === 'DEGRADED') {
        void this.flush('online').catch(() => undefined)
      }
    })

    if (typeof document !== 'undefined') {
      const onVisibility = () => {
        if (document.visibilityState === 'hidden') {
          void this.#persistBufferOnly()
        }
      }
      document.addEventListener('visibilitychange', onVisibility)
      this.#visibilityUnsub = () => document.removeEventListener('visibilitychange', onVisibility)
    }

    if (typeof window !== 'undefined') {
      const onPageHide = () => {
        void this.#persistBufferOnly()
      }
      window.addEventListener('pagehide', onPageHide)
      this.#pagehideUnsub = () => window.removeEventListener('pagehide', onPageHide)
    }

    void this.#restoreAndFlush()
  }

  track(event: TelemetryEvent): void {
    if (this.#disposed) {
      return
    }
    try {
      const redacted = redactTelemetryEvent(event)
      if (!redacted.ok) {
        this.#droppedEvents += 1
        return
      }
      this.#append(redacted.event)
      if (this.#buffer.length >= this.#batchSize) {
        void this.flush('batch_size').catch(() => undefined)
      }
    } catch {
      this.#droppedEvents += 1
    }
  }

  async flush(reason: TelemetryFlushReason): Promise<void> {
    if (this.#disposed) {
      return
    }
    if (reason === 'pagehide') {
      await this.#persistBufferOnly()
      return
    }
    if (this.#flushInFlight) {
      this.#followUpFlush = true
      return this.#flushInFlight
    }
    this.#flushInFlight = this.#runFlush(reason)
      .catch(() => undefined)
      .finally(() => {
        this.#flushInFlight = null
        if (this.#followUpFlush && !this.#disposed) {
          this.#followUpFlush = false
          void this.flush('manual').catch(() => undefined)
        }
      })
    return this.#flushInFlight
  }

  async dispose(): Promise<void> {
    if (this.#disposed) {
      return
    }
    this.#disposed = true
    this.#retryTimer?.()
    this.#retryTimer = null
    this.#intervalStop?.()
    this.#intervalStop = null
    this.#connectivityUnsub?.()
    this.#connectivityUnsub = null
    this.#pagehideUnsub?.()
    this.#pagehideUnsub = null
    this.#visibilityUnsub?.()
    this.#visibilityUnsub = null
    await this.#persistBufferOnly()
  }

  getDiagnostics(): TelemetryDiagnostics {
    return {
      droppedEvents: this.#droppedEvents,
      bufferedEvents: this.#buffer.length,
      pendingStoredBatches: 0,
    }
  }

  /** Test helper: current in-memory buffer length. */
  getBufferedEventCount(): number {
    return this.#buffer.length
  }

  getDroppedEventCount(): number {
    return this.#droppedEvents
  }

  #append(event: TelemetryEvent): void {
    this.#buffer.push(event)
    while (this.#buffer.length > this.#maxInMemory) {
      const dropIndex = this.#buffer.findIndex(
        (candidate) => !CRITICAL_TELEMETRY_EVENT_NAMES.has(candidate.eventName),
      )
      if (dropIndex >= 0) {
        this.#buffer.splice(dropIndex, 1)
      } else {
        this.#buffer.shift()
      }
      this.#droppedEvents += 1
    }
  }

  async #restoreAndFlush(): Promise<void> {
    try {
      await this.#deps.repository.requeueInterruptedSending()
      if (this.#deps.connectivity.getSnapshot().kind === 'OFFLINE') {
        return
      }
      await this.flush('startup')
    } catch {
      // best-effort
    }
  }

  async #persistBufferOnly(): Promise<void> {
    if (this.#buffer.length === 0 && !this.#inFlight) {
      return
    }
    try {
      if (this.#inFlight) {
        await this.#deps.repository.upsertPending(this.#toStored(this.#inFlight))
      }
      if (this.#buffer.length > 0) {
        const events = this.#buffer.splice(0, this.#buffer.length)
        const batch = this.#createBatch(events, 0)
        await this.#deps.repository.upsertPending(this.#toStored(batch))
      }
    } catch {
      // best-effort persistence
    }
  }

  async #runFlush(_reason: TelemetryFlushReason): Promise<void> {
    if (this.#deps.connectivity.getSnapshot().kind === 'OFFLINE') {
      await this.#persistBufferOnly()
      return
    }

    // Prefer draining persisted batches first (reconnect / startup).
    const pending = await this.#deps.repository.listPendingOldestFirst(1)
    if (pending.length > 0) {
      await this.#deliverStored(pending[0]!)
      if (this.#buffer.length >= this.#batchSize || this.#buffer.length > 0) {
        this.#followUpFlush = true
      }
      return
    }

    if (this.#buffer.length === 0) {
      return
    }

    const take = Math.min(this.#batchSize, this.#buffer.length)
    const events = this.#buffer.splice(0, take)
    const batch = this.#createBatch(events, 0)
    this.#inFlight = batch

    try {
      const outcome = await this.#deliverInFlight()
      if (outcome === 'delivered' || outcome === 'dropped') {
        // Clear any pagehide-persisted copy of this exact batch.
        await this.#deps.repository.remove(batch.batchId).catch(() => undefined)
      }
    } finally {
      this.#inFlight = null
    }
  }

  async #deliverStored(stored: StoredTelemetryBatch): Promise<void> {
    const batch: InFlightBatch = {
      batchId: stored.batchId,
      events: stored.events,
      fingerprint: stored.fingerprint,
      createdAt: stored.createdAt,
      retryCount: stored.retryCount,
    }
    this.#inFlight = batch
    try {
      await this.#deps.repository.markSending(batch.batchId)
      const outcome = await this.#deliverInFlight()
      if (outcome === 'delivered' || outcome === 'dropped') {
        await this.#deps.repository.remove(batch.batchId)
        return
      }
      await this.#deps.repository.markPending(batch.batchId, batch.retryCount)
      if (batch.retryCount > stored.retryCount) {
        this.#scheduleRetry(batch.retryCount)
      }
    } catch (error) {
      if (isFatalDeliveryError(error)) {
        await this.#deps.repository.remove(batch.batchId)
        this.#droppedEvents += batch.events.length
        return
      }
      const nextRetry = batch.retryCount + 1
      batch.retryCount = nextRetry
      await this.#deps.repository.markPending(batch.batchId, nextRetry)
      if (isTransientDeliveryError(error)) {
        this.#scheduleRetry(nextRetry)
      }
    } finally {
      this.#inFlight = null
    }
  }

  async #deliverInFlight(): Promise<DeliveryOutcome> {
    const batch = this.#inFlight
    if (!batch) {
      return 'dropped'
    }

    // Each flush session gets up to maxAttempts tries. retryCount accumulates across
    // sessions for backoff and diagnostics; it must not permanently block later flushes.
    for (let sessionAttempt = 0; sessionAttempt < this.#maxAttempts; sessionAttempt += 1) {
      if (this.#disposed || this.#deps.connectivity.getSnapshot().kind === 'OFFLINE') {
        await this.#deps.repository.upsertPending(this.#toStored(batch))
        return 'deferred'
      }
      try {
        await this.#deps.transport.sendBatch({
          batchId: batch.batchId,
          createdAt: batch.createdAt,
          events: [...batch.events],
        })
        return 'delivered'
      } catch (error) {
        if (isFatalDeliveryError(error)) {
          this.#droppedEvents += batch.events.length
          return 'dropped'
        }
        batch.retryCount += 1
        const exhausted = sessionAttempt + 1 >= this.#maxAttempts
        if (exhausted || !isTransientDeliveryError(error)) {
          await this.#deps.repository.upsertPending(this.#toStored(batch))
          return 'deferred'
        }
        await this.#wait(
          backoffDelay(Math.min(batch.retryCount - 1, TELEMETRY_BACKOFF_MS.length - 1)),
        )
      }
    }
    await this.#deps.repository.upsertPending(this.#toStored(batch))
    return 'deferred'
  }

  #createBatch(events: readonly TelemetryEvent[], retryCount: number): InFlightBatch {
    return {
      batchId: this.#nextBatchId(),
      events: Object.freeze([...events]),
      fingerprint: fingerprintTelemetryBatch(events),
      createdAt: this.#now(),
      retryCount,
    }
  }

  #toStored(batch: InFlightBatch): StoredTelemetryBatch {
    return {
      batchId: batch.batchId,
      events: batch.events,
      eventIds: batch.events.map((event) => event.eventId),
      fingerprint: batch.fingerprint,
      createdAt: batch.createdAt,
      retryCount: batch.retryCount,
      status: 'PENDING',
    }
  }

  #scheduleRetry(attempt: number): void {
    this.#retryTimer?.()
    this.#retryTimer = this.#scheduler.schedule(backoffDelay(Math.max(attempt - 1, 0)), () => {
      this.#retryTimer = null
      void this.flush('online').catch(() => undefined)
    })
  }

  #wait(delayMs: number): Promise<void> {
    return new Promise((resolve) => {
      this.#scheduler.schedule(delayMs, () => resolve())
    })
  }
}

export function createTelemetryCoordinator(deps: TelemetryCoordinatorDeps): TelemetryCoordinator {
  return new TelemetryCoordinator(deps)
}
