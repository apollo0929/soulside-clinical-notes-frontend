import { z } from 'zod'

import { clientMutationIdSchema, versionIdSchema } from '@/domain/ids'
import { revisionNumberSchema } from '@/domain/schemas/primitives'
import { soapContentDtoSchema } from '@/domain/schemas/soap'

export const createVersionRequestDtoSchema = z.strictObject({
  baseVersionId: versionIdSchema,
  content: soapContentDtoSchema,
  clientMutationId: clientMutationIdSchema,
})

export const createVersionSuccessVersionDtoSchema = z.strictObject({
  id: versionIdSchema,
  revision: revisionNumberSchema,
  parentVersionId: versionIdSchema,
})

export const createVersionSuccessResponseDtoSchema = z.strictObject({
  version: createVersionSuccessVersionDtoSchema,
})

export type CreateVersionRequestDto = z.infer<typeof createVersionRequestDtoSchema>
export type CreateVersionSuccessResponseDto = z.infer<typeof createVersionSuccessResponseDtoSchema>
