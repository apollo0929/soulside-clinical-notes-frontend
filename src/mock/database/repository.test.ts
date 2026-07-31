import { describe, expect, it } from 'vitest'

import { parseIsoDateTime } from '@/domain/datetime'
import {
  parseNoteId,
  parsePatientId,
  parseReviewEventId,
  parseSessionId,
  parseUserId,
  parseVersionId,
} from '@/domain/ids'
import { MockDatabase } from '@/mock/database/repository'
import { createMockApiError, isMockApiError } from '@/mock/errors'
import { createTestDatabase } from '@/mock/test/helpers'

describe('mock database repository', () => {
  it('13–14: inserted versions and review events cannot be updated', () => {
    const db = createTestDatabase({ noteCount: 5 })
    const note = db.listNotes()[0]
    expect(note).toBeTruthy()
    if (!note) {
      return
    }
    const version = db.listVersionsForNote(note.id)[0]
    const event = db.listReviewEvents(note.id)[0]
    expect(version).toBeTruthy()

    expect(() => db.updateVersion(version!)).toThrow()
    if (event) {
      expect(() => db.updateReviewEvent(event)).toThrow()
    }
  })

  it('15: returned objects cannot mutate internal storage', () => {
    const db = createTestDatabase({ noteCount: 5 })
    const note = db.listNotes()[0]!
    const version = db.getVersion(note.currentVersionId)!
    const mutable = version.content as { subjective: string }
    expect(() => {
      mutable.subjective = 'hacked'
    }).toThrow()
    expect(db.getVersion(note.currentVersionId)?.content.subjective).not.toBe('hacked')
  })

  it('16: missing entity returns typed NOT_FOUND on update', () => {
    const db = new MockDatabase()
    try {
      db.updateNote({
        id: parseNoteId('note_missing'),
        patientId: parsePatientId('pat_x'),
        sessionId: parseSessionId('sess_x'),
        status: 'GENERATING',
        currentVersionId: parseVersionId('ver_x'),
        assignedReviewerId: null,
        createdAt: parseIsoDateTime('2024-01-01T00:00:00.000Z'),
        updatedAt: parseIsoDateTime('2024-01-01T00:00:00.000Z'),
      })
      expect.fail('expected throw')
    } catch (error) {
      expect(isMockApiError(error)).toBe(true)
      if (isMockApiError(error)) {
        expect(error.code).toBe('NOT_FOUND')
      }
    }
  })

  it('17: append version maintains note relationship', () => {
    const db = createTestDatabase({ noteCount: 3 })
    const note = db.listNotes()[0]!
    const before = db.listVersionsForNote(note.id).length
    db.appendVersion({
      id: parseVersionId(`ver_extra_${note.id}`),
      noteId: note.id,
      revisionNumber: before + 1,
      parentVersionId: note.currentVersionId,
      content: Object.freeze({
        subjective: 's',
        objective: 'o',
        assessment: 'a',
        plan: 'p',
      }),
      authorId: parseUserId('usr_extra'),
      authorRole: 'CLINICIAN',
      createdAt: parseIsoDateTime('2024-08-01T00:00:00.000Z'),
    })
    expect(db.listVersionsForNote(note.id)).toHaveLength(before + 1)
  })

  it('18: duplicate ID insertion is rejected', () => {
    const db = createTestDatabase({ noteCount: 2 })
    const note = db.listNotes()[0]!
    expect(() => db.saveNote(note)).toThrow()
    const error = (() => {
      try {
        db.saveNote(note)
      } catch (e) {
        return e
      }
      return null
    })()
    expect(isMockApiError(error)).toBe(true)
    if (isMockApiError(error)) {
      expect(error.code).toBe('INVALID_REQUEST')
    }
  })

  it('duplicate revision numbers are rejected on append', () => {
    const db = createTestDatabase({ noteCount: 3 })
    const note = db.listNotes()[0]!
    const head = db.getVersion(note.currentVersionId)!
    expect(() =>
      db.appendVersion({
        ...head,
        id: parseVersionId(`ver_dup_rev_${note.id}`),
        revisionNumber: head.revisionNumber,
        parentVersionId: head.id,
      }),
    ).toThrow()
  })

  it('failed atomic transition commit leaves state unchanged', () => {
    const db = createTestDatabase({ noteCount: 16 })
    const note = db.listNotes().find((n) => db.listReviewEvents(n.id).length > 0)!
    const collidingEventId = db.listReviewEvents(note.id)[0]!.id
    const beforeVersions = db.listVersionsForNote(note.id).length
    const beforeEvents = db.listReviewEvents(note.id).length
    const beforeStatus = note.status

    expect(() =>
      db.commitTransition({
        note: {
          ...note,
          status: 'IN_REVIEW',
        },
        event: {
          id: collidingEventId,
          noteId: note.id,
          versionId: note.currentVersionId,
          fromStatus: note.status,
          toStatus: 'IN_REVIEW',
          actorId: parseUserId('usr_actor'),
          actorRole: 'REVIEWER',
          reason: null,
          occurredAt: parseIsoDateTime('2024-08-01T00:00:00.000Z'),
        },
        newVersion: {
          id: parseVersionId(`ver_should_not_commit_${note.id}`),
          noteId: note.id,
          revisionNumber: beforeVersions + 1,
          parentVersionId: note.currentVersionId,
          content: Object.freeze({
            subjective: 's',
            objective: 'o',
            assessment: 'a',
            plan: 'p',
          }),
          authorId: parseUserId('usr_actor'),
          authorRole: 'CLINICIAN',
          createdAt: parseIsoDateTime('2024-08-01T00:00:00.000Z'),
        },
      }),
    ).toThrow()

    expect(db.getNote(note.id)?.status).toBe(beforeStatus)
    expect(db.listVersionsForNote(note.id)).toHaveLength(beforeVersions)
    expect(db.listReviewEvents(note.id)).toHaveLength(beforeEvents)
    expect(db.getVersion(parseVersionId(`ver_should_not_commit_${note.id}`))).toBeNull()
  })

  it('getNote returns null for missing', () => {
    const db = new MockDatabase()
    expect(db.getNote(parseNoteId('nope'))).toBeNull()
    expect(createMockApiError({ code: 'NOT_FOUND', status: 404, message: 'x' }).code).toBe(
      'NOT_FOUND',
    )
  })

  it('append review event is immutable snapshot', () => {
    const db = createTestDatabase({ noteCount: 8 })
    const note = db.listNotes().find((n) => n.status === 'READY_FOR_REVIEW') ?? db.listNotes()[0]!
    db.appendReviewEvent({
      id: parseReviewEventId('rev_manual_1'),
      noteId: note.id,
      versionId: note.currentVersionId,
      fromStatus: 'GENERATING',
      toStatus: 'READY_FOR_REVIEW',
      actorId: parseUserId('usr_actor'),
      actorRole: 'CLINICIAN',
      reason: null,
      occurredAt: parseIsoDateTime('2024-08-01T00:00:00.000Z'),
    })
    const events = db.listReviewEvents(note.id)
    const last = events[events.length - 1]!
    expect(() => {
      ;(last as { reason: string | null }).reason = 'mutated'
    }).toThrow()
  })
})
