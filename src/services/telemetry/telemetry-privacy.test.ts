import { describe, expect, it } from 'vitest'

import { parseIsoDateTime } from '@/domain/datetime'
import { parseTelemetrySessionId } from '@/domain/ids'
import { TELEMETRY_EVENT_NAMES } from '@/domain/schemas/telemetry'
import {
  createAutosaveFailedEvent,
  createAutosaveSucceededEvent,
  createBulkActionCompletedEvent,
  createConflictDetectedEvent,
  createNotesFiltersAppliedEvent,
  createNotesListViewedEvent,
  createOfflineWriteQueuedEvent,
  createRealtimeReconnectedEvent,
  createSequentialTelemetryIdGenerator,
  type TelemetryFactoryContext,
} from '@/services/telemetry/telemetry-factories'

function ctx(): TelemetryFactoryContext {
  return {
    sessionId: parseTelemetrySessionId('tel_ses_privacy'),
    actorRole: 'REVIEWER',
    clock: { now: () => parseIsoDateTime('2024-07-01T00:00:00.000Z') },
    ids: createSequentialTelemetryIdGenerator('tel_evt_privacy'),
    appVersion: '0.1.0',
  }
}

describe('telemetry privacy regression', () => {
  it('81–84: serialized examples contain no clinical/PII/search/note ids', () => {
    const examples = [
      createNotesListViewedEvent(ctx(), { connectivityState: 'ONLINE' }),
      createNotesFiltersAppliedEvent(ctx(), {
        hasSearch: true,
        selectedStatusCount: 1,
        hasCreatedFrom: false,
        hasCreatedTo: false,
        sortField: 'STATUS',
        sortDirection: 'ASC',
      }),
      createAutosaveSucceededEvent(ctx(), { revision: 2, durationBucket: 'LT_250_MS' }),
      createAutosaveFailedEvent(ctx(), {
        errorCode: 'VALIDATION',
        durationBucket: '250_TO_999_MS',
      }),
      createConflictDetectedEvent(ctx(), { conflictingSectionCount: 2 }),
      createOfflineWriteQueuedEvent(ctx(), { connectivityState: 'OFFLINE' }),
      createRealtimeReconnectedEvent(ctx(), { connectivityState: 'DEGRADED' }),
      createBulkActionCompletedEvent(ctx(), {
        action: 'ASSIGN_REVIEWER',
        selectedCount: 2,
        successCount: 2,
        failureCount: 0,
      }),
    ]

    const blob = JSON.stringify(examples)
    expect(blob).not.toMatch(/subjective|objective|assessment|\bplan\b/i)
    expect(blob).not.toMatch(/patient/i)
    expect(blob).not.toMatch(/rejection/i)
    expect(blob).not.toMatch(/"noteId"\s*:/)
    expect(blob).not.toMatch(/note_[0-9a-f]{4,}/i)
    expect(blob).not.toMatch(/"q":|"searchText"|"query":/i)
    expect(TELEMETRY_EVENT_NAMES.length).toBeGreaterThan(10)
  })
})
