import type { IsoDateTime } from '@/domain/datetime'
import { parseIsoDateTime } from '@/domain/datetime'
import type { TelemetryEventId, TelemetrySessionId } from '@/domain/ids'
import { parseTelemetryEventId } from '@/domain/ids'
import type { UserRole } from '@/domain/roles'
import type {
  TelemetryBulkAction,
  TelemetryConnectivityKind,
  TelemetryDurationBucket,
  TelemetryErrorCode,
  TelemetryEvent,
} from '@/domain/schemas/telemetry'
import type { NoteStatus } from '@/domain/statuses'
import { APP_VERSION } from '@/services/telemetry/telemetry-constants'

export type TelemetryClock = {
  now(): IsoDateTime
}

export type TelemetryIdGenerator = {
  nextEventId(): TelemetryEventId
}

export type TelemetryFactoryContext = {
  readonly sessionId: TelemetrySessionId
  readonly actorRole: UserRole
  readonly clock: TelemetryClock
  readonly ids: TelemetryIdGenerator
  readonly appVersion?: string
}

function envelopeBase(ctx: TelemetryFactoryContext) {
  return {
    eventId: ctx.ids.nextEventId(),
    occurredAt: ctx.clock.now(),
    sessionId: ctx.sessionId,
    actorRole: ctx.actorRole,
    appVersion: ctx.appVersion ?? APP_VERSION,
  }
}

export function createBrowserTelemetryClock(): TelemetryClock {
  return {
    now: () => parseIsoDateTime(new Date().toISOString()),
  }
}

export function createSequentialTelemetryIdGenerator(prefix = 'tel_evt'): TelemetryIdGenerator {
  let sequence = 0
  return {
    nextEventId: () => {
      sequence += 1
      return parseTelemetryEventId(`${prefix}_${sequence}`)
    },
  }
}

export function createBrowserTelemetryIdGenerator(): TelemetryIdGenerator {
  return {
    nextEventId: () => {
      const uuid =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `fallback_${Date.now()}_${Math.random().toString(36).slice(2)}`
      return parseTelemetryEventId(`tel_evt_${uuid}`)
    },
  }
}

export function bucketDurationMs(durationMs: number): TelemetryDurationBucket {
  if (durationMs < 250) {
    return 'LT_250_MS'
  }
  if (durationMs < 1_000) {
    return '250_TO_999_MS'
  }
  if (durationMs < 5_000) {
    return '1_TO_4_S'
  }
  return 'GE_5_S'
}

export function createNotesListViewedEvent(
  ctx: TelemetryFactoryContext,
  payload: { readonly connectivityState: TelemetryConnectivityKind },
): TelemetryEvent {
  return {
    ...envelopeBase(ctx),
    eventName: 'NOTES_LIST_VIEWED',
    payload,
  }
}

export function createNotesFiltersAppliedEvent(
  ctx: TelemetryFactoryContext,
  payload: {
    readonly hasSearch: boolean
    readonly selectedStatusCount: number
    readonly hasCreatedFrom: boolean
    readonly hasCreatedTo: boolean
    readonly sortField: 'UPDATED_AT' | 'CREATED_AT' | 'STATUS'
    readonly sortDirection: 'ASC' | 'DESC'
  },
): TelemetryEvent {
  return {
    ...envelopeBase(ctx),
    eventName: 'NOTES_FILTERS_APPLIED',
    payload,
  }
}

export function createNoteDetailOpenedEvent(
  ctx: TelemetryFactoryContext,
  payload: { readonly noteStatus: NoteStatus },
): TelemetryEvent {
  return {
    ...envelopeBase(ctx),
    eventName: 'NOTE_DETAIL_OPENED',
    payload,
  }
}

export function createEditorOpenedEvent(
  ctx: TelemetryFactoryContext,
  payload: { readonly noteStatus: NoteStatus },
): TelemetryEvent {
  return {
    ...envelopeBase(ctx),
    eventName: 'EDITOR_OPENED',
    payload,
  }
}

export function createEditorDiscardedEvent(
  ctx: TelemetryFactoryContext,
  payload: { readonly dirtySectionCount: number },
): TelemetryEvent {
  return {
    ...envelopeBase(ctx),
    eventName: 'EDITOR_DISCARDED',
    payload,
  }
}

export function createAutosaveStartedEvent(
  ctx: TelemetryFactoryContext,
  payload: { readonly dirtySectionCount: number },
): TelemetryEvent {
  return {
    ...envelopeBase(ctx),
    eventName: 'AUTOSAVE_STARTED',
    payload,
  }
}

export function createAutosaveSucceededEvent(
  ctx: TelemetryFactoryContext,
  payload: { readonly revision: number; readonly durationBucket: TelemetryDurationBucket },
): TelemetryEvent {
  return {
    ...envelopeBase(ctx),
    eventName: 'AUTOSAVE_SUCCEEDED',
    payload,
  }
}

export function createAutosaveFailedEvent(
  ctx: TelemetryFactoryContext,
  payload: {
    readonly errorCode: TelemetryErrorCode
    readonly durationBucket: TelemetryDurationBucket
  },
): TelemetryEvent {
  return {
    ...envelopeBase(ctx),
    eventName: 'AUTOSAVE_FAILED',
    payload,
  }
}

export function createConflictDetectedEvent(
  ctx: TelemetryFactoryContext,
  payload: { readonly conflictingSectionCount: number },
): TelemetryEvent {
  return {
    ...envelopeBase(ctx),
    eventName: 'VERSION_CONFLICT_DETECTED',
    payload,
  }
}

export function createConflictResolvedEvent(
  ctx: TelemetryFactoryContext,
  payload: {
    readonly conflictingSectionCount: number
    readonly durationBucket: TelemetryDurationBucket
  },
): TelemetryEvent {
  return {
    ...envelopeBase(ctx),
    eventName: 'VERSION_CONFLICT_RESOLVED',
    payload,
  }
}

export function createOfflineWriteQueuedEvent(
  ctx: TelemetryFactoryContext,
  payload: { readonly connectivityState: TelemetryConnectivityKind },
): TelemetryEvent {
  return {
    ...envelopeBase(ctx),
    eventName: 'OFFLINE_WRITE_QUEUED',
    payload,
  }
}

export function createOfflineReplaySucceededEvent(
  ctx: TelemetryFactoryContext,
  payload: { readonly retryCount: number; readonly durationBucket: TelemetryDurationBucket },
): TelemetryEvent {
  return {
    ...envelopeBase(ctx),
    eventName: 'OFFLINE_REPLAY_SUCCEEDED',
    payload,
  }
}

export function createOfflineReplayFailedEvent(
  ctx: TelemetryFactoryContext,
  payload: { readonly errorCode: TelemetryErrorCode; readonly retryCount: number },
): TelemetryEvent {
  return {
    ...envelopeBase(ctx),
    eventName: 'OFFLINE_REPLAY_FAILED',
    payload,
  }
}

export function createRealtimeConnectedEvent(
  ctx: TelemetryFactoryContext,
  payload: { readonly connectivityState: TelemetryConnectivityKind },
): TelemetryEvent {
  return {
    ...envelopeBase(ctx),
    eventName: 'REALTIME_CONNECTED',
    payload,
  }
}

export function createRealtimeReconnectedEvent(
  ctx: TelemetryFactoryContext,
  payload: { readonly connectivityState: TelemetryConnectivityKind },
): TelemetryEvent {
  return {
    ...envelopeBase(ctx),
    eventName: 'REALTIME_RECONNECTED',
    payload,
  }
}

export function createRealtimeResyncRequiredEvent(
  ctx: TelemetryFactoryContext,
  payload: { readonly connectivityState: TelemetryConnectivityKind },
): TelemetryEvent {
  return {
    ...envelopeBase(ctx),
    eventName: 'REALTIME_RESYNC_REQUIRED',
    payload,
  }
}

export function createBulkActionCompletedEvent(
  ctx: TelemetryFactoryContext,
  payload: {
    readonly action: TelemetryBulkAction
    readonly selectedCount: number
    readonly successCount: number
    readonly failureCount: number
  },
): TelemetryEvent {
  return {
    ...envelopeBase(ctx),
    eventName: 'BULK_ACTION_COMPLETED',
    payload,
  }
}
