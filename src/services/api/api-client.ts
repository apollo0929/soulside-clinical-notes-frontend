import { getActorHeaders } from '@/services/api/actor-provider'
import { ApiClientError, NetworkApiError, parseBackendErrorBody } from '@/services/api/api-errors'

export type ApiRequestOptions = {
  readonly method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  readonly searchParams?: URLSearchParams
  readonly body?: unknown
  readonly signal?: AbortSignal
  readonly headers?: HeadersInit
  /** When false, omit the development actor headers. Default true. */
  readonly includeActor?: boolean
}

function buildUrl(path: string, searchParams?: URLSearchParams): string {
  if (!searchParams || [...searchParams.keys()].length === 0) {
    return path
  }
  const query = searchParams.toString()
  return query.length === 0 ? path : `${path}?${query}`
}

async function readJsonBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (text.trim() === '') {
    return null
  }
  try {
    return JSON.parse(text) as unknown
  } catch (cause) {
    throw new ApiClientError({
      status: response.status,
      code: 'INVALID_RESPONSE_JSON',
      message: 'Response body was not valid JSON.',
      cause,
    })
  }
}

/**
 * Shared fetch wrapper: actor headers, AbortSignal, typed non-2xx mapping.
 * Does not return unchecked JSON to callers — use with Zod at the feature edge.
 */
export async function apiRequest(
  path: string,
  options: ApiRequestOptions = {},
): Promise<{ readonly status: number; readonly body: unknown }> {
  const headers = new Headers(options.headers)
  if (options.includeActor !== false) {
    const actorHeaders = getActorHeaders()
    for (const [key, value] of Object.entries(actorHeaders)) {
      if (!headers.has(key)) {
        headers.set(key, value)
      }
    }
  }
  if (options.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }

  const init: RequestInit = {
    method: options.method ?? 'GET',
    headers,
  }
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body)
  }
  if (options.signal) {
    init.signal = options.signal
  }

  let response: Response
  try {
    response = await fetch(buildUrl(path, options.searchParams), init)
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      throw cause
    }
    if (cause instanceof Error && cause.name === 'AbortError') {
      throw cause
    }
    throw new NetworkApiError({
      message: cause instanceof Error ? cause.message : 'Network request failed.',
      cause,
    })
  }

  const body = await readJsonBody(response)

  if (!response.ok) {
    const parsed = parseBackendErrorBody(body)
    throw new ApiClientError({
      status: response.status,
      code: parsed?.code ?? 'UNKNOWN_ERROR',
      message: parsed?.message ?? `Request failed with status ${response.status}.`,
      details: parsed?.details ?? null,
    })
  }

  return { status: response.status, body }
}
