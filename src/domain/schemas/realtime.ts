import { z } from 'zod'

import { isoDateTimeSchema } from '@/domain/datetime'
import {
  clientMutationIdSchema,
  noteIdSchema,
  realtimeEventIdSchema,
  sessionIdSchema,
  userIdSchema,
  versionIdSchema,
} from '@/domain/ids'
import {
  assignedReviewerDtoSchema,
  realtimeActorDtoSchema,
  userSummaryDtoSchema,
} from '@/domain/schemas/common'
import {
  displayNameSchema,
  noteStatusSchema,
  revisionNumberSchema,
  userRoleSchema,
} from '@/domain/schemas/primitives'

/** Monotonic server sequence for ordering (not a branded id). */
export const realtimeSequenceSchema = z.number().int().positive()

export const presenceActivitySchema = z.enum(['VIEWING', 'EDITING'])

export const noteSummaryRealtimeDtoSchema = z.strictObject({
  id: noteIdSchema,
  status: noteStatusSchema,
  currentVersionId: versionIdSchema,
  currentRevision: revisionNumberSchema,
  assignedReviewer: assignedReviewerDtoSchema,
  updatedAt: isoDateTimeSchema,
})

const realtimeEventBaseSchema = z.strictObject({
  eventId: realtimeEventIdSchema,
  sequence: realtimeSequenceSchema,
  occurredAt: isoDateTimeSchema,
})

export const noteCreatedEventDtoSchema = realtimeEventBaseSchema.extend({
  eventType: z.literal('NOTE_CREATED'),
  noteId: noteIdSchema,
  summary: noteSummaryRealtimeDtoSchema,
  actor: realtimeActorDtoSchema,
})

export const noteUpdatedEventDtoSchema = realtimeEventBaseSchema.extend({
  eventType: z.literal('NOTE_UPDATED'),
  noteId: noteIdSchema,
  summary: noteSummaryRealtimeDtoSchema,
  actor: realtimeActorDtoSchema,
})

export const noteVersionCreatedEventDtoSchema = realtimeEventBaseSchema.extend({
  eventType: z.literal('NOTE_VERSION_CREATED'),
  noteId: noteIdSchema,
  versionId: versionIdSchema,
  revision: revisionNumberSchema,
  parentVersionId: versionIdSchema,
  updatedAt: isoDateTimeSchema,
  author: userSummaryDtoSchema,
  /** Correlates the emitting client's create-version mutation when known. */
  originatingClientMutationId: clientMutationIdSchema.nullable(),
  /** List-safe summary — never includes SOAP clinical content. */
  summary: noteSummaryRealtimeDtoSchema.nullable(),
})

export const noteStatusChangedEventDtoSchema = realtimeEventBaseSchema.extend({
  eventType: z.literal('NOTE_STATUS_CHANGED'),
  noteId: noteIdSchema,
  fromStatus: noteStatusSchema,
  toStatus: noteStatusSchema,
  actor: realtimeActorDtoSchema,
  summary: noteSummaryRealtimeDtoSchema.nullable(),
})

export const noteReviewerChangedEventDtoSchema = realtimeEventBaseSchema.extend({
  eventType: z.literal('NOTE_REVIEWER_CHANGED'),
  noteId: noteIdSchema,
  assignedReviewer: assignedReviewerDtoSchema,
  actor: realtimeActorDtoSchema,
  summary: noteSummaryRealtimeDtoSchema.nullable(),
})

export const noteDeletedEventDtoSchema = realtimeEventBaseSchema.extend({
  eventType: z.literal('NOTE_DELETED'),
  noteId: noteIdSchema,
  actor: realtimeActorDtoSchema,
})

export const presenceParticipantDtoSchema = z.strictObject({
  sessionId: sessionIdSchema,
  userId: userIdSchema,
  displayName: displayNameSchema,
  role: userRoleSchema,
  activity: presenceActivitySchema,
  lastSeenAt: isoDateTimeSchema,
})

export const presenceJoinedEventDtoSchema = realtimeEventBaseSchema.extend({
  eventType: z.literal('PRESENCE_JOINED'),
  noteId: noteIdSchema,
  participant: presenceParticipantDtoSchema,
})

export const presenceUpdatedEventDtoSchema = realtimeEventBaseSchema.extend({
  eventType: z.literal('PRESENCE_UPDATED'),
  noteId: noteIdSchema,
  participant: presenceParticipantDtoSchema,
})

export const presenceLeftEventDtoSchema = realtimeEventBaseSchema.extend({
  eventType: z.literal('PRESENCE_LEFT'),
  noteId: noteIdSchema,
  sessionId: sessionIdSchema,
  userId: userIdSchema,
})

export const presenceSnapshotEventDtoSchema = realtimeEventBaseSchema.extend({
  eventType: z.literal('PRESENCE_SNAPSHOT'),
  noteId: noteIdSchema,
  participants: z.array(presenceParticipantDtoSchema),
})

export const resyncRequiredEventDtoSchema = realtimeEventBaseSchema.extend({
  eventType: z.literal('RESYNC_REQUIRED'),
  noteId: noteIdSchema.nullable(),
  reason: z.string().min(1),
})

export const realtimeEventDtoSchema = z.discriminatedUnion('eventType', [
  noteCreatedEventDtoSchema,
  noteUpdatedEventDtoSchema,
  noteVersionCreatedEventDtoSchema,
  noteStatusChangedEventDtoSchema,
  noteReviewerChangedEventDtoSchema,
  noteDeletedEventDtoSchema,
  presenceJoinedEventDtoSchema,
  presenceUpdatedEventDtoSchema,
  presenceLeftEventDtoSchema,
  presenceSnapshotEventDtoSchema,
  resyncRequiredEventDtoSchema,
])

export type NoteSummaryRealtimeDto = z.infer<typeof noteSummaryRealtimeDtoSchema>
export type PresenceActivity = z.infer<typeof presenceActivitySchema>
export type PresenceParticipantDto = z.infer<typeof presenceParticipantDtoSchema>
export type NoteCreatedEventDto = z.infer<typeof noteCreatedEventDtoSchema>
export type NoteUpdatedEventDto = z.infer<typeof noteUpdatedEventDtoSchema>
export type NoteVersionCreatedEventDto = z.infer<typeof noteVersionCreatedEventDtoSchema>
export type NoteStatusChangedEventDto = z.infer<typeof noteStatusChangedEventDtoSchema>
export type NoteReviewerChangedEventDto = z.infer<typeof noteReviewerChangedEventDtoSchema>
export type NoteDeletedEventDto = z.infer<typeof noteDeletedEventDtoSchema>
export type PresenceJoinedEventDto = z.infer<typeof presenceJoinedEventDtoSchema>
export type PresenceUpdatedEventDto = z.infer<typeof presenceUpdatedEventDtoSchema>
export type PresenceLeftEventDto = z.infer<typeof presenceLeftEventDtoSchema>
export type PresenceSnapshotEventDto = z.infer<typeof presenceSnapshotEventDtoSchema>
export type ResyncRequiredEventDto = z.infer<typeof resyncRequiredEventDtoSchema>
export type RealtimeEventDto = z.infer<typeof realtimeEventDtoSchema>

/** @deprecated Use NoteVersionCreatedEventDto — kept for migration clarity. */
export type NoteVersionAddedEventDto = NoteVersionCreatedEventDto
/** @deprecated Use PresenceSnapshotEventDto. */
export type NotePresenceEventDto = PresenceSnapshotEventDto

export const noteVersionAddedEventDtoSchema = noteVersionCreatedEventDtoSchema
export const notePresenceEventDtoSchema = presenceSnapshotEventDtoSchema
