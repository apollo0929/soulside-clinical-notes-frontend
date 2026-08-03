import type { IsoDateTime } from '@/domain/datetime'
import { parseIsoDateTime } from '@/domain/datetime'
import type { TelemetryBatchId } from '@/domain/ids'
import { parseTelemetryBatchId } from '@/domain/ids'
import type { TelemetryEvent } from '@/domain/schemas/telemetry'

export function createBrowserTelemetryBatchIdGenerator(): {
  next(): TelemetryBatchId
} {
  return {
    next: () => {
      const uuid =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `fallback_${Date.now()}_${Math.random().toString(36).slice(2)}`
      return parseTelemetryBatchId(`tel_bat_${uuid}`)
    },
  }
}

export function createSequentialTelemetryBatchIdGenerator(prefix = 'tel_bat'): {
  next(): TelemetryBatchId
} {
  let sequence = 0
  return {
    next: () => {
      sequence += 1
      return parseTelemetryBatchId(`${prefix}_${sequence}`)
    },
  }
}

/**
 * Stable fingerprint of the exact event set for idempotent batch delivery.
 * Same events → same fingerprint; changed set → different fingerprint.
 */
export function fingerprintTelemetryBatch(events: readonly TelemetryEvent[]): string {
  const ids = events.map((event) => String(event.eventId)).join('|')
  return `fp_${ids.length}_${hashString(ids)}`
}

function hashString(input: string): string {
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}

export function createTelemetryBatchCreatedAt(
  now: () => IsoDateTime = () => parseIsoDateTime(new Date().toISOString()),
): IsoDateTime {
  return now()
}
