import type { VersionConflictResponseDto } from '@/domain/schemas'

export const MOCK_ERROR_CODES = [
  'SIMULATED_INTERNAL_ERROR',
  'NOT_FOUND',
  'FORBIDDEN',
  'INVALID_REQUEST',
  'INVALID_CURSOR',
  'INVALID_TRANSITION',
  'VERSION_CONFLICT',
  'ABORTED',
  'BASE_VERSION_NOT_FOUND',
  'BASE_VERSION_NOTE_MISMATCH',
  'IDEMPOTENCY_KEY_REUSED',
  'VERSION_GRAPH_INVALID',
  'STATUS_NOT_EDITABLE',
] as const

export type MockErrorCode = (typeof MOCK_ERROR_CODES)[number]

export type MockApiError = {
  readonly name: 'MockApiError'
  readonly code: MockErrorCode
  readonly status: number
  readonly message: string
  readonly details: Readonly<Record<string, string | number | boolean | null>> | null
  readonly conflict: VersionConflictResponseDto | null
}

export function createMockApiError(input: {
  readonly code: MockErrorCode
  readonly status: number
  readonly message: string
  readonly details?: Readonly<Record<string, string | number | boolean | null>> | null
  readonly conflict?: VersionConflictResponseDto | null
}): MockApiError {
  return {
    name: 'MockApiError',
    code: input.code,
    status: input.status,
    message: input.message,
    details: input.details ?? null,
    conflict: input.conflict ?? null,
  }
}

export function isMockApiError(value: unknown): value is MockApiError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    (value as { name: unknown }).name === 'MockApiError' &&
    'code' in value &&
    'status' in value &&
    'message' in value
  )
}

export function mockErrorHttpBody(error: MockApiError): {
  readonly error: {
    readonly code: MockErrorCode
    readonly message: string
    readonly details: MockApiError['details']
  }
} {
  return {
    error: {
      code: error.code,
      message: error.message,
      details: error.details,
    },
  }
}
