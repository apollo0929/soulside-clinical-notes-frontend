import { z } from 'zod'

import { patientIdSchema, userIdSchema } from '@/domain/ids'
import { displayNameSchema, userRoleSchema } from '@/domain/schemas/primitives'

export const patientDtoSchema = z.strictObject({
  id: patientIdSchema,
  displayName: displayNameSchema,
})

export const userSummaryDtoSchema = z.strictObject({
  id: userIdSchema,
  displayName: displayNameSchema,
  role: userRoleSchema,
})

export const actorRefDtoSchema = z.strictObject({
  id: userIdSchema,
  role: userRoleSchema,
})

export const assignedReviewerDtoSchema = userSummaryDtoSchema.nullable()

export const presenceViewerDtoSchema = z.strictObject({
  id: userIdSchema,
  role: userRoleSchema,
})

export const realtimeActorDtoSchema = z.strictObject({
  id: userIdSchema,
  displayName: displayNameSchema,
})

export type PatientDto = z.infer<typeof patientDtoSchema>
export type UserSummaryDto = z.infer<typeof userSummaryDtoSchema>
export type ActorRefDto = z.infer<typeof actorRefDtoSchema>
