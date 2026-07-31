export const MOCK_ERROR_CODES = [
  'SIMULATED_INTERNAL_ERROR',
  'NOT_FOUND',
  'FORBIDDEN',
  'INVALID_REQUEST',
  'INVALID_CURSOR',
  'INVALID_TRANSITION',
  'VERSION_CONFLICT',
  'ABORTED',
] as const

export type MockErrorCode = (typeof MOCK_ERROR_CODES)[number]

export type MockApiError = {
  readonly name: 'MockApiError'
  readonly code: MockErrorCode
  readonly status: number
  readonly message: string
  readonly details: Readonly<Record<string, string | number | boolean | null>> | null
}

export function createMockApiError(input: {
  readonly code: MockErrorCode
  readonly status: number
  readonly message: string
  readonly details?: Readonly<Record<string, string | number | boolean | null>> | null
}): MockApiError {
  return {
    name: 'MockApiError',
    code: input.code,
    status: input.status,
    message: input.message,
    details: input.details ?? null,
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
