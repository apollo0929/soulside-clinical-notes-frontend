import type { TelemetryErrorCode } from '@/domain/schemas/telemetry'
import { isApiClientError, isNetworkApiError } from '@/services/api/api-errors'
import { isVersionConflictApiError } from '@/services/api/create-version-api'

/**
 * Map product errors to controlled telemetry codes. Never use exception.message.
 */
export function classifyTelemetryError(error: unknown): TelemetryErrorCode {
  if (isVersionConflictApiError(error)) {
    return 'CONFLICT'
  }
  if (isNetworkApiError(error)) {
    return 'NETWORK'
  }
  if (isApiClientError(error)) {
    if (error.status === 400 || error.code === 'INVALID_REQUEST') {
      return 'VALIDATION'
    }
    if (error.status === 403 || error.status === 401) {
      return 'FORBIDDEN'
    }
    if (error.status === 409) {
      return 'CONFLICT'
    }
    if (error.status >= 500) {
      return 'SERVER'
    }
    if (error.status === 0) {
      return 'NETWORK'
    }
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'ABORTED'
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: string }).name === 'AbortError'
  ) {
    return 'ABORTED'
  }
  return 'UNKNOWN'
}
