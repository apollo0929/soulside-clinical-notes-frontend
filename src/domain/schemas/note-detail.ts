import { z } from 'zod'

import { isoDateTimeSchema } from '@/domain/datetime'
import { noteIdSchema, reviewEventIdSchema, userIdSchema, versionIdSchema } from '@/domain/ids'
import {
  actorRefDtoSchema,
  assignedReviewerDtoSchema,
  patientDtoSchema,
} from '@/domain/schemas/common'
import { noteStatusSchema, revisionNumberSchema, userRoleSchema } from '@/domain/schemas/primitives'
import { soapContentDtoSchema } from '@/domain/schemas/soap'

export const noteVersionDetailDtoSchema = z.strictObject({
  id: versionIdSchema,
  revision: revisionNumberSchema,
  parentVersionId: versionIdSchema.nullable(),
  content: soapContentDtoSchema,
  authoredBy: actorRefDtoSchema,
  createdAt: isoDateTimeSchema,
})

export const noteVersionRefDtoSchema = z.strictObject({
  id: versionIdSchema,
  revision: revisionNumberSchema,
  parentVersionId: versionIdSchema.nullable(),
  authoredBy: actorRefDtoSchema,
  createdAt: isoDateTimeSchema,
})

export const reviewEventDtoSchema = z.strictObject({
  id: reviewEventIdSchema,
  versionId: versionIdSchema,
  fromStatus: noteStatusSchema,
  toStatus: noteStatusSchema,
  actorId: userIdSchema,
  actorRole: userRoleSchema,
  reason: z.string().nullable(),
  occurredAt: isoDateTimeSchema,
})

export const noteDetailReviewDtoSchema = z.strictObject({
  events: z.array(reviewEventDtoSchema),
})

export const noteDetailDtoSchema = z.strictObject({
  id: noteIdSchema,
  patient: patientDtoSchema,
  status: noteStatusSchema,
  assignedReviewer: assignedReviewerDtoSchema,
  currentVersion: noteVersionDetailDtoSchema,
  versions: z.array(noteVersionRefDtoSchema),
  review: noteDetailReviewDtoSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})

export type NoteVersionDetailDto = z.infer<typeof noteVersionDetailDtoSchema>
export type NoteVersionRefDto = z.infer<typeof noteVersionRefDtoSchema>
export type ReviewEventDto = z.infer<typeof reviewEventDtoSchema>
export type NoteDetailDto = z.infer<typeof noteDetailDtoSchema>
