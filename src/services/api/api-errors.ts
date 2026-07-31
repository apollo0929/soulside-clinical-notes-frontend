import { z } from 'zod'

export type ApiClientErrorDetails = Readonly<Record<string, string | number | boolean | null>>

export type ApiClientErrorInit = {
  readonly status: number
  readonly code: string
  readonly message: string
  readonly details?: ApiClientErrorDetails | null
  readonly cause?: unknown
}

/**
 * Typed API boundary error. UI components receive this instead of raw Response.
 */
export class ApiClientError extends Error {
  readonly status: number
  readonly code: string
  readonly details: ApiClientErrorDetails | null

  constructor(init: ApiClientErrorInit) {
    super(init.message, init.cause !== undefined ? { cause: init.cause } : undefined)
    this.name = 'ApiClientError'
    this.status = init.status
    this.code = init.code
    this.details = init.details ?? null
  }
}

export function isApiClientError(value: unknown): value is ApiClientError {
  return value instanceof ApiClientError
}

export type NetworkApiErrorInit = {
  readonly message: string
  readonly cause?: unknown
}

/**
 * Distinct from HTTP error bodies: fetch failed before a typed response arrived.
 */
export class NetworkApiError extends Error {
  readonly status = 0
  readonly code = 'NETWORK_ERROR' as const
  readonly details = null

  constructor(init: NetworkApiErrorInit) {
    super(init.message, init.cause !== undefined ? { cause: init.cause } : undefined)
    this.name = 'NetworkApiError'
  }
}

export function isNetworkApiError(value: unknown): value is NetworkApiError {
  return value instanceof NetworkApiError
}

const backendErrorBodySchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .nullable()
      .optional(),
  }),
})

export function parseBackendErrorBody(body: unknown): {
  code: string
  message: string
  details: ApiClientErrorDetails | null
} | null {
  const parsed = backendErrorBodySchema.safeParse(body)
  if (!parsed.success) {
    return null
  }
  return {
    code: parsed.data.error.code,
    message: parsed.data.error.message,
    details: parsed.data.error.details ?? null,
  }
}
