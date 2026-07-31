import { describe, expect, it } from 'vitest'

import { NOTE_STATUSES } from '@/domain/statuses'
import { MockDatabase } from '@/mock/database/repository'
import { validateMockDatabaseIntegrity } from '@/mock/database/validate'
import { seedMockDatabase } from '@/mock/seed/seed'

describe('deterministic seed', () => {
  it('1–2: same seed produces identical data; different seeds differ', () => {
    const a = new MockDatabase()
    const b = new MockDatabase()
    const c = new MockDatabase()
    seedMockDatabase(a, { seed: 10, noteCount: 20 })
    seedMockDatabase(b, { seed: 10, noteCount: 20 })
    seedMockDatabase(c, { seed: 11, noteCount: 20 })

    expect(a.listNotes().map((n) => n.id)).toEqual(b.listNotes().map((n) => n.id))
    expect(a.listNotes().map((n) => n.status)).toEqual(b.listNotes().map((n) => n.status))
    expect(a.listNotes().map((n) => n.updatedAt)).toEqual(b.listNotes().map((n) => n.updatedAt))
    expect(a.listPatients().map((p) => p.displayName)).toEqual(
      b.listPatients().map((p) => p.displayName),
    )
    expect(a.listNotes().map((n) => n.id)).not.toEqual(c.listNotes().map((n) => n.id))
  })

  it('3: requested note count is respected', () => {
    const db = new MockDatabase()
    seedMockDatabase(db, { seed: 1, noteCount: 17 })
    expect(db.listNotes()).toHaveLength(17)
  })

  it('4: all statuses represented when count is large enough', () => {
    const db = new MockDatabase()
    seedMockDatabase(db, { seed: 2, noteCount: 32 })
    const statuses = new Set(db.listNotes().map((n) => n.status))
    for (const status of NOTE_STATUSES) {
      expect(statuses.has(status)).toBe(true)
    }
  })

  it('5–8: unique IDs, currentVersion and parent relationships, no cycles', () => {
    const db = new MockDatabase()
    seedMockDatabase(db, { seed: 3, noteCount: 40 })
    const issues = validateMockDatabaseIntegrity(db)
    expect(issues).toEqual([])

    const noteIds = db.listNotes().map((n) => n.id)
    expect(new Set(noteIds).size).toBe(noteIds.length)

    const versionIds = db.listNotes().flatMap((n) => db.listVersionsForNote(n.id).map((v) => v.id))
    expect(new Set(versionIds).size).toBe(versionIds.length)
  })

  it('9–10: IN_REVIEW notes have REVIEWER assignees', () => {
    const db = new MockDatabase()
    seedMockDatabase(db, { seed: 4, noteCount: 40 })
    const users = new Map(db.listUsers().map((u) => [u.id, u]))
    for (const note of db.listNotes()) {
      if (note.status === 'IN_REVIEW') {
        expect(note.assignedReviewerId).not.toBeNull()
        const reviewer = users.get(note.assignedReviewerId!)
        expect(reviewer?.role).toBe('REVIEWER')
      }
    }
  })

  it('11: fixtures do not share mutable SOAP references', () => {
    const db = new MockDatabase()
    seedMockDatabase(db, { seed: 5, noteCount: 10 })
    const versions = db.listNotes().flatMap((n) => db.listVersionsForNote(n.id))
    const a = versions[0]
    const b = versions[1]
    expect(a && b).toBeTruthy()
    if (!a || !b) {
      return
    }
    expect(a.content).not.toBe(b.content)
    const again = db.getVersion(a.id)
    expect(again?.content).not.toBe(a.content)
  })

  it('12: seed reset removes old data', () => {
    const db = new MockDatabase()
    seedMockDatabase(db, { seed: 6, noteCount: 10 })
    expect(db.listNotes().length).toBe(10)
    seedMockDatabase(db, { seed: 7, noteCount: 3 })
    expect(db.listNotes().length).toBe(3)
    expect(db.listNotes().every((n) => String(n.id).includes('_7_'))).toBe(true)
  })
})
