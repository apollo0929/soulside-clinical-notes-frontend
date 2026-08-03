export type RealtimeFailureKind = 'retryable' | 'non_retryable'

export type RealtimeConnectionFailure = {
  readonly kind: RealtimeFailureKind
  readonly status: number | null
  readonly reason: string
}

/**
 * Classify HTTP statuses for the realtime stream endpoint.
 * 404/401/403/400 are terminal; 5xx and selected timeouts are retryable.
 */
export function classifyRealtimeHttpStatus(status: number): RealtimeFailureKind {
  if (status === 408 || status === 429) {
    return 'retryable'
  }
  if (status >= 500 && status <= 599) {
    return 'retryable'
  }
  if (status === 400 || status === 401 || status === 403 || status === 404) {
    return 'non_retryable'
  }
  if (status >= 400 && status <= 499) {
    return 'non_retryable'
  }
  return 'retryable'
}

export function classifyRealtimeNetworkError(): RealtimeConnectionFailure {
  return {
    kind: 'retryable',
    status: null,
    reason: 'network_error',
  }
}

export function classifyRealtimeHttpFailure(status: number): RealtimeConnectionFailure {
  return {
    kind: classifyRealtimeHttpStatus(status),
    status,
    reason: `http_${status}`,
  }
}

export function classifyRealtimeContentTypeFailure(): RealtimeConnectionFailure {
  return {
    kind: 'non_retryable',
    status: null,
    reason: 'invalid_content_type',
  }
}
