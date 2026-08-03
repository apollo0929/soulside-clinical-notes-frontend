import { http, HttpResponse } from 'msw'

import { createMockApiError, isMockApiError, mockErrorHttpBody } from '@/mock/errors'
import type { MockBackendService } from '@/mock/services/backend'

export function createTelemetryHandlers(backend: MockBackendService) {
  return [
    http.post('*/api/telemetry/batches', async ({ request }) => {
      await backend.latency.wait({ signal: request.signal })
      try {
        backend.failures.maybeInject('telemetry.batches')
      } catch (error) {
        if (isMockApiError(error)) {
          return HttpResponse.json(mockErrorHttpBody(error), { status: error.status })
        }
        throw error
      }

      let body: unknown
      try {
        body = await request.json()
      } catch {
        return HttpResponse.json(
          mockErrorHttpBody(
            createMockApiError({
              code: 'INVALID_REQUEST',
              status: 400,
              message: 'Request body must be JSON.',
            }),
          ),
          { status: 400 },
        )
      }

      const result = backend.telemetry.accept(body)
      if (isMockApiError(result)) {
        return HttpResponse.json(mockErrorHttpBody(result), { status: result.status })
      }
      return HttpResponse.json(result)
    }),
  ]
}
