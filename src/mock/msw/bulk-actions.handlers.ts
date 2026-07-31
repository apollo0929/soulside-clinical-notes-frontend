import { http, HttpResponse } from 'msw'

import {
  bulkAssignReviewerRequestDtoSchema,
  bulkAssignReviewerResponseDtoSchema,
  bulkRegenerateRequestDtoSchema,
  bulkRegenerateResponseDtoSchema,
} from '@/domain/schemas'
import {
  createMockApiError,
  isMockApiError,
  type MockApiError,
  mockErrorHttpBody,
} from '@/mock/errors'
import { parseActorHeaders } from '@/mock/msw/actor-headers'
import type { MockBackendService } from '@/mock/services/backend'

export function createBulkActionHandlers(backend: MockBackendService) {
  return [
    http.post('*/api/notes/bulk/assign-reviewer', async ({ request }) => {
      const actor = parseActorHeaders(request.headers)
      if (isMockApiError(actor)) {
        return errorResponse(actor)
      }

      let body: unknown
      try {
        body = await request.json()
      } catch {
        return errorResponse(
          createMockApiError({
            code: 'INVALID_REQUEST',
            status: 400,
            message: 'Request body must be JSON.',
          }),
        )
      }

      const parsed = bulkAssignReviewerRequestDtoSchema.safeParse(body)
      if (!parsed.success) {
        return errorResponse(
          createMockApiError({
            code: 'INVALID_REQUEST',
            status: 400,
            message: 'Invalid bulk assign-reviewer request body.',
          }),
        )
      }

      const result = await backend.bulkAssignReviewer({
        actor,
        noteIds: parsed.data.noteIds,
        reviewerId: parsed.data.reviewerId,
        clientMutationId: parsed.data.clientMutationId,
        occurredAt: backend.clock.now(),
        signal: request.signal,
      })
      if (isMockApiError(result)) {
        return errorResponse(result)
      }

      const validated = bulkAssignReviewerResponseDtoSchema.safeParse(result)
      if (!validated.success) {
        return errorResponse(
          createMockApiError({
            code: 'SIMULATED_INTERNAL_ERROR',
            status: 500,
            message: 'Bulk assign response failed contract validation.',
          }),
        )
      }
      return HttpResponse.json(validated.data, { status: 200 })
    }),

    http.post('*/api/notes/bulk/regenerate', async ({ request }) => {
      const actor = parseActorHeaders(request.headers)
      if (isMockApiError(actor)) {
        return errorResponse(actor)
      }

      let body: unknown
      try {
        body = await request.json()
      } catch {
        return errorResponse(
          createMockApiError({
            code: 'INVALID_REQUEST',
            status: 400,
            message: 'Request body must be JSON.',
          }),
        )
      }

      const parsed = bulkRegenerateRequestDtoSchema.safeParse(body)
      if (!parsed.success) {
        return errorResponse(
          createMockApiError({
            code: 'INVALID_REQUEST',
            status: 400,
            message: 'Invalid bulk regenerate request body.',
          }),
        )
      }

      const result = await backend.bulkRegenerate({
        actor,
        noteIds: parsed.data.noteIds,
        clientMutationId: parsed.data.clientMutationId,
        occurredAt: backend.clock.now(),
        signal: request.signal,
      })
      if (isMockApiError(result)) {
        return errorResponse(result)
      }

      const validated = bulkRegenerateResponseDtoSchema.safeParse(result)
      if (!validated.success) {
        return errorResponse(
          createMockApiError({
            code: 'SIMULATED_INTERNAL_ERROR',
            status: 500,
            message: 'Bulk regenerate response failed contract validation.',
          }),
        )
      }
      return HttpResponse.json(validated.data, { status: 200 })
    }),
  ]
}

function errorResponse(error: MockApiError) {
  return HttpResponse.json(mockErrorHttpBody(error), { status: error.status })
}
