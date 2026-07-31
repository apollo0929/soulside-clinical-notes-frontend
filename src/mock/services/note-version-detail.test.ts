import { beforeEach, describe, expect, it } from 'vitest'

import { parseVersionId } from '@/domain/ids'
import { noteVersionDetailDtoSchema } from '@/domain/schemas'
import { MockDatabase } from '@/mock/database/repository'
import { seedMockDatabase } from '@/mock/seed/seed'
import { getNoteVersionFromDatabase } from '@/mock/services/note-version-detail'

describe('getNoteVersionFromDatabase', () => {
  let db: MockDatabase

  beforeEach(() => {
    db = new MockDatabase()
    seedMockDatabase(db, { seed: 42, noteCount: 40 })
  })

  it('returns a contract-valid immutable version for the owning note', () => {
    const note = db.listNotes()[0]!
    const version = db.getVersion(note.currentVersionId)!
    const result = getNoteVersionFromDatabase(db, note.id, version.id)
    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    expect(noteVersionDetailDtoSchema.parse(result.version).id).toBe(version.id)
    expect(result.version.content.sections.S).toBe(version.content.subjective)
  })

  it('8: version belonging to another note is not found', () => {
    const notes = db.listNotes()
    const noteA = notes[0]!
    const noteB = notes[1]!
    const foreign = db.getVersion(noteB.currentVersionId)!
    const result = getNoteVersionFromDatabase(db, noteA.id, foreign.id)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.status).toBe(404)
      expect(result.error.details?.reasonCode).toBe('VERSION_NOTE_MISMATCH')
    }
  })

  it('9: unknown version id is not found', () => {
    const note = db.listNotes()[0]!
    const result = getNoteVersionFromDatabase(db, note.id, parseVersionId('ver_missing_xyz'))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.status).toBe(404)
    }
  })
})
