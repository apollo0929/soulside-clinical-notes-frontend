import { describe, expect, it } from 'vitest'

import { isoDateTimeSchema, parseIsoDateTime } from '@/domain/datetime'
import {
  noteIdSchema,
  parseClientMutationId,
  parseNoteId,
  parsePatientId,
  parseUserId,
  parseVersionId,
} from '@/domain/ids'
import { USER_ROLES } from '@/domain/roles'
import {
  noteStatusSchema,
  soapContentDtoSchema,
  soapSectionsDtoSchema,
  userRoleSchema,
} from '@/domain/schemas'
import { NOTE_STATUSES } from '@/domain/statuses'

describe('NoteStatus schema', () => {
  it.each(NOTE_STATUSES)('parses valid status %s', (status) => {
    expect(noteStatusSchema.parse(status)).toBe(status)
  })

  it('rejects unknown status values', () => {
    expect(() => noteStatusSchema.parse('PENDING')).toThrow()
  })
})

describe('UserRole schema', () => {
  it.each(USER_ROLES)('parses valid role %s', (role) => {
    expect(userRoleSchema.parse(role)).toBe(role)
  })

  it('rejects unknown roles', () => {
    expect(() => userRoleSchema.parse('SUPERUSER')).toThrow()
  })
})

describe('branded identifiers', () => {
  it('rejects empty branded IDs', () => {
    expect(() => parseNoteId('')).toThrow()
    expect(() => parseVersionId('')).toThrow()
    expect(() => parsePatientId('')).toThrow()
    expect(() => parseUserId('')).toThrow()
    expect(() => parseClientMutationId('')).toThrow()
  })

  it('rejects whitespace-only IDs', () => {
    expect(() => parseNoteId('   ')).toThrow()
    expect(() => noteIdSchema.parse('\t\n')).toThrow()
  })

  it('parses valid identifiers', () => {
    expect(parseNoteId('note_123')).toBe('note_123')
    expect(parseVersionId('ver_5')).toBe('ver_5')
    expect(parseUserId('usr_123')).toBe('usr_123')
    expect(parseClientMutationId('mut_123')).toBe('mut_123')
  })

  it('trims surrounding whitespace on valid identifiers', () => {
    expect(parseNoteId('  note_123  ')).toBe('note_123')
  })
})

describe('IsoDateTime', () => {
  it('parses a valid UTC ISO timestamp', () => {
    expect(parseIsoDateTime('2025-11-04T14:41:02Z')).toBe('2025-11-04T14:41:02Z')
  })

  it('rejects invalid timestamps', () => {
    expect(() => isoDateTimeSchema.parse('')).toThrow()
    expect(() => isoDateTimeSchema.parse('not-a-date')).toThrow()
    expect(() => isoDateTimeSchema.parse('2025-02-30T14:41:02Z')).toThrow()
    expect(() => isoDateTimeSchema.parse('2025-11-04T14:41:02')).toThrow()
  })
})

describe('SOAP content schema', () => {
  it('requires all four sections', () => {
    expect(() =>
      soapSectionsDtoSchema.parse({
        S: 's',
        O: 'o',
        A: 'a',
      }),
    ).toThrow()
  })

  it('permits empty section text', () => {
    const parsed = soapContentDtoSchema.parse({
      sections: { S: '', O: '', A: '', P: '' },
    })

    expect(parsed.sections).toEqual({ S: '', O: '', A: '', P: '' })
  })

  it('rejects unknown SOAP section keys (strict; not stripped)', () => {
    expect(() =>
      soapSectionsDtoSchema.parse({
        S: 's',
        O: 'o',
        A: 'a',
        P: 'p',
        X: 'extra',
      }),
    ).toThrow()
  })
})
