import type { TelemetrySessionId } from '@/domain/ids'
import { parseTelemetrySessionId } from '@/domain/ids'
import { TELEMETRY_SESSION_STORAGE_KEY } from '@/services/telemetry/telemetry-constants'

export type TelemetrySessionIdGenerator = {
  create(): TelemetrySessionId
}

export function createBrowserTelemetrySessionIdGenerator(): TelemetrySessionIdGenerator {
  return {
    create: () => {
      const uuid =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `fallback_${Date.now()}_${Math.random().toString(36).slice(2)}`
      return parseTelemetrySessionId(`tel_ses_${uuid}`)
    },
  }
}

export function createSequentialTelemetrySessionIdGenerator(
  prefix = 'tel_ses',
): TelemetrySessionIdGenerator {
  let sequence = 0
  return {
    create: () => {
      sequence += 1
      return parseTelemetrySessionId(`${prefix}_${sequence}`)
    },
  }
}

/**
 * One telemetry session id per browser tab (sessionStorage).
 * Distinct from presence SessionId and clientMutationId.
 */
export function getOrCreateTelemetrySessionId(
  generator: TelemetrySessionIdGenerator = createBrowserTelemetrySessionIdGenerator(),
): TelemetrySessionId {
  try {
    const existing = sessionStorage?.getItem(TELEMETRY_SESSION_STORAGE_KEY)
    if (existing) {
      return parseTelemetrySessionId(existing)
    }
    const created = generator.create()
    sessionStorage?.setItem(TELEMETRY_SESSION_STORAGE_KEY, String(created))
    return created
  } catch {
    return generator.create()
  }
}

export function clearTelemetrySessionIdForTests(): void {
  try {
    sessionStorage?.removeItem(TELEMETRY_SESSION_STORAGE_KEY)
  } catch {
    // private mode
  }
}
