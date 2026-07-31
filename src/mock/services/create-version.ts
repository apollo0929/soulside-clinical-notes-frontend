import { authorize } from '@/domain/authorization'
import type { IsoDateTime } from '@/domain/datetime'
import type { ClientMutationId, NoteId, VersionId } from '@/domain/ids'
import { mapSoapContentDtoToDomain } from '@/domain/mappers'
import type { Note } from '@/domain/models/note'
import type { NoteVersion } from '@/domain/models/note-version'
import type { SoapContent } from '@/domain/models/soap'
import {
  createVersionLookupFromList,
  evaluateVersionSavePolicy,
  findNearestCommonAncestor,
} from '@/domain/note-version'
import type {
  CreateVersionSuccessResponseDto,
  SoapContentDto,
  VersionConflictResponseDto,
} from '@/domain/schemas'
import type { MockDatabase } from '@/mock/database/repository'
import { createMockApiError, isMockApiError, type MockApiError } from '@/mock/errors'
import { buildCreateVersionFingerprint } from '@/mock/idempotency/fingerprint'
import type { CompletedCreateVersionMutation } from '@/mock/idempotency/types'
import type { ActorContext } from '@/mock/services/seed-service'

export type CreateVersionInput = {
  readonly actor: ActorContext
  readonly noteId: NoteId
  readonly baseVersionId: VersionId
  readonly content: SoapContentDto
  readonly clientMutationId: ClientMutationId
  readonly occurredAt: IsoDateTime
}

export type CreateVersionResult =
  | { readonly ok: true; readonly response: CreateVersionSuccessResponseDto }
  | { readonly ok: false; readonly error: MockApiError }

/**
 * Transport-independent create-version application service.
 * Content saves are not lifecycle transitions and do not append ReviewEvents.
 */
export function createNoteVersion(
  db: MockDatabase,
  input: CreateVersionInput,
): CreateVersionResult {
  const soap = mapSoapContentDtoToDomain(input.content)
  const fingerprint = buildCreateVersionFingerprint({
    noteId: input.noteId,
    baseVersionId: input.baseVersionId,
    content: soap,
    actorUserId: input.actor.userId,
  })

  const existingBinding = db.getIdempotencyBinding(input.clientMutationId)
  if (existingBinding && existingBinding.fingerprint !== fingerprint) {
    return {
      ok: false,
      error: createMockApiError({
        code: 'IDEMPOTENCY_KEY_REUSED',
        status: 409,
        message: 'clientMutationId was already used with a different request fingerprint.',
        details: { clientMutationId: input.clientMutationId },
      }),
    }
  }

  const completed = db.getCompletedMutation(input.clientMutationId)
  if (completed) {
    if (completed.operation !== 'CREATE_NOTE_VERSION') {
      return {
        ok: false,
        error: createMockApiError({
          code: 'IDEMPOTENCY_KEY_REUSED',
          status: 409,
          message: 'clientMutationId was already used for a different operation.',
          details: { clientMutationId: input.clientMutationId },
        }),
      }
    }
    if (completed.fingerprint !== fingerprint) {
      return {
        ok: false,
        error: createMockApiError({
          code: 'IDEMPOTENCY_KEY_REUSED',
          status: 409,
          message: 'clientMutationId was already used with a different request fingerprint.',
          details: { clientMutationId: input.clientMutationId },
        }),
      }
    }
    if (completed.noteId !== input.noteId) {
      return {
        ok: false,
        error: createMockApiError({
          code: 'IDEMPOTENCY_KEY_REUSED',
          status: 409,
          message: 'clientMutationId was already used for a different note.',
          details: { clientMutationId: input.clientMutationId },
        }),
      }
    }
    return { ok: true, response: freezeCreateVersionResponse(completed.response.version) }
  }

  const note = db.getNote(input.noteId)
  if (!note) {
    bindKey(db, input, fingerprint)
    return {
      ok: false,
      error: createMockApiError({
        code: 'NOT_FOUND',
        status: 404,
        message: `Note ${input.noteId} was not found.`,
      }),
    }
  }

  const versions = db.listVersionsForNote(note.id)
  const clinicianId = resolveClinicianId(versions)
  if (!clinicianId) {
    bindKey(db, input, fingerprint)
    return {
      ok: false,
      error: createMockApiError({
        code: 'INVALID_REQUEST',
        status: 400,
        message: 'Unable to resolve owning clinician for note.',
      }),
    }
  }

  const auth = authorize({
    permission: 'NOTE_EDIT',
    actor: { userId: input.actor.userId, role: input.actor.role },
    resource: {
      kind: 'NOTE',
      noteId: note.id,
      clinicianId,
      assignedReviewerId: note.assignedReviewerId,
    },
  })
  if (!auth.allowed) {
    bindKey(db, input, fingerprint)
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

  const savePolicy = evaluateVersionSavePolicy({
    status: note.status,
    actorRole: input.actor.role,
    isOwner: input.actor.userId === clinicianId,
    isAssignedReviewer:
      note.assignedReviewerId !== null && input.actor.userId === note.assignedReviewerId,
  })
  if (!savePolicy.allowed) {
    bindKey(db, input, fingerprint)
    const code =
      savePolicy.reasonCode === 'STATUS_NOT_EDITABLE' ? 'STATUS_NOT_EDITABLE' : 'FORBIDDEN'
    return {
      ok: false,
      error: createMockApiError({
        code,
        status: 403,
        message: savePolicy.reason,
        details: { reasonCode: savePolicy.reasonCode },
      }),
    }
  }

  const baseVersion = db.getVersion(input.baseVersionId)
  if (!baseVersion) {
    bindKey(db, input, fingerprint)
    return {
      ok: false,
      error: createMockApiError({
        code: 'BASE_VERSION_NOT_FOUND',
        status: 404,
        message: `Base version ${input.baseVersionId} was not found.`,
      }),
    }
  }

  if (baseVersion.noteId !== note.id) {
    bindKey(db, input, fingerprint)
    return {
      ok: false,
      error: createMockApiError({
        code: 'BASE_VERSION_NOTE_MISMATCH',
        status: 400,
        message: 'baseVersionId does not belong to the target note.',
        details: {
          noteId: note.id,
          baseVersionId: input.baseVersionId,
          baseNoteId: baseVersion.noteId,
        },
      }),
    }
  }

  if (baseVersion.id !== note.currentVersionId) {
    bindKey(db, input, fingerprint)
    const conflict = buildConflictPayload(db, note, versions, input.baseVersionId)
    if (!conflict.ok) {
      return { ok: false, error: conflict.error }
    }
    return {
      ok: false,
      error: createMockApiError({
        code: 'VERSION_CONFLICT',
        status: 409,
        message: 'baseVersionId is stale; the note head has advanced.',
        conflict: conflict.payload,
      }),
    }
  }

  const nextRevision =
    versions.reduce((max, version) => Math.max(max, version.revisionNumber), 0) + 1
  const versionId = db.allocateVersionId()
  const newVersion: NoteVersion = Object.freeze({
    id: versionId,
    noteId: note.id,
    revisionNumber: nextRevision,
    parentVersionId: input.baseVersionId,
    content: freezeSoap(soap),
    authorId: input.actor.userId,
    authorRole: input.actor.role,
    createdAt: input.occurredAt,
  })

  const updatedNote: Note = Object.freeze({
    ...note,
    currentVersionId: versionId,
    updatedAt: input.occurredAt,
  })

  const response = freezeCreateVersionResponse({
    id: versionId,
    revision: nextRevision,
    parentVersionId: input.baseVersionId,
  })

  const mutation: CompletedCreateVersionMutation = Object.freeze({
    operation: 'CREATE_NOTE_VERSION',
    clientMutationId: input.clientMutationId,
    noteId: note.id,
    fingerprint,
    response,
    completedAt: input.occurredAt,
  })

  try {
    db.bindIdempotencyKey({
      clientMutationId: input.clientMutationId,
      fingerprint,
      boundAt: input.occurredAt,
    })
    db.commitCreateVersion({
      note: updatedNote,
      version: newVersion,
      mutation,
    })
  } catch (error) {
    if (isMockApiError(error)) {
      return { ok: false, error }
    }
    throw error
  }

  return { ok: true, response }
}

function bindKey(db: MockDatabase, input: CreateVersionInput, fingerprint: string): void {
  try {
    db.bindIdempotencyKey({
      clientMutationId: input.clientMutationId,
      fingerprint,
      boundAt: input.occurredAt,
    })
  } catch {
    // Binding collision is handled by the caller path that checks bindings first.
  }
}

function buildConflictPayload(
  db: MockDatabase,
  note: Note,
  versions: readonly NoteVersion[],
  staleBaseId: VersionId,
):
  | { readonly ok: true; readonly payload: VersionConflictResponseDto }
  | { readonly ok: false; readonly error: MockApiError } {
  const current = db.getVersion(note.currentVersionId)
  if (!current) {
    return {
      ok: false,
      error: createMockApiError({
        code: 'VERSION_GRAPH_INVALID',
        status: 500,
        message: 'Current note head version is missing.',
      }),
    }
  }

  const lookup = createVersionLookupFromList(versions)
  const ancestor = findNearestCommonAncestor(staleBaseId, note.currentVersionId, lookup, note.id)

  if (!ancestor.ok) {
    if ('code' in ancestor && ancestor.code === 'NO_COMMON_ANCESTOR') {
      return {
        ok: false,
        error: createMockApiError({
          code: 'VERSION_GRAPH_INVALID',
          status: 500,
          message: 'No common ancestor exists for versions on the same note.',
        }),
      }
    }
    if ('issue' in ancestor) {
      return {
        ok: false,
        error: createMockApiError({
          code: 'VERSION_GRAPH_INVALID',
          status: 500,
          message: ancestor.issue.message,
          details: { graphCode: ancestor.issue.code },
        }),
      }
    }
    return {
      ok: false,
      error: createMockApiError({
        code: 'VERSION_GRAPH_INVALID',
        status: 500,
        message: 'Version graph validation failed.',
      }),
    }
  }

  const ancestorVersion = db.getVersion(ancestor.ancestorId)
  if (!ancestorVersion) {
    return {
      ok: false,
      error: createMockApiError({
        code: 'VERSION_GRAPH_INVALID',
        status: 500,
        message: 'Common ancestor version is missing.',
      }),
    }
  }

  return {
    ok: true,
    payload: {
      error: 'version_conflict',
      current: {
        id: current.id,
        revision: current.revisionNumber,
        authoredBy: {
          id: current.authorId,
          role: current.authorRole,
        },
      },
      commonAncestor: {
        id: ancestorVersion.id,
        revision: ancestorVersion.revisionNumber,
      },
    },
  }
}

function resolveClinicianId(versions: readonly NoteVersion[]): NoteVersion['authorId'] | null {
  const first = [...versions].sort((a, b) => a.revisionNumber - b.revisionNumber)[0]
  return first?.authorId ?? null
}

function freezeSoap(content: SoapContent): SoapContent {
  return Object.freeze({
    subjective: content.subjective,
    objective: content.objective,
    assessment: content.assessment,
    plan: content.plan,
  })
}

function freezeCreateVersionResponse(
  version: CreateVersionSuccessResponseDto['version'],
): CreateVersionSuccessResponseDto {
  return Object.freeze({
    version: Object.freeze({
      id: version.id,
      revision: version.revision,
      parentVersionId: version.parentVersionId,
    }),
  })
}
