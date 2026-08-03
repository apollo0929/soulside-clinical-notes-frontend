import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { parseIsoDateTime } from '@/domain/datetime'
import { parseTelemetryBatchId, parseTelemetryEventId, parseTelemetrySessionId } from '@/domain/ids'
import { createMockBackendNodeServer } from '@/mock/msw/node'
import { MockBackendService } from '@/mock/services/backend'

describe('telemetry MSW integration', () => {
  const backend = new MockBackendService({ autoSeed: false })
  const { server } = createMockBackendNodeServer(backend)

  beforeEach(() => {
    backend.configureForTests()
    backend.telemetry.clear()
    server.listen({ onUnhandledRequest: 'error' })
  })

  afterEach(() => {
    server.resetHandlers()
    server.close()
  })

  it('64–70: POST /api/telemetry/batches accepts and idempotently retries', async () => {
    const body = {
      batchId: parseTelemetryBatchId('tel_bat_http_1'),
      createdAt: parseIsoDateTime('2024-07-01T00:00:00.000Z'),
      events: [
        {
          eventId: parseTelemetryEventId('tel_evt_http_1'),
          eventName: 'EDITOR_OPENED',
          occurredAt: parseIsoDateTime('2024-07-01T00:00:00.000Z'),
          sessionId: parseTelemetrySessionId('tel_ses_http'),
          actorRole: 'CLINICIAN',
          appVersion: '0.1.0',
          payload: { noteStatus: 'IN_REVIEW' },
        },
      ],
    }

    const response = await fetch('/api/telemetry/batches', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    expect(response.status).toBe(200)
    const json = (await response.json()) as { acceptedEventCount: number }
    expect(json.acceptedEventCount).toBe(1)

    const retry = await fetch('/api/telemetry/batches', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    expect(retry.status).toBe(200)
    expect(backend.telemetry.getAcceptedBatchCount()).toBe(1)
  })
})
