import { type NoteId, parseSessionId, type SessionId, type VersionId } from '@/domain/ids'
import { mapNoteDetailDtoToDomain } from '@/domain/mappers/note-detail'
import { mapNoteVersionDtoToDomain } from '@/domain/mappers/note-version'
import type { NoteDetailAggregate } from '@/domain/models/note-detail-aggregate'
import type { NoteVersion } from '@/domain/models/note-version'
import { noteDetailDtoSchema, noteVersionDetailDtoSchema } from '@/domain/schemas'
import { apiRequest } from '@/services/api/api-client'
import { ApiClientError } from '@/services/api/api-errors'

/**
 * Transport detail DTOs omit sessionId. Domain Note requires one; use a stable
 * placeholder until the API exposes session association.
 */
export const DETAIL_TRANSPORT_SESSION_ID: SessionId = parseSessionId('sess_transport_omitted')

export type NoteDetailApiOptions = {
  readonly signal?: AbortSignal
  readonly sessionId?: SessionId
}

export async function getNoteDetail(
  noteId: NoteId,
  options: NoteDetailApiOptions = {},
): Promise<NoteDetailAggregate> {
  const { body } = await apiRequest(`/api/notes/${noteId}`, {
    method: 'GET',
    ...(options.signal ? { signal: options.signal } : {}),
  })

  const parsed = noteDetailDtoSchema.safeParse(body)
  if (!parsed.success) {
    throw new ApiClientError({
      status: 200,
      code: 'INVALID_RESPONSE_SCHEMA',
      message: 'Note detail response failed contract validation.',
      details: { issueCount: parsed.error.issues.length },
    })
  }

  return mapNoteDetailDtoToDomain(parsed.data, {
    sessionId: options.sessionId ?? DETAIL_TRANSPORT_SESSION_ID,
  })
}

export async function getNoteVersionContent(
  noteId: NoteId,
  versionId: VersionId,
  options: NoteDetailApiOptions = {},
): Promise<NoteVersion> {
  const { body } = await apiRequest(`/api/notes/${noteId}/versions/${versionId}`, {
    method: 'GET',
    ...(options.signal ? { signal: options.signal } : {}),
  })

  const parsed = noteVersionDetailDtoSchema.safeParse(body)
  if (!parsed.success) {
    throw new ApiClientError({
      status: 200,
      code: 'INVALID_RESPONSE_SCHEMA',
      message: 'Note version response failed contract validation.',
      details: { issueCount: parsed.error.issues.length },
    })
  }

  return mapNoteVersionDtoToDomain(parsed.data, noteId)
}
