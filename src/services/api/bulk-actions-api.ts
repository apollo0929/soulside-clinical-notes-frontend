import { mapNoteListItemDtoToNoteSummary } from '@/domain/mappers/note-list'
import type { NoteSummary } from '@/domain/models/note-summary'
import {
  type BulkAssignReviewerRequestDto,
  bulkAssignReviewerRequestDtoSchema,
  bulkAssignReviewerResponseDtoSchema,
  type BulkRegenerateRequestDto,
  bulkRegenerateRequestDtoSchema,
  bulkRegenerateResponseDtoSchema,
} from '@/domain/schemas'
import { apiRequest } from '@/services/api/api-client'
import { ApiClientError } from '@/services/api/api-errors'

export type BulkAssignReviewerClientRequest = BulkAssignReviewerRequestDto
export type BulkRegenerateClientRequest = BulkRegenerateRequestDto

export type BulkItemSuccess = {
  readonly noteId: string
  readonly success: true
  readonly note: NoteSummary
}

export type BulkItemFailure = {
  readonly noteId: string
  readonly success: false
  readonly error: { readonly code: string; readonly message: string }
}

export type BulkItemResult = BulkItemSuccess | BulkItemFailure

export type BulkMutationClientResult = {
  readonly results: readonly BulkItemResult[]
}

export type BulkActionOptions = {
  readonly signal?: AbortSignal
}

export async function assignReviewerBulk(
  request: BulkAssignReviewerClientRequest,
  options: BulkActionOptions = {},
): Promise<BulkMutationClientResult> {
  const validatedRequest = bulkAssignReviewerRequestDtoSchema.parse(request)
  const { body } = await apiRequest('/api/notes/bulk/assign-reviewer', {
    method: 'POST',
    body: validatedRequest,
    ...(options.signal ? { signal: options.signal } : {}),
  })

  const parsed = bulkAssignReviewerResponseDtoSchema.safeParse(body)
  if (!parsed.success) {
    throw new ApiClientError({
      status: 200,
      code: 'INVALID_RESPONSE_SCHEMA',
      message: 'Bulk assign response failed contract validation.',
      details: { issueCount: parsed.error.issues.length },
    })
  }

  return {
    results: parsed.data.results.map((item) =>
      item.success
        ? {
            noteId: item.noteId,
            success: true as const,
            note: mapNoteListItemDtoToNoteSummary(item.note),
          }
        : {
            noteId: item.noteId,
            success: false as const,
            error: item.error,
          },
    ),
  }
}

export async function regenerateNotesBulk(
  request: BulkRegenerateClientRequest,
  options: BulkActionOptions = {},
): Promise<BulkMutationClientResult> {
  const validatedRequest = bulkRegenerateRequestDtoSchema.parse(request)
  const { body } = await apiRequest('/api/notes/bulk/regenerate', {
    method: 'POST',
    body: validatedRequest,
    ...(options.signal ? { signal: options.signal } : {}),
  })

  const parsed = bulkRegenerateResponseDtoSchema.safeParse(body)
  if (!parsed.success) {
    throw new ApiClientError({
      status: 200,
      code: 'INVALID_RESPONSE_SCHEMA',
      message: 'Bulk regenerate response failed contract validation.',
      details: { issueCount: parsed.error.issues.length },
    })
  }

  return {
    results: parsed.data.results.map((item) =>
      item.success
        ? {
            noteId: item.noteId,
            success: true as const,
            note: mapNoteListItemDtoToNoteSummary(item.note),
          }
        : {
            noteId: item.noteId,
            success: false as const,
            error: item.error,
          },
    ),
  }
}

import { parseClientMutationId } from '@/domain/ids'

export function createClientMutationId(prefix: string) {
  return parseClientMutationId(
    `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
  )
}
