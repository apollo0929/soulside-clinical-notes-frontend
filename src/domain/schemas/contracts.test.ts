import { describe, expect, it } from 'vitest'

import {
  createVersionRequestDtoSchema,
  noteDetailDtoSchema,
  versionConflictResponseDtoSchema,
} from '@/domain/schemas'
import {
  buildCreateVersionRequestDto,
  buildNoteDetailDto,
  buildVersionConflictResponseDto,
} from '@/test/fixtures'

describe('note detail response schema', () => {
  it('parses a valid note-detail response', () => {
    const parsed = noteDetailDtoSchema.parse(buildNoteDetailDto())

    expect(parsed.id).toBe('note_123')
    expect(parsed.currentVersion.revision).toBe(5)
    expect(parsed.review.events).toHaveLength(1)
  })

  it('fails when current version is missing', () => {
    const { currentVersion: _removed, ...withoutCurrent } = buildNoteDetailDto()

    expect(() => noteDetailDtoSchema.parse(withoutCurrent)).toThrow()
  })
})

describe('create-version request schema', () => {
  it('parses a valid create-version request', () => {
    const parsed = createVersionRequestDtoSchema.parse(buildCreateVersionRequestDto())

    expect(parsed.baseVersionId).toBe('ver_5')
    expect(parsed.clientMutationId).toBe('mut_123')
  })

  it('rejects empty clientMutationId', () => {
    expect(() =>
      createVersionRequestDtoSchema.parse({
        ...buildCreateVersionRequestDto(),
        clientMutationId: '',
      }),
    ).toThrow()

    expect(() =>
      createVersionRequestDtoSchema.parse({
        ...buildCreateVersionRequestDto(),
        clientMutationId: '   ',
      }),
    ).toThrow()
  })
})

describe('version conflict response schema', () => {
  it('parses a valid conflict response', () => {
    const parsed = versionConflictResponseDtoSchema.parse(buildVersionConflictResponseDto())

    expect(parsed.error).toBe('version_conflict')
    expect(parsed.current.revision).toBe(7)
    expect(parsed.commonAncestor.id).toBe('ver_4')
  })

  it('rejects a malformed conflict response', () => {
    expect(() =>
      versionConflictResponseDtoSchema.parse({
        error: 'version_conflict',
        current: {
          id: 'ver_7',
          revision: 7,
        },
      }),
    ).toThrow()

    expect(() =>
      versionConflictResponseDtoSchema.parse({
        error: 'other_error',
        current: buildVersionConflictResponseDto().current,
        commonAncestor: buildVersionConflictResponseDto().commonAncestor,
      }),
    ).toThrow()
  })
})
