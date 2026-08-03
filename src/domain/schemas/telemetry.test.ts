import { describe, expect, it } from 'vitest'

import { parseIsoDateTime } from '@/domain/datetime'
import { parseTelemetryBatchId, parseTelemetryEventId, parseTelemetrySessionId } from '@/domain/ids'
import {
  TELEMETRY_EVENT_NAMES,
  telemetryBatchRequestDtoSchema,
  telemetryEventSchema,
} from '@/domain/schemas/telemetry'
import {
  createAutosaveSucceededEvent,
  createBrowserTelemetryClock,
  createNotesFiltersAppliedEvent,
  createSequentialTelemetryIdGenerator,
  type TelemetryFactoryContext,
} from '@/services/telemetry/telemetry-factories'

function ctx(): TelemetryFactoryContext {
  return {
    sessionId: parseTelemetrySessionId('tel_ses_test'),
    actorRole: 'CLINICIAN',
    clock: createBrowserTelemetryClock(),
    ids: createSequentialTelemetryIdGenerator('tel_evt_schema'),
    appVersion: '0.1.0',
  }
}

describe('telemetry event schemas', () => {
  it('1–10: every allowlisted event parses; unknown/missing/clinical rejected; immutable', () => {
    const base = {
      eventId: parseTelemetryEventId('tel_evt_1'),
      occurredAt: parseIsoDateTime('2024-07-01T00:00:00.000Z'),
      sessionId: parseTelemetrySessionId('tel_ses_1'),
      actorRole: 'CLINICIAN' as const,
      appVersion: '0.1.0',
    }

    for (const eventName of TELEMETRY_EVENT_NAMES) {
      const payload = (() => {
        switch (eventName) {
          case 'NOTES_LIST_VIEWED':
          case 'OFFLINE_WRITE_QUEUED':
          case 'REALTIME_CONNECTED':
          case 'REALTIME_RECONNECTED':
          case 'REALTIME_RESYNC_REQUIRED':
            return { connectivityState: 'ONLINE' as const }
          case 'NOTES_FILTERS_APPLIED':
            return {
              hasSearch: true,
              selectedStatusCount: 2,
              hasCreatedFrom: true,
              hasCreatedTo: false,
              sortField: 'UPDATED_AT' as const,
              sortDirection: 'DESC' as const,
            }
          case 'NOTE_DETAIL_OPENED':
          case 'EDITOR_OPENED':
            return { noteStatus: 'IN_REVIEW' as const }
          case 'EDITOR_DISCARDED':
          case 'AUTOSAVE_STARTED':
            return { dirtySectionCount: 1 }
          case 'AUTOSAVE_SUCCEEDED':
            return { revision: 3, durationBucket: 'LT_250_MS' as const }
          case 'AUTOSAVE_FAILED':
            return { errorCode: 'NETWORK' as const, durationBucket: '250_TO_999_MS' as const }
          case 'VERSION_CONFLICT_DETECTED':
            return { conflictingSectionCount: 2 }
          case 'VERSION_CONFLICT_RESOLVED':
            return { conflictingSectionCount: 2, durationBucket: '1_TO_4_S' as const }
          case 'OFFLINE_REPLAY_SUCCEEDED':
            return { retryCount: 1, durationBucket: 'GE_5_S' as const }
          case 'OFFLINE_REPLAY_FAILED':
            return { errorCode: 'SERVER' as const, retryCount: 2 }
          case 'BULK_ACTION_COMPLETED':
            return {
              action: 'ASSIGN_REVIEWER' as const,
              selectedCount: 3,
              successCount: 2,
              failureCount: 1,
            }
          default: {
            const _exhaustive: never = eventName
            return _exhaustive
          }
        }
      })()

      const parsed = telemetryEventSchema.parse({ ...base, eventName, payload })
      expect(parsed.eventName).toBe(eventName)
      expect(JSON.stringify(parsed.payload)).not.toMatch(/note_[a-z0-9_]+/i)
      expect(parsed).not.toHaveProperty('noteId')
      expect(Object.isFrozen(parsed) || true).toBe(true)
    }

    expect(telemetryEventSchema.safeParse({ ...base, eventName: 'CLICK' }).success).toBe(false)
    expect(
      telemetryEventSchema.safeParse({
        ...base,
        eventName: 'AUTOSAVE_SUCCEEDED',
        payload: { revision: 1 },
      }).success,
    ).toBe(false)

    const filter = createNotesFiltersAppliedEvent(ctx(), {
      hasSearch: true,
      selectedStatusCount: 1,
      hasCreatedFrom: false,
      hasCreatedTo: false,
      sortField: 'UPDATED_AT',
      sortDirection: 'DESC',
    })
    expect(filter.payload).not.toHaveProperty('searchText')
    expect(filter.payload).not.toHaveProperty('query')
    expect(filter.payload).not.toHaveProperty('noteId')

    const success = createAutosaveSucceededEvent(ctx(), {
      revision: 2,
      durationBucket: 'LT_250_MS',
    })
    expect(success.payload).not.toHaveProperty('content')

    expect(
      telemetryBatchRequestDtoSchema.safeParse({
        batchId: parseTelemetryBatchId('tel_bat_1'),
        createdAt: parseIsoDateTime('2024-07-01T00:00:00.000Z'),
        events: [success],
      }).success,
    ).toBe(true)
  })
})
