import { z } from 'zod'

import { isoDateTimeSchema } from '@/domain/datetime'
import {
  telemetryBatchIdSchema,
  telemetryEventIdSchema,
  telemetrySessionIdSchema,
} from '@/domain/ids'
import { nonNegativeIntSchema, noteStatusSchema, userRoleSchema } from '@/domain/schemas/primitives'

export const TELEMETRY_EVENT_NAMES = [
  'NOTES_LIST_VIEWED',
  'NOTES_FILTERS_APPLIED',
  'NOTE_DETAIL_OPENED',
  'EDITOR_OPENED',
  'EDITOR_DISCARDED',
  'AUTOSAVE_STARTED',
  'AUTOSAVE_SUCCEEDED',
  'AUTOSAVE_FAILED',
  'VERSION_CONFLICT_DETECTED',
  'VERSION_CONFLICT_RESOLVED',
  'OFFLINE_WRITE_QUEUED',
  'OFFLINE_REPLAY_SUCCEEDED',
  'OFFLINE_REPLAY_FAILED',
  'REALTIME_CONNECTED',
  'REALTIME_RECONNECTED',
  'REALTIME_RESYNC_REQUIRED',
  'BULK_ACTION_COMPLETED',
] as const

export type TelemetryEventName = (typeof TELEMETRY_EVENT_NAMES)[number]

export const TELEMETRY_ERROR_CODES = [
  'NETWORK',
  'VALIDATION',
  'FORBIDDEN',
  'CONFLICT',
  'SERVER',
  'ABORTED',
  'UNKNOWN',
] as const

export type TelemetryErrorCode = (typeof TELEMETRY_ERROR_CODES)[number]

export const TELEMETRY_DURATION_BUCKETS = [
  'LT_250_MS',
  '250_TO_999_MS',
  '1_TO_4_S',
  'GE_5_S',
] as const

export type TelemetryDurationBucket = (typeof TELEMETRY_DURATION_BUCKETS)[number]

export const TELEMETRY_CONNECTIVITY_KINDS = [
  'ONLINE',
  'OFFLINE',
  'RECONNECTING',
  'REPLAYING',
  'DEGRADED',
] as const

export type TelemetryConnectivityKind = (typeof TELEMETRY_CONNECTIVITY_KINDS)[number]

export const TELEMETRY_BULK_ACTIONS = ['ASSIGN_REVIEWER', 'REGENERATE'] as const

export type TelemetryBulkAction = (typeof TELEMETRY_BULK_ACTIONS)[number]

export const TELEMETRY_SORT_FIELDS = ['UPDATED_AT', 'CREATED_AT', 'STATUS'] as const
export const TELEMETRY_SORT_DIRECTIONS = ['ASC', 'DESC'] as const

export const MAX_TELEMETRY_EVENTS_PER_BATCH = 20
export const MAX_TELEMETRY_STRING_LENGTH = 64
export const MAX_TELEMETRY_ARRAY_LENGTH = 32
export const MAX_TELEMETRY_OBJECT_DEPTH = 4
/** Soft payload guard for mock API (~64 KiB serialized). */
export const MAX_TELEMETRY_BATCH_PAYLOAD_BYTES = 65_536

const telemetryErrorCodeSchema = z.enum(TELEMETRY_ERROR_CODES)
const telemetryDurationBucketSchema = z.enum(TELEMETRY_DURATION_BUCKETS)
const telemetryConnectivityKindSchema = z.enum(TELEMETRY_CONNECTIVITY_KINDS)
const telemetryBulkActionSchema = z.enum(TELEMETRY_BULK_ACTIONS)
const telemetrySortFieldSchema = z.enum(TELEMETRY_SORT_FIELDS)
const telemetrySortDirectionSchema = z.enum(TELEMETRY_SORT_DIRECTIONS)

const envelopeBase = {
  eventId: telemetryEventIdSchema,
  occurredAt: isoDateTimeSchema,
  sessionId: telemetrySessionIdSchema,
  actorRole: userRoleSchema,
  appVersion: z.string().trim().min(1).max(MAX_TELEMETRY_STRING_LENGTH),
} as const

const emptyPayloadSchema = z.strictObject({})

const notesListViewedPayloadSchema = z.strictObject({
  connectivityState: telemetryConnectivityKindSchema,
})

const notesFiltersAppliedPayloadSchema = z.strictObject({
  hasSearch: z.boolean(),
  selectedStatusCount: nonNegativeIntSchema,
  hasCreatedFrom: z.boolean(),
  hasCreatedTo: z.boolean(),
  sortField: telemetrySortFieldSchema,
  sortDirection: telemetrySortDirectionSchema,
})

const noteDetailOpenedPayloadSchema = z.strictObject({
  noteStatus: noteStatusSchema,
})

const editorOpenedPayloadSchema = z.strictObject({
  noteStatus: noteStatusSchema,
})

const editorDiscardedPayloadSchema = z.strictObject({
  dirtySectionCount: nonNegativeIntSchema,
})

const autosaveStartedPayloadSchema = z.strictObject({
  dirtySectionCount: nonNegativeIntSchema,
})

const autosaveSucceededPayloadSchema = z.strictObject({
  revision: nonNegativeIntSchema,
  durationBucket: telemetryDurationBucketSchema,
})

const autosaveFailedPayloadSchema = z.strictObject({
  errorCode: telemetryErrorCodeSchema,
  durationBucket: telemetryDurationBucketSchema,
})

const versionConflictDetectedPayloadSchema = z.strictObject({
  conflictingSectionCount: nonNegativeIntSchema,
})

const versionConflictResolvedPayloadSchema = z.strictObject({
  conflictingSectionCount: nonNegativeIntSchema,
  durationBucket: telemetryDurationBucketSchema,
})

const offlineWriteQueuedPayloadSchema = z.strictObject({
  connectivityState: telemetryConnectivityKindSchema,
})

const offlineReplaySucceededPayloadSchema = z.strictObject({
  retryCount: nonNegativeIntSchema,
  durationBucket: telemetryDurationBucketSchema,
})

const offlineReplayFailedPayloadSchema = z.strictObject({
  errorCode: telemetryErrorCodeSchema,
  retryCount: nonNegativeIntSchema,
})

const realtimeConnectedPayloadSchema = z.strictObject({
  connectivityState: telemetryConnectivityKindSchema,
})

const realtimeReconnectedPayloadSchema = z.strictObject({
  connectivityState: telemetryConnectivityKindSchema,
})

const realtimeResyncRequiredPayloadSchema = z.strictObject({
  connectivityState: telemetryConnectivityKindSchema,
})

const bulkActionCompletedPayloadSchema = z.strictObject({
  action: telemetryBulkActionSchema,
  selectedCount: nonNegativeIntSchema,
  successCount: nonNegativeIntSchema,
  failureCount: nonNegativeIntSchema,
})

function eventSchema<TName extends TelemetryEventName, TPayload extends z.ZodType>(
  eventName: TName,
  payload: TPayload,
) {
  return z.strictObject({
    ...envelopeBase,
    eventName: z.literal(eventName),
    payload,
  })
}

export const notesListViewedEventSchema = eventSchema(
  'NOTES_LIST_VIEWED',
  notesListViewedPayloadSchema,
)
export const notesFiltersAppliedEventSchema = eventSchema(
  'NOTES_FILTERS_APPLIED',
  notesFiltersAppliedPayloadSchema,
)
export const noteDetailOpenedEventSchema = eventSchema(
  'NOTE_DETAIL_OPENED',
  noteDetailOpenedPayloadSchema,
)
export const editorOpenedEventSchema = eventSchema('EDITOR_OPENED', editorOpenedPayloadSchema)
export const editorDiscardedEventSchema = eventSchema(
  'EDITOR_DISCARDED',
  editorDiscardedPayloadSchema,
)
export const autosaveStartedEventSchema = eventSchema(
  'AUTOSAVE_STARTED',
  autosaveStartedPayloadSchema,
)
export const autosaveSucceededEventSchema = eventSchema(
  'AUTOSAVE_SUCCEEDED',
  autosaveSucceededPayloadSchema,
)
export const autosaveFailedEventSchema = eventSchema('AUTOSAVE_FAILED', autosaveFailedPayloadSchema)
export const versionConflictDetectedEventSchema = eventSchema(
  'VERSION_CONFLICT_DETECTED',
  versionConflictDetectedPayloadSchema,
)
export const versionConflictResolvedEventSchema = eventSchema(
  'VERSION_CONFLICT_RESOLVED',
  versionConflictResolvedPayloadSchema,
)
export const offlineWriteQueuedEventSchema = eventSchema(
  'OFFLINE_WRITE_QUEUED',
  offlineWriteQueuedPayloadSchema,
)
export const offlineReplaySucceededEventSchema = eventSchema(
  'OFFLINE_REPLAY_SUCCEEDED',
  offlineReplaySucceededPayloadSchema,
)
export const offlineReplayFailedEventSchema = eventSchema(
  'OFFLINE_REPLAY_FAILED',
  offlineReplayFailedPayloadSchema,
)
export const realtimeConnectedEventSchema = eventSchema(
  'REALTIME_CONNECTED',
  realtimeConnectedPayloadSchema,
)
export const realtimeReconnectedEventSchema = eventSchema(
  'REALTIME_RECONNECTED',
  realtimeReconnectedPayloadSchema,
)
export const realtimeResyncRequiredEventSchema = eventSchema(
  'REALTIME_RESYNC_REQUIRED',
  realtimeResyncRequiredPayloadSchema,
)
export const bulkActionCompletedEventSchema = eventSchema(
  'BULK_ACTION_COMPLETED',
  bulkActionCompletedPayloadSchema,
)

export const telemetryEventSchema = z.discriminatedUnion('eventName', [
  notesListViewedEventSchema,
  notesFiltersAppliedEventSchema,
  noteDetailOpenedEventSchema,
  editorOpenedEventSchema,
  editorDiscardedEventSchema,
  autosaveStartedEventSchema,
  autosaveSucceededEventSchema,
  autosaveFailedEventSchema,
  versionConflictDetectedEventSchema,
  versionConflictResolvedEventSchema,
  offlineWriteQueuedEventSchema,
  offlineReplaySucceededEventSchema,
  offlineReplayFailedEventSchema,
  realtimeConnectedEventSchema,
  realtimeReconnectedEventSchema,
  realtimeResyncRequiredEventSchema,
  bulkActionCompletedEventSchema,
])

export type TelemetryEvent = z.infer<typeof telemetryEventSchema>

export const telemetryBatchRequestDtoSchema = z.strictObject({
  batchId: telemetryBatchIdSchema,
  createdAt: isoDateTimeSchema,
  events: z.array(telemetryEventSchema).min(1).max(MAX_TELEMETRY_EVENTS_PER_BATCH),
})

export type TelemetryBatchRequestDto = z.infer<typeof telemetryBatchRequestDtoSchema>

export const telemetryBatchResponseDtoSchema = z.strictObject({
  acceptedBatchId: telemetryBatchIdSchema,
  acceptedEventCount: nonNegativeIntSchema,
})

export type TelemetryBatchResponseDto = z.infer<typeof telemetryBatchResponseDtoSchema>

/** Reserved empty payload export for documentation/tests. */
export { emptyPayloadSchema }
