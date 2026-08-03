import {
  MAX_TELEMETRY_ARRAY_LENGTH,
  MAX_TELEMETRY_OBJECT_DEPTH,
  MAX_TELEMETRY_STRING_LENGTH,
  type TelemetryEvent,
  telemetryEventSchema,
} from '@/domain/schemas/telemetry'

export const TELEMETRY_FORBIDDEN_KEYS = [
  'content',
  'subjective',
  'objective',
  'assessment',
  'plan',
  'patientName',
  'patientDisplayName',
  'patient',
  'rejectionReason',
  'manualValue',
  'searchText',
  'query',
  'q',
  'noteId',
  'noteIds',
  'stack',
  'stackTrace',
  'message',
  'errorMessage',
  'body',
  'responseBody',
  'url',
  'href',
] as const

const FORBIDDEN_KEY_SET = new Set<string>(TELEMETRY_FORBIDDEN_KEYS.map((key) => key.toLowerCase()))

export type RedactionResult =
  | { readonly ok: true; readonly event: TelemetryEvent }
  | { readonly ok: false; readonly reason: string }

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function looksLikeUrlWithQuery(value: string): boolean {
  return /https?:\/\//i.test(value) && value.includes('?')
}

function looksLikeNoteId(value: string): boolean {
  return /^note_[a-zA-Z0-9_-]+$/.test(value)
}

function scanValue(value: unknown, depth: number, path: string): string | null {
  if (depth > MAX_TELEMETRY_OBJECT_DEPTH) {
    return `object depth exceeded at ${path}`
  }

  if (typeof value === 'string') {
    if (value.length > MAX_TELEMETRY_STRING_LENGTH) {
      return `string length exceeded at ${path}`
    }
    if (looksLikeUrlWithQuery(value)) {
      return `url with query rejected at ${path}`
    }
    if (looksLikeNoteId(value)) {
      return `raw note id rejected at ${path}`
    }
    return null
  }

  if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return null
  }

  if (Array.isArray(value)) {
    if (value.length > MAX_TELEMETRY_ARRAY_LENGTH) {
      return `array length exceeded at ${path}`
    }
    for (let index = 0; index < value.length; index += 1) {
      const nested = scanValue(value[index], depth + 1, `${path}[${index}]`)
      if (nested) {
        return nested
      }
    }
    return null
  }

  if (isPlainObject(value)) {
    for (const [key, nestedValue] of Object.entries(value)) {
      if (FORBIDDEN_KEY_SET.has(key.toLowerCase())) {
        return `forbidden key "${key}" at ${path}`
      }
      const nested = scanValue(nestedValue, depth + 1, path ? `${path}.${key}` : key)
      if (nested) {
        return nested
      }
    }
    return null
  }

  return `unsupported value type at ${path}`
}

/**
 * Runtime sanitizer at the telemetry boundary. Typed events still pass through.
 * Rejects unsafe events entirely (no partial send). Does not mutate input.
 */
export function redactTelemetryEvent(input: unknown): RedactionResult {
  const parsed = telemetryEventSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, reason: 'schema_validation_failed' }
  }

  const clone = structuredClone(parsed.data) as unknown
  const scanError = scanValue(clone, 0, 'event')
  if (scanError) {
    return { ok: false, reason: scanError }
  }

  return { ok: true, event: deepFreeze(clone) as TelemetryEvent }
}

/** Exported for unit tests: recursive forbidden-key / depth / URL scan. */
export function scanTelemetryValueForTests(value: unknown): string | null {
  return scanValue(value, 0, 'root')
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') {
    return value
  }
  Object.freeze(value)
  for (const nested of Object.values(value as Record<string, unknown>)) {
    if (nested !== null && typeof nested === 'object' && !Object.isFrozen(nested)) {
      deepFreeze(nested)
    }
  }
  return value
}

export function isForbiddenTelemetryKey(key: string): boolean {
  return FORBIDDEN_KEY_SET.has(key.toLowerCase())
}
