import type { IsoDateTime } from '@/domain/datetime'
import type { TelemetryBatchId, TelemetryEventId } from '@/domain/ids'
import type { TelemetryEvent } from '@/domain/schemas/telemetry'

export type StoredTelemetryBatchStatus = 'PENDING' | 'SENDING'

export type StoredTelemetryBatch = {
  readonly batchId: TelemetryBatchId
  readonly events: readonly TelemetryEvent[]
  readonly eventIds: readonly TelemetryEventId[]
  readonly fingerprint: string
  readonly createdAt: IsoDateTime
  readonly retryCount: number
  readonly status: StoredTelemetryBatchStatus
}
