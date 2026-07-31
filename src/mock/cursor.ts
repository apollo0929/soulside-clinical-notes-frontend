import { createMockApiError, type MockApiError } from '@/mock/errors'

export const NOTE_LIST_SORT_FIELDS = [
  'updatedAt',
  'createdAt',
  'patientDisplayName',
  'status',
] as const

export type NoteListSortField = (typeof NOTE_LIST_SORT_FIELDS)[number]
export type NoteListSortDirection = 'asc' | 'desc'

export type NotesListCursorPayload = {
  readonly v: 1
  readonly sort: NoteListSortField
  readonly dir: NoteListSortDirection
  readonly primary: string
  readonly id: string
  readonly fingerprint: string
}

function isSortField(value: unknown): value is NoteListSortField {
  return typeof value === 'string' && (NOTE_LIST_SORT_FIELDS as readonly string[]).includes(value)
}

function isSortDirection(value: unknown): value is NoteListSortDirection {
  return value === 'asc' || value === 'desc'
}

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '')
}

function fromBase64Url(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const padLength = (4 - (padded.length % 4)) % 4
  const base64 = padded + '='.repeat(padLength)
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new TextDecoder().decode(bytes)
}

export function encodeCursor(payload: NotesListCursorPayload): string {
  return toBase64Url(JSON.stringify(payload))
}

export function decodeCursor(cursor: string): NotesListCursorPayload | MockApiError {
  let json: string
  try {
    json = fromBase64Url(cursor)
  } catch {
    return createMockApiError({
      code: 'INVALID_CURSOR',
      status: 400,
      message: 'Cursor is not valid base64url.',
    })
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(json) as unknown
  } catch {
    return createMockApiError({
      code: 'INVALID_CURSOR',
      status: 400,
      message: 'Cursor payload is not valid JSON.',
    })
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return createMockApiError({
      code: 'INVALID_CURSOR',
      status: 400,
      message: 'Cursor payload must be an object.',
    })
  }

  const record = parsed as Record<string, unknown>
  if (record.v !== 1) {
    return createMockApiError({
      code: 'INVALID_CURSOR',
      status: 400,
      message: 'Unsupported cursor version.',
    })
  }

  if (!isSortField(record.sort) || !isSortDirection(record.dir)) {
    return createMockApiError({
      code: 'INVALID_CURSOR',
      status: 400,
      message: 'Cursor contains invalid sort metadata.',
    })
  }

  if (
    typeof record.primary !== 'string' ||
    typeof record.id !== 'string' ||
    typeof record.fingerprint !== 'string'
  ) {
    return createMockApiError({
      code: 'INVALID_CURSOR',
      status: 400,
      message: 'Cursor is missing required fields.',
    })
  }

  return {
    v: 1,
    sort: record.sort,
    dir: record.dir,
    primary: record.primary,
    id: record.id,
    fingerprint: record.fingerprint,
  }
}

export function assertCursorMatchesQuery(
  cursor: NotesListCursorPayload,
  expected: {
    readonly sort: NoteListSortField
    readonly dir: NoteListSortDirection
    readonly fingerprint: string
  },
): MockApiError | null {
  if (
    cursor.sort !== expected.sort ||
    cursor.dir !== expected.dir ||
    cursor.fingerprint !== expected.fingerprint
  ) {
    return createMockApiError({
      code: 'INVALID_CURSOR',
      status: 400,
      message: 'Cursor does not match the current list query.',
    })
  }
  return null
}

export function buildQueryFingerprint(parts: {
  readonly statuses: readonly string[]
  readonly assignedReviewerId: string | null
  readonly patientId: string | null
  readonly dateFrom: string | null
  readonly dateTo: string | null
  readonly search: string
  readonly sort: NoteListSortField
  readonly dir: NoteListSortDirection
}): string {
  return [
    parts.statuses.slice().sort().join(','),
    parts.assignedReviewerId ?? '',
    parts.patientId ?? '',
    parts.dateFrom ?? '',
    parts.dateTo ?? '',
    parts.search,
    parts.sort,
    parts.dir,
  ].join('|')
}
