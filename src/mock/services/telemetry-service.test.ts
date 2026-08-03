import { describe, expect, it } from 'vitest'

import { parseIsoDateTime } from '@/domain/datetime'
import { parseTelemetryBatchId, parseTelemetryEventId, parseTelemetrySessionId } from '@/domain/ids'
import { MockTelemetryService } from '@/mock/services/telemetry-service'

function validBody(batchId = 'tel_bat_mock_1') {
  return {
    batchId: parseTelemetryBatchId(batchId),
    createdAt: parseIsoDateTime('2024-07-01T00:00:00.000Z'),
    events: [
      {
        eventId: parseTelemetryEventId('tel_evt_mock_1'),
        eventName: 'NOTES_LIST_VIEWED',
        occurredAt: parseIsoDateTime('2024-07-01T00:00:00.000Z'),
        sessionId: parseTelemetrySessionId('tel_ses_mock'),
        actorRole: 'ADMIN',
        appVersion: '0.1.0',
        payload: { connectivityState: 'ONLINE' },
      },
    ],
  }
}

describe('MockTelemetryService', () => {
  it('64–70: accept, reject invalid, idempotent retry, fingerprint conflict, failure injection', () => {
    const service = new MockTelemetryService()
    const first = service.accept(validBody())
    expect('acceptedBatchId' in first).toBe(true)

    const retry = service.accept(validBody())
    expect(retry).toEqual(first)
    expect(service.getAcceptedBatchCount()).toBe(1)

    const conflict = service.accept({
      ...validBody(),
      events: [
        {
          ...validBody().events[0]!,
          eventId: parseTelemetryEventId('tel_evt_mock_2'),
        },
      ],
    })
    expect('status' in conflict && conflict.status === 400).toBe(true)

    expect('status' in service.accept({ batchId: 'x' }) && true).toBe(true)

    service.forceFailNext()
    const failed = service.accept(validBody('tel_bat_mock_fail'))
    expect('status' in failed && failed.status === 500).toBe(true)

    const names = service.listAcceptedEventNamesByBatch().get('tel_bat_mock_1')
    expect(names).toEqual(['NOTES_LIST_VIEWED'])
    expect(JSON.stringify(names)).not.toMatch(/subjective|patient|plan/i)
  })
})
