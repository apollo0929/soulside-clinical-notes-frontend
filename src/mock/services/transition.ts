import { authorize, type Permission } from '@/domain/authorization'
import type { IsoDateTime } from '@/domain/datetime'
import { parseIsoDateTime } from '@/domain/datetime'
import { type NoteId, parseReviewEventId, parseVersionId, type UserId } from '@/domain/ids'
import type { Note } from '@/domain/models/note'
import type { NoteVersion } from '@/domain/models/note-version'
import type { ReviewEvent } from '@/domain/models/review-event'
import {
  evaluateNoteTransition,
  normalizeRejectionReason,
  type NoteLifecycleAction,
  type TransitionSource,
} from '@/domain/note-lifecycle'
import type { MockDatabase } from '@/mock/database/repository'
import { createMockApiError, isMockApiError, type MockApiError } from '@/mock/errors'
import type { ActorContext } from '@/mock/services/seed-service'

const ACTION_PERMISSION: Readonly<Partial<Record<NoteLifecycleAction, Permission>>> = {
  START_REVIEW: 'REVIEW_START',
  RETURN_TO_QUEUE: 'REVIEW_RETURN',
  APPROVE: 'REVIEW_APPROVE',
  REJECT: 'REVIEW_REJECT',
  RESUBMIT: 'NOTE_RESUBMIT',
  REGENERATE: 'NOTE_REGENERATE',
  AMEND: 'NOTE_AMEND',
}

export type TransitionNoteInput = {
  readonly actor: ActorContext
  readonly noteId: NoteId
  readonly action: NoteLifecycleAction
  readonly source: TransitionSource
  readonly mfaVerified: boolean
  readonly rejectionReason: string | null
  readonly approvedAt: IsoDateTime | null
  readonly occurredAt: IsoDateTime
}

export type TransitionNoteSuccess = {
  readonly note: Note
  readonly event: ReviewEvent
  readonly newVersion: NoteVersion | null
}

export type TransitionNoteResult =
  | { readonly ok: true; readonly value: TransitionNoteSuccess }
  | { readonly ok: false; readonly error: MockApiError }

/**
 * Transport-independent note transition service.
 * Copy-validate-commit: failures leave note/events/versions unchanged.
 */
export function transitionNote(db: MockDatabase, input: TransitionNoteInput): TransitionNoteResult {
  const existing = db.getNote(input.noteId)
  if (!existing) {
    return {
      ok: false,
      error: createMockApiError({
        code: 'NOT_FOUND',
        status: 404,
        message: `Note ${input.noteId} was not found.`,
      }),
    }
  }

  const clinicianId = resolveClinicianId(db, existing)
  if (!clinicianId) {
    return {
      ok: false,
      error: createMockApiError({
        code: 'INVALID_REQUEST',
        status: 400,
        message: 'Unable to resolve owning clinician for note.',
      }),
    }
  }

  const permission = ACTION_PERMISSION[input.action]
  if (permission) {
    const auth = authorize({
      permission,
      actor: { userId: input.actor.userId, role: input.actor.role },
      resource: {
        kind: 'NOTE',
        noteId: existing.id,
        clinicianId,
        assignedReviewerId: existing.assignedReviewerId,
      },
    })
    if (!auth.allowed) {
      return {
        ok: false,
        error: createMockApiError({
          code: 'FORBIDDEN',
          status: 403,
          message: auth.reason,
          details: { reasonCode: auth.reasonCode },
        }),
      }
    }
  } else if (input.source === 'USER') {
    return {
      ok: false,
      error: createMockApiError({
        code: 'FORBIDDEN',
        status: 403,
        message: 'This lifecycle action cannot be invoked by a user actor.',
        details: { action: input.action },
      }),
    }
  }

  const approvedAt = input.approvedAt ?? findLatestApprovalTimestamp(db, existing.id) ?? null

  const decision = evaluateNoteTransition({
    status: existing.status,
    action: input.action,
    source: input.source,
    context: {
      actorId: input.actor.userId,
      actorRole: input.actor.role,
      assignedReviewerId: existing.assignedReviewerId,
      mfaVerified: input.mfaVerified,
      rejectionReason: input.rejectionReason,
      approvedAt,
      occurredAt: input.occurredAt,
    },
  })

  if (!decision.allowed) {
    return {
      ok: false,
      error: createMockApiError({
        code: 'INVALID_TRANSITION',
        status: 409,
        message: decision.reason,
        details: { reasonCode: decision.reasonCode },
      }),
    }
  }

  // Copy-validate-commit working state
  let nextAssigned = existing.assignedReviewerId
  let rejectionReasonForEvent: string | null = null
  let newVersion: NoteVersion | null = null
  let nextCurrentVersionId = existing.currentVersionId

  for (const effect of decision.effects) {
    switch (effect.type) {
      case 'ASSIGN_REVIEWER':
        nextAssigned = effect.reviewerId
        break
      case 'RELEASE_REVIEWER':
        nextAssigned = null
        break
      case 'RECORD_REJECTION_REASON':
        rejectionReasonForEvent = normalizeRejectionReason(effect.reason)
        break
      case 'REQUIRE_NEW_VERSION': {
        const created = createBranchedVersion(db, existing, input.actor, input.occurredAt)
        if (isMockApiError(created)) {
          return { ok: false, error: created }
        }
        newVersion = created
        nextCurrentVersionId = created.id
        break
      }
      default: {
        const _exhaustive: never = effect
        return _exhaustive
      }
    }
  }

  const updatedNote: Note = Object.freeze({
    ...existing,
    status: decision.toStatus,
    assignedReviewerId: nextAssigned,
    currentVersionId: nextCurrentVersionId,
    updatedAt: input.occurredAt,
  })

  const event: ReviewEvent = Object.freeze({
    id: parseReviewEventId(`rev_tx_${existing.id}_${input.occurredAt}_${input.action}`),
    noteId: existing.id,
    versionId: nextCurrentVersionId,
    fromStatus: decision.fromStatus,
    toStatus: decision.toStatus,
    actorId: input.actor.userId,
    actorRole: input.actor.role,
    reason: rejectionReasonForEvent,
    occurredAt: input.occurredAt,
  })

  // Commit atomically after all validation succeeded
  try {
    db.commitTransition({
      note: updatedNote,
      event,
      newVersion,
    })
  } catch (error) {
    if (isMockApiError(error)) {
      return { ok: false, error }
    }
    throw error
  }

  return {
    ok: true,
    value: {
      note: updatedNote,
      event,
      newVersion,
    },
  }
}

/**
 * Derives note ownership from the lowest-revision version's authorId.
 * Exported as the single authoritative definition used by authorization,
 * seed inspection, and tests — never duplicated as an array-index assumption.
 */
export function resolveNoteOwner(db: MockDatabase, note: Note): UserId | null {
  const versions = db.listVersionsForNote(note.id)
  const first = [...versions].sort((a, b) => a.revisionNumber - b.revisionNumber)[0]
  return first?.authorId ?? null
}

function resolveClinicianId(db: MockDatabase, note: Note): UserId | null {
  return resolveNoteOwner(db, note)
}

function findLatestApprovalTimestamp(db: MockDatabase, noteId: NoteId): IsoDateTime | null {
  const events = db.listReviewEvents(noteId)
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i]
    if (event && event.toStatus === 'APPROVED') {
      return event.occurredAt
    }
  }
  return null
}

function createBranchedVersion(
  db: MockDatabase,
  note: Note,
  actor: ActorContext,
  occurredAt: IsoDateTime,
): NoteVersion | MockApiError {
  const current = db.getVersion(note.currentVersionId)
  if (!current) {
    return createMockApiError({
      code: 'NOT_FOUND',
      status: 404,
      message: 'Current version missing while requiring a new version.',
    })
  }

  const versions = db.listVersionsForNote(note.id)
  const nextRevision = versions.reduce((max, v) => Math.max(max, v.revisionNumber), 0) + 1
  const id = parseVersionId(`ver_tx_${note.id}_${nextRevision}`)

  return Object.freeze({
    id,
    noteId: note.id,
    revisionNumber: nextRevision,
    parentVersionId: current.id,
    content: Object.freeze({
      subjective: current.content.subjective,
      objective: current.content.objective,
      assessment: current.content.assessment,
      plan: current.content.plan,
    }),
    authorId: actor.userId,
    authorRole: actor.role,
    createdAt: parseIsoDateTime(occurredAt),
  })
}
