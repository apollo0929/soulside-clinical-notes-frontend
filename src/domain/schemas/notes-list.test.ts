import { describe, expect, it } from 'vitest'

import { notesListCursorDtoSchema, notesListResponseDtoSchema } from '@/domain/schemas'
import { revisionNumberSchema } from '@/domain/schemas/primitives'
import { buildNotesListResponseDto } from '@/test/fixtures'

describe('notes list response schema', () => {
  it('parses a valid notes-list response', () => {
    const parsed = notesListResponseDtoSchema.parse(buildNotesListResponseDto())

    expect(parsed.items).toHaveLength(1)
    expect(parsed.items[0]?.id).toBe('note_123')
    expect(parsed.items[0]?.patient.displayName).toBe('Riley A.')
    expect(parsed.items[0]?.currentVersion.revision).toBe(3)
    expect(parsed.meta.returned).toBe(1)
    expect(parsed.meta.total).toBe(132491)
    expect(parsed.cursor).toEqual({
      next: 'opaque-cursor-or-null',
      hasMore: true,
    })
  })

  it('rejects invalid cursor structures', () => {
    expect(() =>
      notesListCursorDtoSchema.parse({
        next: null,
        hasMore: true,
      }),
    ).toThrow()

    expect(() =>
      notesListCursorDtoSchema.parse({
        hasMore: false,
      }),
    ).toThrow()
  })

  it('allows hasMore false with next null', () => {
    expect(
      notesListCursorDtoSchema.parse({
        next: null,
        hasMore: false,
      }),
    ).toEqual({ next: null, hasMore: false })
  })

  it('rejects negative total or returned counts', () => {
    const valid = buildNotesListResponseDto()

    expect(() =>
      notesListResponseDtoSchema.parse({
        ...valid,
        meta: {
          ...valid.meta,
          total: -1,
        },
      }),
    ).toThrow()

    expect(() =>
      notesListResponseDtoSchema.parse({
        ...valid,
        meta: {
          ...valid.meta,
          returned: -1,
        },
      }),
    ).toThrow()
  })

  it('rejects meta.returned that does not equal items.length', () => {
    const valid = buildNotesListResponseDto()

    expect(() =>
      notesListResponseDtoSchema.parse({
        ...valid,
        meta: {
          ...valid.meta,
          returned: 99,
        },
      }),
    ).toThrow()
  })

  it('rejects invalid revision values', () => {
    expect(() => revisionNumberSchema.parse(-1)).toThrow()
    expect(() => revisionNumberSchema.parse(1.5)).toThrow()
  })

  it('rejects revision zero because revisions are one-based', () => {
    expect(() => revisionNumberSchema.parse(0)).toThrow()
  })
})
