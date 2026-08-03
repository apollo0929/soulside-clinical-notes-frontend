import { parseIsoDateTime } from '@/domain/datetime'
import type { TelemetryBatchId } from '@/domain/ids'
import {
  MAX_TELEMETRY_BATCH_PAYLOAD_BYTES,
  MAX_TELEMETRY_EVENTS_PER_BATCH,
  type TelemetryBatchRequestDto,
  telemetryBatchRequestDtoSchema,
  type TelemetryBatchResponseDto,
} from '@/domain/schemas/telemetry'
import { createMockApiError, type MockApiError } from '@/mock/errors'
import { fingerprintTelemetryBatch } from '@/services/telemetry/telemetry-batch-id'

type AcceptedBatch = {
  readonly batchId: TelemetryBatchId
  readonly fingerprint: string
  readonly acceptedEventCount: number
  readonly response: TelemetryBatchResponseDto
}

/**
 * Mock telemetry acceptor. Deduplicates by batchId + fingerprint.
 * Does not log event payloads.
 */
export class MockTelemetryService {
  readonly #accepted = new Map<string, AcceptedBatch>()
  #forceFailNext = false
  #acceptedCount = 0

  forceFailNext(): void {
    this.#forceFailNext = true
  }

  clearForceFail(): void {
    this.#forceFailNext = false
  }

  getAcceptedBatchCount(): number {
    return this.#acceptedCount
  }

  getAcceptedBatchIds(): readonly string[] {
    return [...this.#accepted.keys()]
  }

  /** Test inspection: accepted event names by batch (no clinical fields). */
  listAcceptedEventNamesByBatch(): ReadonlyMap<string, readonly string[]> {
    return this.#eventNamesByBatch
  }

  readonly #eventNamesByBatch = new Map<string, readonly string[]>()

  clear(): void {
    this.#accepted.clear()
    this.#eventNamesByBatch.clear()
    this.#acceptedCount = 0
    this.#forceFailNext = false
  }

  accept(body: unknown): TelemetryBatchResponseDto | MockApiError {
    if (this.#forceFailNext) {
      this.#forceFailNext = false
      return createMockApiError({
        code: 'SIMULATED_INTERNAL_ERROR',
        status: 500,
        message: 'Simulated telemetry failure.',
      })
    }

    const serialized = JSON.stringify(body)
    if (serialized.length > MAX_TELEMETRY_BATCH_PAYLOAD_BYTES) {
      return createMockApiError({
        code: 'INVALID_REQUEST',
        status: 400,
        message: 'Telemetry batch payload too large.',
      })
    }

    const parsed = telemetryBatchRequestDtoSchema.safeParse(body)
    if (!parsed.success) {
      return createMockApiError({
        code: 'INVALID_REQUEST',
        status: 400,
        message: 'Invalid telemetry batch.',
      })
    }

    const request = parsed.data
    if (request.events.length > MAX_TELEMETRY_EVENTS_PER_BATCH) {
      return createMockApiError({
        code: 'INVALID_REQUEST',
        status: 400,
        message: 'Too many events in telemetry batch.',
      })
    }

    const fingerprint = fingerprintTelemetryBatch(request.events)
    const key = String(request.batchId)
    const existing = this.#accepted.get(key)
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        return createMockApiError({
          code: 'INVALID_REQUEST',
          status: 400,
          message: 'Telemetry batch fingerprint conflict.',
        })
      }
      return existing.response
    }

    const response: TelemetryBatchResponseDto = {
      acceptedBatchId: request.batchId,
      acceptedEventCount: request.events.length,
    }
    this.#accepted.set(key, {
      batchId: request.batchId,
      fingerprint,
      acceptedEventCount: request.events.length,
      response,
    })
    this.#eventNamesByBatch.set(key, Object.freeze(request.events.map((event) => event.eventName)))
    this.#acceptedCount += 1
    // Touch createdAt for schema completeness without logging payloads.
    void parseIsoDateTime(String(request.createdAt))
    return response
  }

  /** DEV/test: inspect request shape without logging payloads. */
  summarizeRequest(request: TelemetryBatchRequestDto): {
    readonly batchId: string
    readonly eventCount: number
    readonly eventNames: readonly string[]
  } {
    return {
      batchId: String(request.batchId),
      eventCount: request.events.length,
      eventNames: request.events.map((event) => event.eventName),
    }
  }
}
