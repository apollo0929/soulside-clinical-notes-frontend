import { describe, expect, it, vi } from 'vitest'

import { parseIsoDateTime } from '@/domain/datetime'
import { parseTelemetrySessionId } from '@/domain/ids'
import { ConnectivityService } from '@/services/offline/connectivity'
import type { TelemetryTransport } from '@/services/telemetry/telemetry-api'
import { createSequentialTelemetryBatchIdGenerator } from '@/services/telemetry/telemetry-batch-id'
import {
  createTelemetryCoordinator,
  type TelemetryScheduler,
} from '@/services/telemetry/telemetry-coordinator'
import {
  createAutosaveSucceededEvent,
  createBulkActionCompletedEvent,
  createConflictDetectedEvent,
  createNotesFiltersAppliedEvent,
  createSequentialTelemetryIdGenerator,
  type TelemetryFactoryContext,
} from '@/services/telemetry/telemetry-factories'
import type { TelemetryBatchRepository } from '@/services/telemetry/telemetry-repository'

function factoryCtx(): TelemetryFactoryContext {
  return {
    sessionId: parseTelemetrySessionId('tel_ses_coord'),
    actorRole: 'ADMIN',
    clock: { now: () => parseIsoDateTime('2024-07-01T00:00:00.000Z') },
    ids: createSequentialTelemetryIdGenerator('tel_evt_coord'),
    appVersion: '0.1.0',
  }
}

function memoryRepo(): TelemetryBatchRepository & {
  rows: Map<string, import('@/services/telemetry/telemetry.types').StoredTelemetryBatch>
} {
  const rows = new Map<
    string,
    import('@/services/telemetry/telemetry.types').StoredTelemetryBatch
  >()
  return {
    rows,
    async upsertPending(batch) {
      const key = String(batch.batchId)
      const existing = rows.get(key)
      if (existing) {
        if (existing.fingerprint !== batch.fingerprint) {
          throw new Error('Telemetry batch fingerprint conflict')
        }
        rows.set(key, { ...existing, status: 'PENDING', retryCount: batch.retryCount })
        return
      }
      rows.set(key, { ...batch, status: 'PENDING' })
    },
    async markSending(batchId) {
      const row = rows.get(String(batchId))
      if (row) {
        rows.set(String(batchId), { ...row, status: 'SENDING' })
      }
    },
    async markPending(batchId, retryCount) {
      const row = rows.get(String(batchId))
      if (row) {
        rows.set(String(batchId), { ...row, status: 'PENDING', retryCount })
      }
    },
    async remove(batchId) {
      rows.delete(String(batchId))
    },
    async requeueInterruptedSending() {
      let count = 0
      for (const [key, row] of rows) {
        if (row.status === 'SENDING') {
          rows.set(key, { ...row, status: 'PENDING' })
          count += 1
        }
      }
      return count
    },
    async listPendingOldestFirst(limit = 50) {
      return [...rows.values()]
        .filter((row) => row.status === 'PENDING')
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
        .slice(0, limit)
    },
    async count() {
      return rows.size
    },
  }
}

describe('TelemetryCoordinator', () => {
  it('21–25, 26–37, 38–46: factories, batching, retry, isolation', async () => {
    const ctx = factoryCtx()
    const filter = createNotesFiltersAppliedEvent(ctx, {
      hasSearch: true,
      selectedStatusCount: 2,
      hasCreatedFrom: false,
      hasCreatedTo: false,
      sortField: 'UPDATED_AT',
      sortDirection: 'DESC',
    })
    expect(filter.eventName).toBe('NOTES_FILTERS_APPLIED')
    if (filter.eventName === 'NOTES_FILTERS_APPLIED') {
      expect(filter.payload.hasSearch).toBe(true)
      expect(filter.payload).not.toHaveProperty('query')
    }

    const conflict = createConflictDetectedEvent(ctx, { conflictingSectionCount: 3 })
    expect(conflict.eventName).toBe('VERSION_CONFLICT_DETECTED')
    if (conflict.eventName === 'VERSION_CONFLICT_DETECTED') {
      expect(conflict.payload.conflictingSectionCount).toBe(3)
    }

    const bulk = createBulkActionCompletedEvent(ctx, {
      action: 'REGENERATE',
      selectedCount: 4,
      successCount: 3,
      failureCount: 1,
    })
    expect(bulk.payload).not.toHaveProperty('noteIds')

    const success = createAutosaveSucceededEvent(ctx, {
      revision: 5,
      durationBucket: 'LT_250_MS',
    })
    expect(success.payload).not.toHaveProperty('content')

    const connectivity = new ConnectivityService({
      getNavigatorOnline: () => true,
      addWindowListener: () => () => undefined,
    })
    connectivity.start()

    const sent: string[] = []
    let inFlight = 0
    let maxInFlight = 0
    const transport: TelemetryTransport = {
      async sendBatch(request) {
        inFlight += 1
        maxInFlight = Math.max(maxInFlight, inFlight)
        await Promise.resolve()
        inFlight -= 1
        sent.push(String(request.batchId))
        return {
          acceptedBatchId: request.batchId,
          acceptedEventCount: request.events.length,
        }
      },
    }

    const scheduled: Array<() => void> = []
    const scheduler: TelemetryScheduler = {
      schedule(_delay, work) {
        scheduled.push(work)
        return () => undefined
      },
      interval() {
        return () => undefined
      },
    }

    const batchIds = createSequentialTelemetryBatchIdGenerator('tel_bat_coord')
    const coordinator = createTelemetryCoordinator({
      transport,
      repository: memoryRepo(),
      connectivity,
      scheduler,
      batchSize: 3,
      flushIntervalMs: 60_000,
      maxInMemoryEvents: 5,
      nextBatchId: () => batchIds.next(),
      now: () => parseIsoDateTime('2024-07-01T00:00:00.000Z'),
    })
    coordinator.start()

    expect(await coordinator.flush('manual')).toBeUndefined()

    for (let i = 0; i < 3; i += 1) {
      coordinator.track(
        createAutosaveSucceededEvent(factoryCtx(), {
          revision: i + 1,
          durationBucket: 'LT_250_MS',
        }),
      )
    }
    await vi.waitFor(() => {
      expect(sent.length).toBe(1)
    })
    expect(maxInFlight).toBe(1)
    expect(coordinator.getBufferedEventCount()).toBe(0)

    // Overflow drops non-critical oldest
    for (let i = 0; i < 8; i += 1) {
      coordinator.track(
        createAutosaveSucceededEvent(factoryCtx(), {
          revision: i + 10,
          durationBucket: 'LT_250_MS',
        }),
      )
    }
    expect(coordinator.getBufferedEventCount()).toBeLessThanOrEqual(5)
    expect(coordinator.getDroppedEventCount()).toBeGreaterThan(0)

    // Retry path: fail then succeed with same batchId
    let attempts = 0
    const failingTransport: TelemetryTransport = {
      async sendBatch(request) {
        attempts += 1
        if (attempts === 1) {
          const { NetworkApiError } = await import('@/services/api/api-errors')
          throw new NetworkApiError({ message: 'offline' })
        }
        return {
          acceptedBatchId: request.batchId,
          acceptedEventCount: request.events.length,
        }
      },
    }
    const retryCoordinator = createTelemetryCoordinator({
      transport: failingTransport,
      repository: memoryRepo(),
      connectivity,
      scheduler: {
        schedule(_delay, work) {
          work()
          return () => undefined
        },
        interval() {
          return () => undefined
        },
      },
      batchSize: 1,
      maxDeliveryAttempts: 3,
      nextBatchId: () => batchIds.next(),
      now: () => parseIsoDateTime('2024-07-01T00:00:00.000Z'),
    })
    retryCoordinator.start()
    retryCoordinator.track(success)
    await retryCoordinator.flush('manual')
    expect(attempts).toBeGreaterThanOrEqual(2)

    // track never throws even if transport fails fatally after buffer
    expect(() => retryCoordinator.track(success)).not.toThrow()

    await coordinator.dispose()
    await retryCoordinator.dispose()
    connectivity.stop()
  })

  it('persists on pagehide, keeps failed batches, records backoff without sleeping', async () => {
    const connectivity = new ConnectivityService({
      getNavigatorOnline: () => true,
      addWindowListener: () => () => undefined,
    })
    connectivity.start()

    const repo = memoryRepo()
    const delays: number[] = []
    const scheduledWork: Array<() => void> = []
    const scheduler: TelemetryScheduler = {
      schedule(delay, work) {
        delays.push(delay)
        scheduledWork.push(work)
        return () => undefined
      },
      interval() {
        return () => undefined
      },
    }

    const batchIds = createSequentialTelemetryBatchIdGenerator('tel_bat_persist')
    let fail = true
    const transport: TelemetryTransport = {
      async sendBatch(request) {
        if (fail) {
          const { NetworkApiError } = await import('@/services/api/api-errors')
          throw new NetworkApiError({ message: 'transient' })
        }
        return {
          acceptedBatchId: request.batchId,
          acceptedEventCount: request.events.length,
        }
      },
    }

    const coordinator = createTelemetryCoordinator({
      transport,
      repository: repo,
      connectivity,
      scheduler,
      batchSize: 2,
      maxDeliveryAttempts: 2,
      nextBatchId: () => batchIds.next(),
      now: () => parseIsoDateTime('2024-07-01T00:00:00.000Z'),
    })

    // Avoid start() so startup drain / interval cannot race this persistence path.
    coordinator.track(
      createAutosaveSucceededEvent(factoryCtx(), {
        revision: 1,
        durationBucket: 'LT_250_MS',
      }),
    )
    await coordinator.flush('pagehide')
    expect(repo.rows.size).toBe(1)
    expect([...repo.rows.values()][0]?.status).toBe('PENDING')

    // Failed delivery must retain the stored batch (not delete after defer).
    const flushPromise = coordinator.flush('manual')
    await vi.waitFor(() => {
      expect(scheduledWork.length).toBeGreaterThan(0)
    })
    scheduledWork.shift()!()
    await flushPromise
    expect(repo.rows.size).toBe(1)
    expect([...repo.rows.values()][0]?.status).toBe('PENDING')
    expect(delays[0]).toBe(1_000)

    fail = false
    scheduledWork.length = 0
    await coordinator.flush('manual')
    expect(repo.rows.size).toBe(0)

    // Telemetry failure must not mutate connectivity or throw into product flow.
    expect(connectivity.getSnapshot().kind).not.toBe('OFFLINE')
    expect(() =>
      coordinator.track(
        createAutosaveSucceededEvent(factoryCtx(), {
          revision: 99,
          durationBucket: 'LT_250_MS',
        }),
      ),
    ).not.toThrow()

    await coordinator.dispose()
    connectivity.stop()
  })

  it('404 is fatal: drops batch without infinite retry loop', async () => {
    const connectivity = new ConnectivityService({
      getNavigatorOnline: () => true,
      addWindowListener: () => () => undefined,
    })
    connectivity.start()
    const repo = memoryRepo()
    let attempts = 0
    const { ApiClientError } = await import('@/services/api/api-errors')
    const transport: TelemetryTransport = {
      async sendBatch() {
        attempts += 1
        throw new ApiClientError({
          status: 404,
          code: 'TELEMETRY_DELIVERY_FAILED',
          message: 'not found',
        })
      },
    }
    const batchIds = createSequentialTelemetryBatchIdGenerator('tel_bat_404')
    const coordinator = createTelemetryCoordinator({
      transport,
      repository: repo,
      connectivity,
      scheduler: {
        schedule(_delay, work) {
          work()
          return () => undefined
        },
        interval() {
          return () => undefined
        },
      },
      batchSize: 1,
      maxDeliveryAttempts: 5,
      nextBatchId: () => batchIds.next(),
      now: () => parseIsoDateTime('2024-07-01T00:00:00.000Z'),
    })
    coordinator.track(
      createAutosaveSucceededEvent(factoryCtx(), {
        revision: 1,
        durationBucket: 'LT_250_MS',
      }),
    )
    await coordinator.flush('manual')
    expect(attempts).toBe(1)
    expect(repo.rows.size).toBe(0)
    expect(coordinator.getDroppedEventCount()).toBeGreaterThan(0)

    await coordinator.flush('manual')
    expect(attempts).toBe(1)
    await coordinator.dispose()
    connectivity.stop()
  })
})
