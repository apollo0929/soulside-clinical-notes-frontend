import { type IsoDateTime, parseIsoDateTime } from '@/domain/datetime'
import {
  type NoteId,
  parseNoteId,
  parsePatientId,
  parseReviewEventId,
  parseSessionId,
  parseUserId,
  parseVersionId,
  type PatientId,
  type ReviewEventId,
  type SessionId,
  type UserId,
  type VersionId,
} from '@/domain/ids'
import type { Note } from '@/domain/models/note'
import type { NoteSummary, NoteSummaryReviewer } from '@/domain/models/note-summary'
import type { NoteVersion } from '@/domain/models/note-version'
import type { Patient } from '@/domain/models/patient'
import type { ReviewEvent } from '@/domain/models/review-event'
import type { SoapContent } from '@/domain/models/soap'
import type { User } from '@/domain/models/user'
import type { UserRole } from '@/domain/roles'
import type { NoteStatus } from '@/domain/statuses'

const FIXTURE_CREATED_AT = parseIsoDateTime('2025-11-04T14:22:10Z')
const FIXTURE_UPDATED_AT = parseIsoDateTime('2025-11-04T14:41:02Z')

function cloneReviewer(
  reviewer: NoteSummaryReviewer | null | undefined,
): NoteSummaryReviewer | null {
  if (reviewer === undefined || reviewer === null) {
    return null
  }

  return {
    id: reviewer.id,
    displayName: reviewer.displayName,
  }
}

export function buildSoapContent(
  overrides: {
    subjective?: string
    objective?: string
    assessment?: string
    plan?: string
  } = {},
): SoapContent {
  return Object.freeze({
    subjective: overrides.subjective ?? 'Patient reports improved sleep.',
    objective: overrides.objective ?? 'Affect congruent; speech clear.',
    assessment: overrides.assessment ?? 'Adjustment disorder, improving.',
    plan: overrides.plan ?? 'Continue weekly therapy; follow up in 2 weeks.',
  })
}

export function buildUser(
  overrides: {
    id?: UserId
    displayName?: string
    role?: UserRole
  } = {},
): User {
  return {
    id: overrides.id ?? parseUserId('usr_fixture_1'),
    displayName: overrides.displayName ?? 'Dr. Chen',
    role: overrides.role ?? 'REVIEWER',
  }
}

export function buildPatient(
  overrides: {
    id?: PatientId
    displayName?: string
  } = {},
): Patient {
  return {
    id: overrides.id ?? parsePatientId('pat_fixture_1'),
    displayName: overrides.displayName ?? 'Riley A.',
  }
}

export function buildNote(
  overrides: {
    id?: NoteId
    patientId?: PatientId
    sessionId?: SessionId
    status?: NoteStatus
    currentVersionId?: VersionId
    assignedReviewerId?: UserId | null
    createdAt?: IsoDateTime
    updatedAt?: IsoDateTime
  } = {},
): Note {
  return {
    id: overrides.id ?? parseNoteId('note_fixture_1'),
    patientId: overrides.patientId ?? parsePatientId('pat_fixture_1'),
    sessionId: overrides.sessionId ?? parseSessionId('sess_fixture_1'),
    status: overrides.status ?? 'READY_FOR_REVIEW',
    currentVersionId: overrides.currentVersionId ?? parseVersionId('ver_fixture_1'),
    assignedReviewerId:
      overrides.assignedReviewerId === undefined ? null : overrides.assignedReviewerId,
    createdAt: overrides.createdAt ?? FIXTURE_CREATED_AT,
    updatedAt: overrides.updatedAt ?? FIXTURE_UPDATED_AT,
  }
}

export function buildNoteSummary(
  overrides: {
    id?: NoteId
    patientId?: PatientId
    patientDisplayName?: string
    status?: NoteStatus
    currentVersionId?: VersionId
    currentRevision?: number
    assignedReviewer?: NoteSummaryReviewer | null
    createdAt?: IsoDateTime
    updatedAt?: IsoDateTime
  } = {},
): NoteSummary {
  return {
    id: overrides.id ?? parseNoteId('note_fixture_1'),
    patientId: overrides.patientId ?? parsePatientId('pat_fixture_1'),
    patientDisplayName: overrides.patientDisplayName ?? 'Riley A.',
    status: overrides.status ?? 'READY_FOR_REVIEW',
    currentVersionId: overrides.currentVersionId ?? parseVersionId('ver_fixture_1'),
    currentRevision: overrides.currentRevision ?? 3,
    assignedReviewer: cloneReviewer(overrides.assignedReviewer),
    createdAt: overrides.createdAt ?? FIXTURE_CREATED_AT,
    updatedAt: overrides.updatedAt ?? FIXTURE_UPDATED_AT,
  }
}

export function buildNoteVersion(
  overrides: {
    id?: VersionId
    noteId?: NoteId
    revisionNumber?: number
    parentVersionId?: VersionId | null
    content?: SoapContent
    authorId?: UserId
    authorRole?: UserRole
    createdAt?: IsoDateTime
  } = {},
): NoteVersion {
  return {
    id: overrides.id ?? parseVersionId('ver_fixture_1'),
    noteId: overrides.noteId ?? parseNoteId('note_fixture_1'),
    revisionNumber: overrides.revisionNumber ?? 1,
    parentVersionId: overrides.parentVersionId === undefined ? null : overrides.parentVersionId,
    content: buildSoapContent(overrides.content),
    authorId: overrides.authorId ?? parseUserId('usr_fixture_clinician'),
    authorRole: overrides.authorRole ?? 'CLINICIAN',
    createdAt: overrides.createdAt ?? FIXTURE_UPDATED_AT,
  }
}

export function buildReviewEvent(
  overrides: {
    id?: ReviewEventId
    noteId?: NoteId
    versionId?: VersionId
    fromStatus?: NoteStatus
    toStatus?: NoteStatus
    actorId?: UserId
    actorRole?: UserRole
    reason?: string | null
    occurredAt?: IsoDateTime
  } = {},
): ReviewEvent {
  return {
    id: overrides.id ?? parseReviewEventId('evt_fixture_1'),
    noteId: overrides.noteId ?? parseNoteId('note_fixture_1'),
    versionId: overrides.versionId ?? parseVersionId('ver_fixture_1'),
    fromStatus: overrides.fromStatus ?? 'READY_FOR_REVIEW',
    toStatus: overrides.toStatus ?? 'IN_REVIEW',
    actorId: overrides.actorId ?? parseUserId('usr_fixture_1'),
    actorRole: overrides.actorRole ?? 'REVIEWER',
    reason: overrides.reason === undefined ? null : overrides.reason,
    occurredAt: overrides.occurredAt ?? parseIsoDateTime('2025-11-04T14:42:02Z'),
  }
}
