import { describe, expect, it } from 'vitest'

import { parseIsoDateTime } from '@/domain/datetime'
import { parseTelemetryEventId, parseTelemetrySessionId } from '@/domain/ids'
import type { TelemetryEvent } from '@/domain/schemas/telemetry'
import {
  isForbiddenTelemetryKey,
  redactTelemetryEvent,
  scanTelemetryValueForTests,
} from '@/services/telemetry/telemetry-redaction'

function baseEvent(overrides: Record<string, unknown> = {}): unknown {
  return {
    eventId: parseTelemetryEventId('tel_evt_redact_1'),
    eventName: 'AUTOSAVE_FAILED',
    occurredAt: parseIsoDateTime('2024-07-01T00:00:00.000Z'),
    sessionId: parseTelemetrySessionId('tel_ses_redact'),
    actorRole: 'CLINICIAN',
    appVersion: '0.1.0',
    payload: { errorCode: 'NETWORK', durationBucket: 'LT_250_MS' },
    ...overrides,
  }
}

describe('telemetry redaction', () => {
  it('11–20: rejects clinical/PII/URL/message keys; accepts enum codes; does not mutate', () => {
    expect(isForbiddenTelemetryKey('subjective')).toBe(true)
    expect(isForbiddenTelemetryKey('patientDisplayName')).toBe(true)

    const input = baseEvent()
    const ok = redactTelemetryEvent(input)
    expect(ok.ok).toBe(true)
    if (ok.ok) {
      expect((ok.event as TelemetryEvent).eventName).toBe('AUTOSAVE_FAILED')
    }
    expect(input).toEqual(baseEvent())

    expect(
      redactTelemetryEvent(
        baseEvent({
          payload: {
            errorCode: 'NETWORK',
            durationBucket: 'LT_250_MS',
            subjective: 'pain in chest',
          },
        }),
      ).ok,
    ).toBe(false)

    expect(
      redactTelemetryEvent(
        baseEvent({
          payload: {
            errorCode: 'NETWORK',
            durationBucket: 'LT_250_MS',
            patientDisplayName: 'Jane Doe',
          },
        }),
      ).ok,
    ).toBe(false)

    expect(
      redactTelemetryEvent(
        baseEvent({
          payload: {
            errorCode: 'NETWORK',
            durationBucket: 'LT_250_MS',
            rejectionReason: 'incomplete',
          },
        }),
      ).ok,
    ).toBe(false)

    expect(
      redactTelemetryEvent(
        baseEvent({
          payload: {
            errorCode: 'NETWORK',
            durationBucket: 'LT_250_MS',
            manualValue: 'merged text',
          },
        }),
      ).ok,
    ).toBe(false)

    expect(
      redactTelemetryEvent(
        baseEvent({
          payload: {
            errorCode: 'NETWORK',
            durationBucket: 'LT_250_MS',
            url: 'https://example.com/notes?q=secret',
          },
        }),
      ).ok,
    ).toBe(false)

    expect(
      redactTelemetryEvent(
        baseEvent({
          payload: {
            errorCode: 'NETWORK',
            durationBucket: 'LT_250_MS',
            message: 'raw exception text',
          },
        }),
      ).ok,
    ).toBe(false)

    expect(redactTelemetryEvent(baseEvent()).ok).toBe(true)

    expect(
      redactTelemetryEvent(
        baseEvent({
          payload: {
            errorCode: 'NETWORK',
            durationBucket: 'LT_250_MS',
            nested: { plan: 'clinical plan' },
          },
        }),
      ).ok,
    ).toBe(false)

    const first = redactTelemetryEvent(baseEvent())
    const second = redactTelemetryEvent(baseEvent())
    expect(first).toEqual(second)

    expect(
      scanTelemetryValueForTests({
        safe: true,
        nested: { deeper: { subjective: 'SOAP text' } },
      }),
    ).toMatch(/forbidden key/i)

    expect(
      scanTelemetryValueForTests({
        nested: { href: 'https://example.com/notes?q=secret' },
      }),
    ).toMatch(/url|forbidden/i)

    const frozen = redactTelemetryEvent(baseEvent())
    expect(frozen.ok).toBe(true)
    if (frozen.ok) {
      expect(Object.isFrozen(frozen.event)).toBe(true)
      expect(Object.isFrozen(frozen.event.payload)).toBe(true)
      expect(() => {
        ;(frozen.event.payload as { errorCode?: string }).errorCode = 'SERVER'
      }).toThrow()
    }
  })
})
