import { z } from 'zod'

import { versionIdSchema } from '@/domain/ids'
import { actorRefDtoSchema } from '@/domain/schemas/common'
import { revisionNumberSchema } from '@/domain/schemas/primitives'

export const versionConflictCurrentDtoSchema = z.strictObject({
  id: versionIdSchema,
  revision: revisionNumberSchema,
  authoredBy: actorRefDtoSchema,
})

export const versionConflictAncestorDtoSchema = z.strictObject({
  id: versionIdSchema,
  revision: revisionNumberSchema,
})

export const versionConflictResponseDtoSchema = z.strictObject({
  error: z.literal('version_conflict'),
  current: versionConflictCurrentDtoSchema,
  commonAncestor: versionConflictAncestorDtoSchema,
})

export type VersionConflictResponseDto = z.infer<typeof versionConflictResponseDtoSchema>
