import { http, HttpResponse } from 'msw'
import { z } from 'zod'

import { parseIsoDateTime } from '@/domain/datetime'
import { parseNoteId, parsePatientId, parseUserId } from '@/domain/ids'
import { NOTE_LIFECYCLE_ACTIONS } from '@/domain/note-lifecycle'
import { TRANSITION_SOURCES } from '@/domain/note-lifecycle'
import {
  createVersionRequestDtoSchema,
  createVersionSuccessResponseDtoSchema,
  noteDetailDtoSchema,
  notesListResponseDtoSchema,
  noteStatusSchema,
  versionConflictResponseDtoSchema,
} from '@/domain/schemas'
import {
  NOTE_LIST_SORT_FIELDS,
  type NoteListSortDirection,
  type NoteListSortField,
} from '@/mock/cursor'
import {
  createMockApiError,
  isMockApiError,
  type MockApiError,
  mockErrorHttpBody,
} from '@/mock/errors'
import { parseActorHeaders } from '@/mock/msw/actor-headers'
import { createBulkActionHandlers } from '@/mock/msw/bulk-actions.handlers'
import { DEFAULT_NOTES_LIST_LIMIT, type MockBackendService } from '@/mock/services/backend'

const seedBodySchema = z.strictObject({
  count: z.number().int(),
  seed: z.number().int(),
})

const transitionBodySchema = z.strictObject({
  action: z.enum(NOTE_LIFECYCLE_ACTIONS),
  source: z.enum(TRANSITION_SOURCES),
  mfaVerified: z.boolean().optional(),
  rejectionReason: z.string().nullable().optional(),
  approvedAt: z.string().nullable().optional(),
  occurredAt: z.string(),
})

export function createMockBackendHandlers(backend: MockBackendService) {
  return [
    http.get('*/api/notes', async ({ request }) => {
      const actor = parseActorHeaders(request.headers)
      if (isMockApiError(actor)) {
        return errorResponse(actor)
      }

      const url = new URL(request.url)
      const parsed = parseListQuery(url)
      if (isMockApiError(parsed)) {
        return errorResponse(parsed)
      }

      const result = await backend.listNotes({
        actor,
        request: parsed,
        signal: request.signal,
      })
      if (isMockApiError(result)) {
        return errorResponse(result)
      }

      const validated = notesListResponseDtoSchema.safeParse(result)
      if (!validated.success) {
        return errorResponse(createInternal('List response failed contract validation.'))
      }
      return HttpResponse.json(validated.data)
    }),

    http.get('*/api/notes/:id', async ({ request, params }) => {
      const actor = parseActorHeaders(request.headers)
      if (isMockApiError(actor)) {
        return errorResponse(actor)
      }

      let noteId
      try {
        noteId = parseNoteId(String(params.id))
      } catch {
        return errorResponse(createInvalid('Invalid note id.'))
      }

      const result = await backend.getNoteDetail({
        actor,
        noteId,
        signal: request.signal,
      })
      if (isMockApiError(result)) {
        return errorResponse(result)
      }

      const validated = noteDetailDtoSchema.safeParse(result)
      if (!validated.success) {
        return errorResponse(createInternal('Detail response failed contract validation.'))
      }
      return HttpResponse.json(validated.data)
    }),

    http.post('*/api/dev/seed', async ({ request }) => {
      const actor = parseActorHeaders(request.headers)
      if (isMockApiError(actor)) {
        return errorResponse(actor)
      }

      let body: unknown
      try {
        body = await request.json()
      } catch {
        return errorResponse(createInvalid('Request body must be JSON.'))
      }

      const parsed = seedBodySchema.safeParse(body)
      if (!parsed.success) {
        return errorResponse(createInvalid('Invalid seed request body.'))
      }

      const result = await backend.seed({
        actor,
        request: parsed.data,
        signal: request.signal,
      })
      if (isMockApiError(result)) {
        return errorResponse(result)
      }

      return HttpResponse.json({
        seed: result.config.seed,
        noteCount: result.config.noteCount,
        counts: result.counts,
      })
    }),

    http.post('*/api/notes/:id/transitions', async ({ request, params }) => {
      const actor = parseActorHeaders(request.headers)
      if (isMockApiError(actor)) {
        return errorResponse(actor)
      }

      let noteId
      try {
        noteId = parseNoteId(String(params.id))
      } catch {
        return errorResponse(createInvalid('Invalid note id.'))
      }

      let body: unknown
      try {
        body = await request.json()
      } catch {
        return errorResponse(createInvalid('Request body must be JSON.'))
      }

      const parsed = transitionBodySchema.safeParse(body)
      if (!parsed.success) {
        return errorResponse(createInvalid('Invalid transition request body.'))
      }

      let occurredAt
      let approvedAt = null
      try {
        occurredAt = parseIsoDateTime(parsed.data.occurredAt)
        if (parsed.data.approvedAt) {
          approvedAt = parseIsoDateTime(parsed.data.approvedAt)
        }
      } catch {
        return errorResponse(createInvalid('Invalid timestamp in transition body.'))
      }

      const result = await backend.transition({
        actor,
        noteId,
        action: parsed.data.action,
        source: parsed.data.source,
        mfaVerified: parsed.data.mfaVerified ?? false,
        rejectionReason: parsed.data.rejectionReason ?? null,
        approvedAt,
        occurredAt,
        signal: request.signal,
      })

      if (isMockApiError(result)) {
        return errorResponse(result)
      }

      return HttpResponse.json({
        note: result.note,
        event: result.event,
        newVersionId: result.newVersion?.id ?? null,
      })
    }),

    http.post('*/api/notes/:id/versions', async ({ request, params }) => {
      const actor = parseActorHeaders(request.headers)
      if (isMockApiError(actor)) {
        return errorResponse(actor)
      }

      let noteId
      try {
        noteId = parseNoteId(String(params.id))
      } catch {
        return errorResponse(createInvalid('Invalid note id.'))
      }

      let body: unknown
      try {
        body = await request.json()
      } catch {
        return errorResponse(createInvalid('Request body must be JSON.'))
      }

      const parsed = createVersionRequestDtoSchema.safeParse(body)
      if (!parsed.success) {
        return errorResponse(createInvalid('Invalid create-version request body.'))
      }

      const result = await backend.createVersion({
        actor,
        noteId,
        baseVersionId: parsed.data.baseVersionId,
        content: parsed.data.content,
        clientMutationId: parsed.data.clientMutationId,
        occurredAt: backend.clock.now(),
        signal: request.signal,
      })

      if (isMockApiError(result)) {
        if (result.code === 'VERSION_CONFLICT' && result.conflict) {
          const conflict = versionConflictResponseDtoSchema.safeParse(result.conflict)
          if (!conflict.success) {
            return errorResponse(createInternal('Conflict response failed contract validation.'))
          }
          return HttpResponse.json(conflict.data, { status: 409 })
        }
        return errorResponse(result)
      }

      const validated = createVersionSuccessResponseDtoSchema.safeParse(result)
      if (!validated.success) {
        return errorResponse(createInternal('Create-version response failed contract validation.'))
      }
      return HttpResponse.json(validated.data, { status: 200 })
    }),

    ...createBulkActionHandlers(backend),
  ]
}

function parseListQuery(url: URL): NotesListRequestParsed | MockApiError {
  const limitRaw = url.searchParams.get('limit')
  const limit = limitRaw === null ? DEFAULT_NOTES_LIST_LIMIT : Number(limitRaw)
  if (!Number.isInteger(limit)) {
    return createInvalid('limit must be an integer.')
  }

  const sortRaw = url.searchParams.get('sort') ?? 'updatedAt'
  if (!(NOTE_LIST_SORT_FIELDS as readonly string[]).includes(sortRaw)) {
    return createInvalid('Invalid sort field.')
  }
  const sort = sortRaw as NoteListSortField

  const dirRaw = url.searchParams.get('dir') ?? 'desc'
  if (dirRaw !== 'asc' && dirRaw !== 'desc') {
    return createInvalid('Invalid sort direction.')
  }
  const dir = dirRaw as NoteListSortDirection

  const statuses: ReturnType<typeof noteStatusSchema.parse>[] = []
  for (const value of url.searchParams.getAll('status')) {
    const parsed = noteStatusSchema.safeParse(value)
    if (!parsed.success) {
      return createInvalid(`Invalid status filter: ${value}`)
    }
    statuses.push(parsed.data)
  }

  let assignedReviewerId = null
  const reviewerRaw = url.searchParams.get('assignedReviewerId')
  if (reviewerRaw) {
    try {
      assignedReviewerId = parseUserId(reviewerRaw)
    } catch {
      return createInvalid('Invalid assignedReviewerId.')
    }
  }

  let patientId = null
  const patientRaw = url.searchParams.get('patientId')
  if (patientRaw) {
    try {
      patientId = parsePatientId(patientRaw)
    } catch {
      return createInvalid('Invalid patientId.')
    }
  }

  let dateFrom = null
  let dateTo = null
  const fromRaw = url.searchParams.get('dateFrom')
  const toRaw = url.searchParams.get('dateTo')
  try {
    if (fromRaw) {
      dateFrom = parseIsoDateTime(fromRaw)
    }
    if (toRaw) {
      dateTo = parseIsoDateTime(toRaw)
    }
  } catch {
    return createInvalid('Invalid date range.')
  }

  return {
    cursor: url.searchParams.get('cursor'),
    limit,
    statuses,
    assignedReviewerId,
    patientId,
    dateFrom,
    dateTo,
    search: url.searchParams.get('q') ?? '',
    sort,
    dir,
  }
}

type NotesListRequestParsed = {
  readonly cursor: string | null
  readonly limit: number
  readonly statuses: readonly ReturnType<typeof noteStatusSchema.parse>[]
  readonly assignedReviewerId: ReturnType<typeof parseUserId> | null
  readonly patientId: ReturnType<typeof parsePatientId> | null
  readonly dateFrom: ReturnType<typeof parseIsoDateTime> | null
  readonly dateTo: ReturnType<typeof parseIsoDateTime> | null
  readonly search: string
  readonly sort: NoteListSortField
  readonly dir: NoteListSortDirection
}

function errorResponse(error: MockApiError) {
  return HttpResponse.json(mockErrorHttpBody(error), { status: error.status })
}

function createInvalid(message: string): MockApiError {
  return createMockApiError({
    code: 'INVALID_REQUEST',
    status: 400,
    message,
  })
}

function createInternal(message: string): MockApiError {
  return createMockApiError({
    code: 'SIMULATED_INTERNAL_ERROR',
    status: 500,
    message,
  })
}
