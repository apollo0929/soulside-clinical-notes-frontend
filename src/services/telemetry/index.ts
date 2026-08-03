export { createNoopTelemetryClient } from '@/services/telemetry/noop-telemetry-client'
export type { StoredTelemetryBatch } from '@/services/telemetry/telemetry.types'
export {
  createHttpTelemetryTransport,
  postTelemetryBatch,
  type TelemetryTransport,
} from '@/services/telemetry/telemetry-api'
export {
  ensureTelemetryBootstrap,
  getActiveTelemetryClient,
  getActiveTelemetryCoordinator,
  getTelemetryFactoryContext,
  installDevTelemetryApi,
  resetTelemetryBootstrapForTests,
  subscribeTelemetryReady,
  type TelemetryBootstrapDeps,
} from '@/services/telemetry/telemetry-bootstrap'
export type { TelemetryClient, TelemetryDiagnostics } from '@/services/telemetry/telemetry-client'
export {
  APP_VERSION,
  CRITICAL_TELEMETRY_EVENT_NAMES,
  TELEMETRY_BACKOFF_MS,
  TELEMETRY_BATCH_SIZE,
  TELEMETRY_FLUSH_INTERVAL_MS,
  TELEMETRY_MAX_DELIVERY_ATTEMPTS,
  TELEMETRY_MAX_IN_MEMORY_EVENTS,
  TELEMETRY_MAX_STORED_BATCHES,
  type TelemetryFlushReason,
} from '@/services/telemetry/telemetry-constants'
export {
  createTelemetryCoordinator,
  TelemetryCoordinator,
  type TelemetryCoordinatorDeps,
  type TelemetryScheduler,
} from '@/services/telemetry/telemetry-coordinator'
export { classifyTelemetryError } from '@/services/telemetry/telemetry-error-classification'
export {
  bucketDurationMs,
  createAutosaveFailedEvent,
  createAutosaveStartedEvent,
  createAutosaveSucceededEvent,
  createBrowserTelemetryClock,
  createBrowserTelemetryIdGenerator,
  createBulkActionCompletedEvent,
  createConflictDetectedEvent,
  createConflictResolvedEvent,
  createEditorDiscardedEvent,
  createEditorOpenedEvent,
  createNoteDetailOpenedEvent,
  createNotesFiltersAppliedEvent,
  createNotesListViewedEvent,
  createOfflineReplayFailedEvent,
  createOfflineReplaySucceededEvent,
  createOfflineWriteQueuedEvent,
  createRealtimeConnectedEvent,
  createRealtimeReconnectedEvent,
  createRealtimeResyncRequiredEvent,
  createSequentialTelemetryIdGenerator,
  type TelemetryClock,
  type TelemetryFactoryContext,
  type TelemetryIdGenerator,
} from '@/services/telemetry/telemetry-factories'
export {
  isForbiddenTelemetryKey,
  redactTelemetryEvent,
  TELEMETRY_FORBIDDEN_KEYS,
} from '@/services/telemetry/telemetry-redaction'
export {
  createTelemetryBatchRepository,
  TelemetryBatchFingerprintConflictError,
  type TelemetryBatchRepository,
} from '@/services/telemetry/telemetry-repository'
export {
  clearTelemetrySessionIdForTests,
  createBrowserTelemetrySessionIdGenerator,
  createSequentialTelemetrySessionIdGenerator,
  getOrCreateTelemetrySessionId,
} from '@/services/telemetry/telemetry-session'
export {
  TelemetryProvider,
  trackTelemetry,
  useTelemetryClient,
  useTrackTelemetry,
} from '@/services/telemetry/use-telemetry'
