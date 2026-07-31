import type { ClientMutationId, NoteId, VersionId } from '@/domain/ids'
import { mapSoapContentToDto } from '@/domain/mappers/soap'
import type { SoapContent } from '@/domain/models/soap'
import {
  type VersionConflictResponseDto,
  versionConflictResponseDtoSchema,
} from '@/domain/schemas/conflict'
import {
  createVersionRequestDtoSchema,
  type CreateVersionSuccessResponseDto,
  createVersionSuccessResponseDtoSchema,
} from '@/domain/schemas/create-version'
import { getActorHeaders } from '@/services/api/actor-provider'
import { ApiClientError, NetworkApiError } from '@/services/api/api-errors'

export type CreateNoteVersionInput = {
  readonly noteId: NoteId
  readonly baseVersionId: VersionId
  readonly content: SoapContent
  readonly clientMutationId: ClientMutationId
}

export type CreateNoteVersionOptions = {
  readonly signal?: AbortSignal
}

export class VersionConflictApiError extends Error {
  readonly status = 409 as const
  readonly code = 'VERSION_CONFLICT' as const
  readonly conflict: VersionConflictResponseDto

  constructor(conflict: VersionConflictResponseDto) {
    super('A newer version of this note exists on the server.')
    this.name = 'VersionConflictApiError'
    this.conflict = conflict
  }
}

export function isVersionConflictApiError(value: unknown): value is VersionConflictApiError {
  return value instanceof VersionConflictApiError
}

export type CreateNoteVersionResult = {
  readonly version: CreateVersionSuccessResponseDto['version']
  /** Domain content that was saved (request payload). */
  readonly savedContent: SoapContent
}

/**
 * Typed create-version client. Special-cases 409 version_conflict body shape.
 */
export async function createNoteVersion(
  input: CreateNoteVersionInput,
  options: CreateNoteVersionOptions = {},
): Promise<CreateNoteVersionResult> {
  const requestDto = createVersionRequestDtoSchema.parse({
    baseVersionId: input.baseVersionId,
    content: mapSoapContentToDto(input.content),
    clientMutationId: input.clientMutationId,
  })

  const headers = new Headers(getActorHeaders())
  headers.set('content-type', 'application/json')

  const init: RequestInit = {
    method: 'POST',
    headers,
    body: JSON.stringify(requestDto),
  }
  if (options.signal) {
    init.signal = options.signal
  }

  let response: Response
  try {
    response = await fetch(`/api/notes/${encodeURIComponent(input.noteId)}/versions`, init)
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

  const text = await response.text()
  let body: unknown = null
  if (text.trim() !== '') {
    try {
      body = JSON.parse(text) as unknown
    } catch (cause) {
      throw new ApiClientError({
        status: response.status,
        code: 'INVALID_RESPONSE_JSON',
        message: 'Response body was not valid JSON.',
        cause,
      })
    }
  }

  if (response.status === 409) {
    const conflict = versionConflictResponseDtoSchema.safeParse(body)
    if (conflict.success) {
      throw new VersionConflictApiError(conflict.data)
    }
  }

  if (!response.ok) {
    const errorBody = body as { error?: { code?: string; message?: string } } | null
    throw new ApiClientError({
      status: response.status,
      code: errorBody?.error?.code ?? 'UNKNOWN_ERROR',
      message: errorBody?.error?.message ?? `Create version failed with status ${response.status}.`,
    })
  }

  const parsed = createVersionSuccessResponseDtoSchema.safeParse(body)
  if (!parsed.success) {
    throw new ApiClientError({
      status: response.status,
      code: 'INVALID_RESPONSE_SCHEMA',
      message: 'Create version response failed contract validation.',
      details: { issueCount: parsed.error.issues.length },
    })
  }

  return {
    version: parsed.data.version,
    savedContent: Object.freeze({
      subjective: input.content.subjective,
      objective: input.content.objective,
      assessment: input.content.assessment,
      plan: input.content.plan,
    }),
  }
}
