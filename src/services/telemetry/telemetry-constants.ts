export const APP_VERSION = '0.1.0'

export const TELEMETRY_BATCH_SIZE = 20
export const TELEMETRY_FLUSH_INTERVAL_MS = 10_000
export const TELEMETRY_MAX_IN_MEMORY_EVENTS = 200
export const TELEMETRY_MAX_STORED_BATCHES = 50
export const TELEMETRY_MAX_DELIVERY_ATTEMPTS = 5

export const TELEMETRY_BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 30_000] as const

export const TELEMETRY_SESSION_STORAGE_KEY = 'soulside.telemetry.sessionId'

export const CRITICAL_TELEMETRY_EVENT_NAMES = new Set([
  'AUTOSAVE_FAILED',
  'OFFLINE_REPLAY_FAILED',
  'VERSION_CONFLICT_DETECTED',
  'VERSION_CONFLICT_RESOLVED',
  'REALTIME_RESYNC_REQUIRED',
  'OFFLINE_WRITE_QUEUED',
])

export type TelemetryFlushReason =
  'batch_size' | 'interval' | 'manual' | 'pagehide' | 'startup' | 'online' | 'dispose'
