import { beforeEach, describe, expect, it } from 'vitest'

import { parseIsoDateTime } from '@/domain/datetime'
import { parseTelemetryBatchId, parseTelemetryEventId, parseTelemetrySessionId } from '@/domain/ids'
import type { TelemetryEvent } from '@/domain/schemas/telemetry'
import {
  installOfflineDatabaseForTests,
  resetOfflineDatabaseForTests,
} from '@/services/offline/offline-db'
import type { StoredTelemetryBatch } from '@/services/telemetry/telemetry.types'
import {
  createTelemetryBatchRepository,
  TelemetryBatchFingerprintConflictError,
} from '@/services/telemetry/telemetry-repository'

function event(id: string): TelemetryEvent {
  return {
    eventId: parseTelemetryEventId(id),
    eventName: 'NOTES_LIST_VIEWED',
    occurredAt: parseIsoDateTime('2024-07-01T00:00:00.000Z'),
    sessionId: parseTelemetrySessionId('tel_ses_repo'),
    actorRole: 'ADMIN',
    appVersion: '0.1.0',
    payload: { connectivityState: 'ONLINE' },
  }
}

function batch(
  batchId: string,
  events: TelemetryEvent[],
  status: StoredTelemetryBatch['status'] = 'PENDING',
): StoredTelemetryBatch {
  return {
    batchId: parseTelemetryBatchId(batchId),
    events,
    eventIds: events.map((item) => item.eventId),
    fingerprint: `fp_${events.map((item) => item.eventId).join('|')}`,
    createdAt: parseIsoDateTime('2024-07-01T00:00:00.000Z'),
    retryCount: 0,
    status,
  }
}

describe('TelemetryBatchRepository', () => {
  beforeEach(async () => {
    await resetOfflineDatabaseForTests()
    installOfflineDatabaseForTests(`telemetry-repo-${Date.now()}`)
  })

  it('47–56: persist, dedupe, requeue, order, immutability, no localStorage', async () => {
    const repo = createTelemetryBatchRepository()
    const first = batch('tel_bat_a', [event('tel_evt_a1')])
    await repo.upsertPending(first)
    expect(await repo.count()).toBe(1)

    await repo.upsertPending(first)
    expect(await repo.count()).toBe(1)

    await expect(
      repo.upsertPending({
        ...first,
        fingerprint: 'fp_changed',
      }),
    ).rejects.toBeInstanceOf(TelemetryBatchFingerprintConflictError)

    await repo.markSending(first.batchId)
    expect((await repo.listPendingOldestFirst())[0]).toBeUndefined()
    await repo.requeueInterruptedSending()
    const pending = await repo.listPendingOldestFirst()
    expect(pending).toHaveLength(1)
    expect(pending[0]!.status).toBe('PENDING')

    const later = batch('tel_bat_b', [event('tel_evt_b1')])
    await repo.upsertPending({
      ...later,
      createdAt: parseIsoDateTime('2024-07-01T00:01:00.000Z'),
    })
    const ordered = await repo.listPendingOldestFirst()
    expect(String(ordered[0]!.batchId)).toBe('tel_bat_a')

    const snapshot = ordered[0]!
    expect(Object.isFrozen(snapshot.events)).toBe(true)

    await repo.remove(first.batchId)
    expect(await repo.count()).toBe(1)

    expect(localStorage.getItem('telemetry')).toBeNull()
  })
})
