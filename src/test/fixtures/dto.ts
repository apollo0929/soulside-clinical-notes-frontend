import { parseIsoDateTime } from '@/domain/datetime'
import {
  parseClientMutationId,
  parseNoteId,
  parsePatientId,
  parseRealtimeEventId,
  parseReviewEventId,
  parseSessionId,
  parseUserId,
  parseVersionId,
} from '@/domain/ids'
import { mapSoapContentToDto } from '@/domain/mappers/soap'
import type {
  CreateVersionRequestDto,
  NoteDetailDto,
  NotesListItemDto,
  NotesListResponseDto,
  RealtimeEventDto,
  ReviewEventDto,
  VersionConflictResponseDto,
} from '@/domain/schemas'
import {
  createVersionRequestDtoSchema,
  noteDetailDtoSchema,
  notesListItemDtoSchema,
  notesListResponseDtoSchema,
  realtimeEventDtoSchema,
  versionConflictResponseDtoSchema,
} from '@/domain/schemas'
import type { SoapContentDto } from '@/domain/schemas/soap'
import type { NoteStatus } from '@/domain/statuses'
import { buildSoapContent } from '@/test/fixtures/domain'

const CREATED_AT = parseIsoDateTime('2025-11-04T14:22:10Z')
const UPDATED_AT = parseIsoDateTime('2025-11-04T14:41:02Z')

function cloneSoapContentDto(content: SoapContentDto): SoapContentDto {
  return {
    sections: {
      S: content.sections.S,
      O: content.sections.O,
      A: content.sections.A,
      P: content.sections.P,
    },
  }
}

function clonePatientDto(patient: NotesListItemDto['patient']): NotesListItemDto['patient'] {
  return {
    id: patient.id,
    displayName: patient.displayName,
  }
}

function cloneAssignedReviewerDto(
  reviewer: NotesListItemDto['assignedReviewer'],
): NotesListItemDto['assignedReviewer'] {
  if (reviewer === null) {
    return null
  }

  return {
    id: reviewer.id,
    displayName: reviewer.displayName,
    role: reviewer.role,
  }
}

function cloneActorRef(actor: NoteDetailDto['currentVersion']['authoredBy']) {
  return {
    id: actor.id,
    role: actor.role,
  }
}

function cloneNoteVersionDetailDto(
  version: NoteDetailDto['currentVersion'],
): NoteDetailDto['currentVersion'] {
  return {
    id: version.id,
    revision: version.revision,
    parentVersionId: version.parentVersionId,
    content: cloneSoapContentDto(version.content),
    authoredBy: cloneActorRef(version.authoredBy),
    createdAt: version.createdAt,
  }
}

function cloneNoteVersionRefDto(
  version: NoteDetailDto['versions'][number],
): NoteDetailDto['versions'][number] {
  return {
    id: version.id,
    revision: version.revision,
    parentVersionId: version.parentVersionId,
    authoredBy: cloneActorRef(version.authoredBy),
    createdAt: version.createdAt,
  }
}

function cloneReviewEventDto(event: ReviewEventDto): ReviewEventDto {
  return {
    id: event.id,
    versionId: event.versionId,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    actorId: event.actorId,
    actorRole: event.actorRole,
    reason: event.reason,
    occurredAt: event.occurredAt,
  }
}

export function buildNoteListItemDto(
  overrides: {
    id?: NotesListItemDto['id']
    patient?: NotesListItemDto['patient']
    status?: NoteStatus
    currentVersion?: NotesListItemDto['currentVersion']
    assignedReviewer?: NotesListItemDto['assignedReviewer']
    createdAt?: NotesListItemDto['createdAt']
    updatedAt?: NotesListItemDto['updatedAt']
  } = {},
): NotesListItemDto {
  return notesListItemDtoSchema.parse({
    id: overrides.id ?? parseNoteId('note_123'),
    patient: clonePatientDto(
      overrides.patient ?? {
        id: parsePatientId('pat_123'),
        displayName: 'Riley A.',
      },
    ),
    status: overrides.status ?? 'READY_FOR_REVIEW',
    currentVersion: overrides.currentVersion
      ? {
          id: overrides.currentVersion.id,
          revision: overrides.currentVersion.revision,
        }
      : {
          id: parseVersionId('ver_123'),
          revision: 3,
        },
    assignedReviewer:
      overrides.assignedReviewer === undefined
        ? null
        : cloneAssignedReviewerDto(overrides.assignedReviewer),
    createdAt: overrides.createdAt ?? CREATED_AT,
    updatedAt: overrides.updatedAt ?? UPDATED_AT,
  })
}

export function buildNotesListResponseDto(
  overrides: {
    cursor?: NotesListResponseDto['cursor']
    items?: NotesListResponseDto['items']
    meta?: NotesListResponseDto['meta']
  } = {},
): NotesListResponseDto {
  const items = (overrides.items ?? [buildNoteListItemDto()]).map((item) =>
    buildNoteListItemDto(item),
  )

  return notesListResponseDtoSchema.parse({
    cursor: overrides.cursor
      ? {
          next: overrides.cursor.next,
          hasMore: overrides.cursor.hasMore,
        }
      : {
          next: 'opaque-cursor-or-null',
          hasMore: true,
        },
    items,
    meta: overrides.meta
      ? {
          total: overrides.meta.total,
          returned: overrides.meta.returned,
          generatedAt: overrides.meta.generatedAt,
        }
      : {
          total: 132491,
          returned: items.length,
          generatedAt: parseIsoDateTime('2025-11-04T14:41:03Z'),
        },
  })
}

export function buildNoteDetailDto(
  overrides: {
    id?: NoteDetailDto['id']
    patient?: NoteDetailDto['patient']
    status?: NoteStatus
    assignedReviewer?: NoteDetailDto['assignedReviewer']
    currentVersion?: NoteDetailDto['currentVersion']
    versions?: NoteDetailDto['versions']
    review?: NoteDetailDto['review']
    createdAt?: NoteDetailDto['createdAt']
    updatedAt?: NoteDetailDto['updatedAt']
  } = {},
): NoteDetailDto {
  const currentVersion = cloneNoteVersionDetailDto(
    overrides.currentVersion ?? {
      id: parseVersionId('ver_5'),
      revision: 5,
      parentVersionId: parseVersionId('ver_4'),
      content: mapSoapContentToDto(buildSoapContent()),
      authoredBy: {
        id: parseUserId('usr_456'),
        role: 'CLINICIAN',
      },
      createdAt: UPDATED_AT,
    },
  )

  const versions = (
    overrides.versions ?? [
      {
        id: currentVersion.id,
        revision: currentVersion.revision,
        parentVersionId: currentVersion.parentVersionId,
        authoredBy: {
          id: currentVersion.authoredBy.id,
          role: currentVersion.authoredBy.role,
        },
        createdAt: currentVersion.createdAt,
      },
    ]
  ).map(cloneNoteVersionRefDto)

  const reviewEvents = (
    overrides.review?.events ?? [
      {
        id: parseReviewEventId('evt_1'),
        versionId: currentVersion.id,
        fromStatus: 'READY_FOR_REVIEW' as const,
        toStatus: 'IN_REVIEW' as const,
        actorId: parseUserId('usr_123'),
        actorRole: 'REVIEWER' as const,
        reason: null,
        occurredAt: parseIsoDateTime('2025-11-04T14:42:02Z'),
      },
    ]
  ).map(cloneReviewEventDto)

  return noteDetailDtoSchema.parse({
    id: overrides.id ?? parseNoteId('note_123'),
    patient: clonePatientDto(
      overrides.patient ?? {
        id: parsePatientId('pat_123'),
        displayName: 'Riley A.',
      },
    ),
    status: overrides.status ?? 'IN_REVIEW',
    assignedReviewer:
      overrides.assignedReviewer === undefined
        ? {
            id: parseUserId('usr_123'),
            displayName: 'Dr. Chen',
            role: 'REVIEWER',
          }
        : cloneAssignedReviewerDto(overrides.assignedReviewer),
    currentVersion,
    versions,
    review: {
      events: reviewEvents,
    },
    createdAt: overrides.createdAt ?? CREATED_AT,
    updatedAt: overrides.updatedAt ?? UPDATED_AT,
  })
}

export function buildCreateVersionRequestDto(
  overrides: {
    baseVersionId?: CreateVersionRequestDto['baseVersionId']
    content?: CreateVersionRequestDto['content']
    clientMutationId?: CreateVersionRequestDto['clientMutationId']
  } = {},
): CreateVersionRequestDto {
  return createVersionRequestDtoSchema.parse({
    baseVersionId: overrides.baseVersionId ?? parseVersionId('ver_5'),
    content: cloneSoapContentDto(overrides.content ?? mapSoapContentToDto(buildSoapContent())),
    clientMutationId: overrides.clientMutationId ?? parseClientMutationId('mut_123'),
  })
}

export function buildVersionConflictResponseDto(
  overrides: {
    error?: 'version_conflict'
    current?: VersionConflictResponseDto['current']
    commonAncestor?: VersionConflictResponseDto['commonAncestor']
  } = {},
): VersionConflictResponseDto {
  return versionConflictResponseDtoSchema.parse({
    error: overrides.error ?? 'version_conflict',
    current: overrides.current
      ? {
          id: overrides.current.id,
          revision: overrides.current.revision,
          authoredBy: cloneActorRef(overrides.current.authoredBy),
        }
      : {
          id: parseVersionId('ver_7'),
          revision: 7,
          authoredBy: {
            id: parseUserId('usr_999'),
            role: 'REVIEWER',
          },
        },
    commonAncestor: overrides.commonAncestor
      ? {
          id: overrides.commonAncestor.id,
          revision: overrides.commonAncestor.revision,
        }
      : {
          id: parseVersionId('ver_4'),
          revision: 4,
        },
  })
}

export function buildStatusChangedRealtimeEventDto(
  overrides: Partial<{
    sequence: number
    occurredAt: RealtimeEventDto['occurredAt']
  }> = {},
): RealtimeEventDto {
  return realtimeEventDtoSchema.parse({
    eventType: 'NOTE_STATUS_CHANGED',
    eventId: parseRealtimeEventId('evt_rt_1'),
    sequence: overrides.sequence ?? 1,
    occurredAt: overrides.occurredAt ?? UPDATED_AT,
    noteId: parseNoteId('note_123'),
    fromStatus: 'READY_FOR_REVIEW',
    toStatus: 'IN_REVIEW',
    actor: {
      id: parseUserId('usr_123'),
      displayName: 'Dr. Chen',
    },
    summary: {
      id: parseNoteId('note_123'),
      status: 'IN_REVIEW',
      currentVersionId: parseVersionId('ver_123'),
      currentRevision: 3,
      assignedReviewer: {
        id: parseUserId('usr_123'),
        displayName: 'Dr. Chen',
        role: 'REVIEWER',
      },
      updatedAt: UPDATED_AT,
    },
  })
}

export function buildVersionAddedRealtimeEventDto(
  overrides: Partial<{
    sequence: number
    revision: number
    originatingClientMutationId: ReturnType<typeof parseClientMutationId> | null
  }> = {},
): RealtimeEventDto {
  return realtimeEventDtoSchema.parse({
    eventType: 'NOTE_VERSION_CREATED',
    eventId: parseRealtimeEventId('evt_rt_2'),
    sequence: overrides.sequence ?? 2,
    occurredAt: UPDATED_AT,
    noteId: parseNoteId('note_123'),
    versionId: parseVersionId('ver_6'),
    revision: overrides.revision ?? 6,
    parentVersionId: parseVersionId('ver_5'),
    updatedAt: UPDATED_AT,
    author: {
      id: parseUserId('usr_456'),
      displayName: 'clinician_456',
      role: 'CLINICIAN',
    },
    originatingClientMutationId:
      overrides.originatingClientMutationId === undefined
        ? null
        : overrides.originatingClientMutationId,
    summary: {
      id: parseNoteId('note_123'),
      status: 'IN_REVIEW',
      currentVersionId: parseVersionId('ver_6'),
      currentRevision: overrides.revision ?? 6,
      assignedReviewer: null,
      updatedAt: UPDATED_AT,
    },
  })
}

export function buildPresenceRealtimeEventDto(): RealtimeEventDto {
  return realtimeEventDtoSchema.parse({
    eventType: 'PRESENCE_SNAPSHOT',
    eventId: parseRealtimeEventId('evt_rt_3'),
    sequence: 3,
    occurredAt: UPDATED_AT,
    noteId: parseNoteId('note_123'),
    participants: [
      {
        sessionId: parseSessionId('ses_a'),
        userId: parseUserId('usr_a'),
        displayName: 'Alex',
        role: 'REVIEWER',
        activity: 'VIEWING',
        lastSeenAt: UPDATED_AT,
      },
    ],
  })
}

export function buildResyncRequiredRealtimeEventDto(): RealtimeEventDto {
  return realtimeEventDtoSchema.parse({
    eventType: 'RESYNC_REQUIRED',
    eventId: parseRealtimeEventId('evt_rt_resync'),
    sequence: 99,
    occurredAt: UPDATED_AT,
    noteId: null,
    reason: 'Missed-event cursor is no longer retained; full resync required.',
  })
}
