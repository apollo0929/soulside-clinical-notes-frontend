import type { IsoDateTime } from '@/domain/datetime'
import { type NoteId, parseNoteId, type PatientId, type UserId } from '@/domain/ids'
import type { Note } from '@/domain/models/note'
import type { NotesListItemDto, NotesListResponseDto } from '@/domain/schemas'
import type { NoteStatus } from '@/domain/statuses'
import {
  assertCursorMatchesQuery,
  buildQueryFingerprint,
  decodeCursor,
  encodeCursor,
  type NoteListSortDirection,
  type NoteListSortField,
} from '@/mock/cursor'
import type { MockDatabase } from '@/mock/database/repository'
import { createMockApiError, isMockApiError, type MockApiError } from '@/mock/errors'

export type NotesListRequest = {
  readonly cursor: string | null
  readonly limit: number
  readonly statuses: readonly NoteStatus[]
  readonly assignedReviewerId: UserId | null
  readonly patientId: PatientId | null
  readonly dateFrom: IsoDateTime | null
  readonly dateTo: IsoDateTime | null
  /** Inclusive date bounds on note.updatedAt. */
  readonly search: string
  readonly sort: NoteListSortField
  readonly dir: NoteListSortDirection
}

export const DEFAULT_NOTES_LIST_LIMIT = 25
export const MAX_NOTES_LIST_LIMIT = 100
export const MIN_NOTES_LIST_LIMIT = 1

export type NotesListQueryResult =
  | { readonly ok: true; readonly response: NotesListResponseDto }
  | { readonly ok: false; readonly error: MockApiError }

/**
 * Single comparator source of truth for note list ordering.
 * Primary sort + stable note ID secondary sort.
 */
export function compareNotesForList(
  a: Note,
  b: Note,
  sort: NoteListSortField,
  dir: NoteListSortDirection,
  patientNameById: ReadonlyMap<PatientId, string>,
): number {
  const primary = comparePrimary(a, b, sort, patientNameById)
  const directed = dir === 'asc' ? primary : -primary
  if (directed !== 0) {
    return directed
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

function comparePrimary(
  a: Note,
  b: Note,
  sort: NoteListSortField,
  patientNameById: ReadonlyMap<PatientId, string>,
): number {
  switch (sort) {
    case 'updatedAt':
      return compareIso(a.updatedAt, b.updatedAt)
    case 'createdAt':
      return compareIso(a.createdAt, b.createdAt)
    case 'status':
      return a.status < b.status ? -1 : a.status > b.status ? 1 : 0
    case 'patientDisplayName': {
      const nameA = patientNameById.get(a.patientId) ?? ''
      const nameB = patientNameById.get(b.patientId) ?? ''
      return nameA < nameB ? -1 : nameA > nameB ? 1 : 0
    }
    default: {
      const _exhaustive: never = sort
      return _exhaustive
    }
  }
}

function compareIso(a: IsoDateTime, b: IsoDateTime): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export function listNotesFromDatabase(
  db: MockDatabase,
  request: NotesListRequest,
  generatedAt: IsoDateTime,
): NotesListQueryResult {
  const limitError = validateLimit(request.limit)
  if (limitError) {
    return { ok: false, error: limitError }
  }

  const search = normalizeSearch(request.search)
  const fingerprint = buildQueryFingerprint({
    statuses: request.statuses,
    assignedReviewerId: request.assignedReviewerId,
    patientId: request.patientId,
    dateFrom: request.dateFrom,
    dateTo: request.dateTo,
    search,
    sort: request.sort,
    dir: request.dir,
  })

  let afterPrimary: string | null = null
  let afterId: NoteId | null = null

  if (request.cursor !== null) {
    const decoded = decodeCursor(request.cursor)
    if (isMockApiError(decoded)) {
      return { ok: false, error: decoded }
    }
    const mismatch = assertCursorMatchesQuery(decoded, {
      sort: request.sort,
      dir: request.dir,
      fingerprint,
    })
    if (mismatch) {
      return { ok: false, error: mismatch }
    }
    try {
      afterId = parseNoteId(decoded.id)
    } catch {
      return {
        ok: false,
        error: createMockApiError({
          code: 'INVALID_CURSOR',
          status: 400,
          message: 'Cursor contains an invalid note id.',
        }),
      }
    }
    afterPrimary = decoded.primary
  }

  const names = new Map(db.listPatients().map((p) => [p.id, p.displayName] as const))

  const filtered = db
    .listNotes()
    .filter((note) => matchesFilters(note, request, search, db, names))
    .sort((a, b) => compareNotesForList(a, b, request.sort, request.dir, names))

  const startIndex = findStartIndex(filtered, request, afterPrimary, afterId, names)
  if (startIndex === -1 && request.cursor !== null) {
    return {
      ok: false,
      error: createMockApiError({
        code: 'INVALID_CURSOR',
        status: 400,
        message: 'Cursor no longer resolves within the current result set.',
      }),
    }
  }

  const page = filtered.slice(startIndex, startIndex + request.limit)
  const hasMore = startIndex + request.limit < filtered.length
  const last = page[page.length - 1]

  const next =
    hasMore && last
      ? encodeCursor({
          v: 1,
          sort: request.sort,
          dir: request.dir,
          primary: primarySortValue(last, request.sort, names),
          id: last.id,
          fingerprint,
        })
      : null

  const items = page.map((note) => toListItemDto(note, db))

  const response: NotesListResponseDto = {
    cursor: { next, hasMore },
    items,
    meta: {
      total: filtered.length,
      returned: items.length,
      generatedAt,
    },
  }

  return { ok: true, response }
}

function validateLimit(limit: number): MockApiError | null {
  if (!Number.isInteger(limit) || limit < MIN_NOTES_LIST_LIMIT) {
    return createMockApiError({
      code: 'INVALID_REQUEST',
      status: 400,
      message: `limit must be an integer >= ${MIN_NOTES_LIST_LIMIT}`,
    })
  }
  if (limit > MAX_NOTES_LIST_LIMIT) {
    return createMockApiError({
      code: 'INVALID_REQUEST',
      status: 400,
      message: `limit cannot exceed ${MAX_NOTES_LIST_LIMIT}`,
    })
  }
  return null
}

function normalizeSearch(search: string): string {
  // Use locale-independent case folding for deterministic search.
  return search.trim().toLowerCase()
}

function matchesFilters(
  note: Note,
  request: NotesListRequest,
  search: string,
  db: MockDatabase,
  patientNames: ReadonlyMap<PatientId, string>,
): boolean {
  if (request.statuses.length > 0 && !request.statuses.includes(note.status)) {
    return false
  }
  if (
    request.assignedReviewerId !== null &&
    note.assignedReviewerId !== request.assignedReviewerId
  ) {
    return false
  }
  if (request.patientId !== null && note.patientId !== request.patientId) {
    return false
  }
  // Date range on updatedAt: from inclusive, to inclusive
  if (request.dateFrom !== null && note.updatedAt < request.dateFrom) {
    return false
  }
  if (request.dateTo !== null && note.updatedAt > request.dateTo) {
    return false
  }

  if (search === '') {
    return true
  }

  const patientName = (patientNames.get(note.patientId) ?? '').toLowerCase()
  if (patientName.includes(search)) {
    return true
  }

  const head = db.getVersion(note.currentVersionId)
  if (!head) {
    return false
  }
  const haystack = [
    head.content.subjective,
    head.content.objective,
    head.content.assessment,
    head.content.plan,
  ]
    .join('\n')
    .toLowerCase()
  return haystack.includes(search)
}

function findStartIndex(
  sorted: readonly Note[],
  request: NotesListRequest,
  afterPrimary: string | null,
  afterId: NoteId | null,
  names: ReadonlyMap<PatientId, string>,
): number {
  if (afterPrimary === null || afterId === null) {
    return 0
  }

  for (let i = 0; i < sorted.length; i += 1) {
    const note = sorted[i]
    if (!note) {
      continue
    }
    if (note.id === afterId && primarySortValue(note, request.sort, names) === afterPrimary) {
      return i + 1
    }
  }
  return -1
}

function primarySortValue(
  note: Note,
  sort: NoteListSortField,
  names: ReadonlyMap<PatientId, string>,
): string {
  switch (sort) {
    case 'updatedAt':
      return note.updatedAt
    case 'createdAt':
      return note.createdAt
    case 'status':
      return note.status
    case 'patientDisplayName':
      return names.get(note.patientId) ?? ''
    default: {
      const _exhaustive: never = sort
      return _exhaustive
    }
  }
}

function toListItemDto(note: Note, db: MockDatabase): NotesListItemDto {
  const patient = db.getPatient(note.patientId)
  if (!patient) {
    throw createMockApiError({
      code: 'NOT_FOUND',
      status: 404,
      message: `Patient ${note.patientId} missing for note ${note.id}`,
    })
  }
  const version = db.getVersion(note.currentVersionId)
  if (!version) {
    throw createMockApiError({
      code: 'NOT_FOUND',
      status: 404,
      message: `Version ${note.currentVersionId} missing for note ${note.id}`,
    })
  }

  let assignedReviewer: NotesListItemDto['assignedReviewer'] = null
  if (note.assignedReviewerId) {
    const reviewer = db.getUser(note.assignedReviewerId)
    if (!reviewer) {
      throw createMockApiError({
        code: 'NOT_FOUND',
        status: 404,
        message: `Reviewer ${note.assignedReviewerId} missing`,
      })
    }
    assignedReviewer = {
      id: reviewer.id,
      displayName: reviewer.displayName,
      role: reviewer.role,
    }
  }

  return {
    id: note.id,
    patient: { id: patient.id, displayName: patient.displayName },
    status: note.status,
    currentVersion: { id: version.id, revision: version.revisionNumber },
    assignedReviewer,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  }
}
