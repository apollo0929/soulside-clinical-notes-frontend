import { z } from 'zod'

import { clientMutationIdSchema, noteIdSchema, userIdSchema } from '@/domain/ids'
import { notesListItemDtoSchema } from '@/domain/schemas/notes-list'

export const MAX_BULK_NOTE_IDS = 100

const uniqueNoteIdsSchema = z
  .array(noteIdSchema)
  .min(1, 'noteIds must not be empty')
  .max(MAX_BULK_NOTE_IDS, `noteIds cannot exceed ${MAX_BULK_NOTE_IDS}`)
  .superRefine((ids, ctx) => {
    const seen = new Set<string>()
    for (const id of ids) {
      if (seen.has(id)) {
        ctx.addIssue({
          code: 'custom',
          message: 'noteIds must be unique',
          path: ['noteIds'],
        })
        return
      }
      seen.add(id)
    }
  })

export const bulkAssignReviewerRequestDtoSchema = z.strictObject({
  noteIds: uniqueNoteIdsSchema,
  reviewerId: userIdSchema,
  clientMutationId: clientMutationIdSchema,
})

export const bulkRegenerateRequestDtoSchema = z.strictObject({
  noteIds: uniqueNoteIdsSchema,
  clientMutationId: clientMutationIdSchema,
})

export const bulkItemErrorDtoSchema = z.strictObject({
  code: z.string().min(1),
  message: z.string().min(1),
})

export const bulkAssignItemSuccessDtoSchema = z.strictObject({
  noteId: noteIdSchema,
  success: z.literal(true),
  note: notesListItemDtoSchema,
})

export const bulkAssignItemFailureDtoSchema = z.strictObject({
  noteId: noteIdSchema,
  success: z.literal(false),
  error: bulkItemErrorDtoSchema,
})

export const bulkAssignItemResultDtoSchema = z.discriminatedUnion('success', [
  bulkAssignItemSuccessDtoSchema,
  bulkAssignItemFailureDtoSchema,
])

export const bulkAssignReviewerResponseDtoSchema = z.strictObject({
  results: z.array(bulkAssignItemResultDtoSchema),
})

export const bulkRegenerateItemSuccessDtoSchema = z.strictObject({
  noteId: noteIdSchema,
  success: z.literal(true),
  note: notesListItemDtoSchema,
})

export const bulkRegenerateItemFailureDtoSchema = z.strictObject({
  noteId: noteIdSchema,
  success: z.literal(false),
  error: bulkItemErrorDtoSchema,
})

export const bulkRegenerateItemResultDtoSchema = z.discriminatedUnion('success', [
  bulkRegenerateItemSuccessDtoSchema,
  bulkRegenerateItemFailureDtoSchema,
])

export const bulkRegenerateResponseDtoSchema = z.strictObject({
  results: z.array(bulkRegenerateItemResultDtoSchema),
})

export type BulkAssignReviewerRequestDto = z.infer<typeof bulkAssignReviewerRequestDtoSchema>
export type BulkAssignReviewerResponseDto = z.infer<typeof bulkAssignReviewerResponseDtoSchema>
export type BulkAssignItemResultDto = z.infer<typeof bulkAssignItemResultDtoSchema>
export type BulkRegenerateRequestDto = z.infer<typeof bulkRegenerateRequestDtoSchema>
export type BulkRegenerateResponseDto = z.infer<typeof bulkRegenerateResponseDtoSchema>
export type BulkRegenerateItemResultDto = z.infer<typeof bulkRegenerateItemResultDtoSchema>
