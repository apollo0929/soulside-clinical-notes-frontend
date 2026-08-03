import {
  type TelemetryBatchRequestDto,
  type TelemetryBatchResponseDto,
  telemetryBatchResponseDtoSchema,
} from '@/domain/schemas/telemetry'
import { apiRequest } from '@/services/api/api-client'
import { ApiClientError } from '@/services/api/api-errors'

/**
 * Typed telemetry delivery. Feature code must not call fetch for telemetry.
 */
export async function postTelemetryBatch(
  request: TelemetryBatchRequestDto,
  options: { readonly signal?: AbortSignal } = {},
): Promise<TelemetryBatchResponseDto> {
  const { status, body } = await apiRequest('/api/telemetry/batches', {
    method: 'POST',
    body: request,
    ...(options.signal ? { signal: options.signal } : {}),
  })

  if (status < 200 || status >= 300) {
    throw new ApiClientError({
      status,
      code: 'TELEMETRY_DELIVERY_FAILED',
      message: 'Telemetry batch was not accepted.',
    })
  }

  const parsed = telemetryBatchResponseDtoSchema.safeParse(body)
  if (!parsed.success) {
    throw new ApiClientError({
      status,
      code: 'INVALID_TELEMETRY_RESPONSE',
      message: 'Telemetry response failed contract validation.',
    })
  }
  return parsed.data
}

export type TelemetryTransport = {
  sendBatch(
    request: TelemetryBatchRequestDto,
    options?: { readonly signal?: AbortSignal },
  ): Promise<TelemetryBatchResponseDto>
}

export function createHttpTelemetryTransport(): TelemetryTransport {
  return {
    sendBatch: postTelemetryBatch,
  }
}
