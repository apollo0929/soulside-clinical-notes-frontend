import { z } from 'zod'

import { isoDateTimeSchema } from '@/domain/datetime'
import { noteIdSchema, realtimeEventIdSchema, versionIdSchema } from '@/domain/ids'
import { presenceViewerDtoSchema, realtimeActorDtoSchema } from '@/domain/schemas/common'
import { noteStatusSchema, revisionNumberSchema } from '@/domain/schemas/primitives'

export const noteStatusChangedEventDtoSchema = z.strictObject({
  type: z.literal('note.status_changed'),
  noteId: noteIdSchema,
  fromStatus: noteStatusSchema,
  toStatus: noteStatusSchema,
  actor: realtimeActorDtoSchema,
  at: isoDateTimeSchema,
  eventId: realtimeEventIdSchema,
})

export const noteVersionAddedEventDtoSchema = z.strictObject({
  type: z.literal('note.version_added'),
  noteId: noteIdSchema,
  version: z.strictObject({
    id: versionIdSchema,
    revision: revisionNumberSchema,
  }),
  eventId: realtimeEventIdSchema,
})

export const notePresenceEventDtoSchema = z.strictObject({
  type: z.literal('note.presence'),
  noteId: noteIdSchema,
  viewers: z.array(presenceViewerDtoSchema),
  eventId: realtimeEventIdSchema,
})

export const realtimeEventDtoSchema = z.discriminatedUnion('type', [
  noteStatusChangedEventDtoSchema,
  noteVersionAddedEventDtoSchema,
  notePresenceEventDtoSchema,
])

export type NoteStatusChangedEventDto = z.infer<typeof noteStatusChangedEventDtoSchema>
export type NoteVersionAddedEventDto = z.infer<typeof noteVersionAddedEventDtoSchema>
export type NotePresenceEventDto = z.infer<typeof notePresenceEventDtoSchema>
export type RealtimeEventDto = z.infer<typeof realtimeEventDtoSchema>
