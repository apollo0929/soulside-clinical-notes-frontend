import type { TelemetryEvent } from '@/domain/schemas/telemetry'
import type { TelemetryFlushReason } from '@/services/telemetry/telemetry-constants'

/**
 * Application-facing telemetry client. Implementations must never throw into callers
 * from `track`. Delivery failures are isolated from product workflows.
 */
export interface TelemetryClient {
  track(event: TelemetryEvent): void
  flush(reason: TelemetryFlushReason): Promise<void>
  dispose(): Promise<void> | void
}

export type TelemetryDiagnostics = {
  readonly droppedEvents: number
  readonly bufferedEvents: number
  readonly pendingStoredBatches: number
}
