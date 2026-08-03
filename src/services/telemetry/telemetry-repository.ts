import type { TelemetryBatchId } from '@/domain/ids'
import { getOfflineDatabase, type SoulsideOfflineDatabase } from '@/services/offline/offline-db'
import type { StoredTelemetryBatch } from '@/services/telemetry/telemetry.types'
import { TELEMETRY_MAX_STORED_BATCHES } from '@/services/telemetry/telemetry-constants'

export class TelemetryBatchFingerprintConflictError extends Error {
  readonly batchId: TelemetryBatchId

  constructor(batchId: TelemetryBatchId) {
    super('Telemetry batch fingerprint conflict')
    this.name = 'TelemetryBatchFingerprintConflictError'
    this.batchId = batchId
  }
}

function cloneBatch(batch: StoredTelemetryBatch): StoredTelemetryBatch {
  return Object.freeze({
    batchId: batch.batchId,
    events: Object.freeze(
      batch.events.map((event) =>
        Object.freeze({ ...event, payload: Object.freeze({ ...event.payload }) }),
      ),
    ),
    eventIds: Object.freeze([...batch.eventIds]),
    fingerprint: batch.fingerprint,
    createdAt: batch.createdAt,
    retryCount: batch.retryCount,
    status: batch.status,
  }) as StoredTelemetryBatch
}

export type TelemetryBatchRepository = {
  upsertPending(batch: StoredTelemetryBatch): Promise<void>
  markSending(batchId: TelemetryBatchId): Promise<void>
  markPending(batchId: TelemetryBatchId, retryCount: number): Promise<void>
  remove(batchId: TelemetryBatchId): Promise<void>
  requeueInterruptedSending(): Promise<number>
  listPendingOldestFirst(limit?: number): Promise<readonly StoredTelemetryBatch[]>
  count(): Promise<number>
}

export function createTelemetryBatchRepository(
  db: SoulsideOfflineDatabase = getOfflineDatabase(),
): TelemetryBatchRepository {
  return {
    async upsertPending(batch) {
      await db.open()
      const existing = await db.telemetryBatches.get(batch.batchId)
      if (existing) {
        if (existing.fingerprint !== batch.fingerprint) {
          throw new TelemetryBatchFingerprintConflictError(batch.batchId)
        }
        // Same fingerprint: refresh PENDING + retryCount (e.g. after SENDING failure).
        await db.telemetryBatches.put(
          cloneBatch({
            ...existing,
            retryCount: batch.retryCount,
            status: 'PENDING',
          }) as StoredTelemetryBatch,
        )
        return
      }

      const toStore = cloneBatch({ ...batch, status: 'PENDING' })
      await db.telemetryBatches.put(toStore as StoredTelemetryBatch)

      const count = await db.telemetryBatches.count()
      if (count > TELEMETRY_MAX_STORED_BATCHES) {
        const overflow = count - TELEMETRY_MAX_STORED_BATCHES
        const oldest = await db.telemetryBatches.orderBy('createdAt').limit(overflow).toArray()
        await db.telemetryBatches.bulkDelete(oldest.map((row) => row.batchId))
      }
    },

    async markSending(batchId) {
      await db.open()
      const existing = await db.telemetryBatches.get(batchId)
      if (!existing) {
        return
      }
      await db.telemetryBatches.put({ ...existing, status: 'SENDING' })
    },

    async markPending(batchId, retryCount) {
      await db.open()
      const existing = await db.telemetryBatches.get(batchId)
      if (!existing) {
        return
      }
      await db.telemetryBatches.put({
        ...existing,
        status: 'PENDING',
        retryCount,
      })
    },

    async remove(batchId) {
      await db.open()
      await db.telemetryBatches.delete(batchId)
    },

    async requeueInterruptedSending() {
      await db.open()
      const sending = await db.telemetryBatches.where('status').equals('SENDING').toArray()
      for (const row of sending) {
        await db.telemetryBatches.put({ ...row, status: 'PENDING' })
      }
      return sending.length
    },

    async listPendingOldestFirst(limit = TELEMETRY_MAX_STORED_BATCHES) {
      await db.open()
      const rows = await db.telemetryBatches.where('status').equals('PENDING').sortBy('createdAt')
      return rows.slice(0, limit).map((row) => cloneBatch(row))
    },

    async count() {
      await db.open()
      return db.telemetryBatches.count()
    },
  }
}
