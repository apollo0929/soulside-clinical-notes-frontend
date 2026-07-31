import { z } from 'zod'

import { isoDateTimeSchema } from '@/domain/datetime'
import { noteIdSchema, versionIdSchema } from '@/domain/ids'
import { assignedReviewerDtoSchema, patientDtoSchema } from '@/domain/schemas/common'
import {
  nonNegativeIntSchema,
  noteStatusSchema,
  revisionNumberSchema,
} from '@/domain/schemas/primitives'

export const notesListCursorDtoSchema = z
  .strictObject({
    next: z.string().nullable(),
    hasMore: z.boolean(),
  })
  .refine((cursor) => !(cursor.hasMore && cursor.next === null), {
    message: 'cursor.next must be a string when cursor.hasMore is true',
    path: ['next'],
  })

export const notesListItemCurrentVersionDtoSchema = z.strictObject({
  id: versionIdSchema,
  revision: revisionNumberSchema,
})

export const notesListItemDtoSchema = z.strictObject({
  id: noteIdSchema,
  patient: patientDtoSchema,
  status: noteStatusSchema,
  currentVersion: notesListItemCurrentVersionDtoSchema,
  assignedReviewer: assignedReviewerDtoSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})

export const notesListMetaDtoSchema = z.strictObject({
  total: nonNegativeIntSchema,
  returned: nonNegativeIntSchema,
  generatedAt: isoDateTimeSchema,
})

export const notesListResponseDtoSchema = z
  .strictObject({
    cursor: notesListCursorDtoSchema,
    items: z.array(notesListItemDtoSchema),
    meta: notesListMetaDtoSchema,
  })
  .refine((response) => response.meta.returned === response.items.length, {
    message: 'meta.returned must equal items.length',
    path: ['meta', 'returned'],
  })

export type NotesListCursorDto = z.infer<typeof notesListCursorDtoSchema>
export type NotesListItemDto = z.infer<typeof notesListItemDtoSchema>
export type NotesListResponseDto = z.infer<typeof notesListResponseDtoSchema>
