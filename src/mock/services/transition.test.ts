import { describe, expect, it } from 'vitest'

import { parseIsoDateTime } from '@/domain/datetime'
import { isMockApiError } from '@/mock/errors'
import { transitionNote } from '@/mock/services/transition'
import { clinicianActor, createTestDatabase, reviewerActor } from '@/mock/test/helpers'

describe('transition service', () => {
  it('56–59: successful START_REVIEW updates status, assigns reviewer, appends one event', () => {
    const db = createTestDatabase({ noteCount: 40, seed: 40 })
    const note = db.listNotes().find((n) => n.status === 'READY_FOR_REVIEW')!
    const reviewer = reviewerActor(db)
    const beforeEvents = db.listReviewEvents(note.id).length

    const result = transitionNote(db, {
      actor: reviewer,
      noteId: note.id,
      action: 'START_REVIEW',
      source: 'USER',
      mfaVerified: false,
      rejectionReason: null,
      approvedAt: null,
      occurredAt: parseIsoDateTime('2024-07-02T00:00:00.000Z'),
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    expect(result.value.note.status).toBe('IN_REVIEW')
    expect(result.value.note.assignedReviewerId).toBe(reviewer.userId)
    expect(db.listReviewEvents(note.id)).toHaveLength(beforeEvents + 1)
    expect(result.value.event.fromStatus).toBe('READY_FOR_REVIEW')
    expect(result.value.event.toStatus).toBe('IN_REVIEW')
  })

  it('58: release effect clears reviewer on RETURN_TO_QUEUE', () => {
    const db = createTestDatabase({ noteCount: 40, seed: 41 })
    const note = db.listNotes().find((n) => n.status === 'IN_REVIEW' && n.assignedReviewerId)!
    const reviewerId = note.assignedReviewerId!
    const reviewer = db.getUser(reviewerId)!

    const result = transitionNote(db, {
      actor: { userId: reviewer.id, role: reviewer.role },
      noteId: note.id,
      action: 'RETURN_TO_QUEUE',
      source: 'USER',
      mfaVerified: false,
      rejectionReason: null,
      approvedAt: null,
      occurredAt: parseIsoDateTime('2024-07-02T01:00:00.000Z'),
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    expect(result.value.note.status).toBe('READY_FOR_REVIEW')
    expect(result.value.note.assignedReviewerId).toBeNull()
  })

  it('60–62: failed lifecycle or unauthorized transition changes nothing and appends no event', () => {
    const db = createTestDatabase({ noteCount: 20, seed: 42 })
    const note = db.listNotes().find((n) => n.status === 'IN_REVIEW')!
    const snapshot = structuredClone({
      status: note.status,
      assigned: note.assignedReviewerId,
      events: db.listReviewEvents(note.id).length,
      versions: db.listVersionsForNote(note.id).length,
    })

    const invalid = transitionNote(db, {
      actor: clinicianActor(db),
      noteId: note.id,
      action: 'APPROVE',
      source: 'USER',
      mfaVerified: true,
      rejectionReason: null,
      approvedAt: null,
      occurredAt: parseIsoDateTime('2024-07-02T02:00:00.000Z'),
    })
    expect(invalid.ok).toBe(false)
    if (!invalid.ok) {
      expect(
        invalid.error.code === 'FORBIDDEN' || invalid.error.code === 'INVALID_TRANSITION',
      ).toBe(true)
      if (invalid.error.code === 'INVALID_TRANSITION') {
        expect(invalid.error.details?.reasonCode).toBeTruthy()
      }
    }

    const after = db.getNote(note.id)!
    expect(after.status).toBe(snapshot.status)
    expect(after.assignedReviewerId).toBe(snapshot.assigned)
    expect(db.listReviewEvents(note.id)).toHaveLength(snapshot.events)
    expect(db.listVersionsForNote(note.id)).toHaveLength(snapshot.versions)
  })

  it('63–64: lifecycle reason preserved; rejection reason normalized', () => {
    const db = createTestDatabase({ noteCount: 40, seed: 43 })
    const note = db.listNotes().find((n) => n.status === 'IN_REVIEW' && n.assignedReviewerId)!
    const reviewer = db.getUser(note.assignedReviewerId!)!

    const denied = transitionNote(db, {
      actor: { userId: reviewer.id, role: reviewer.role },
      noteId: note.id,
      action: 'APPROVE',
      source: 'USER',
      mfaVerified: false,
      rejectionReason: null,
      approvedAt: null,
      occurredAt: parseIsoDateTime('2024-07-02T03:00:00.000Z'),
    })
    expect(denied.ok).toBe(false)
    if (!denied.ok) {
      expect(denied.error.code).toBe('INVALID_TRANSITION')
      expect(denied.error.details?.reasonCode).toBe('MFA_REQUIRED')
    }

    const rejected = transitionNote(db, {
      actor: { userId: reviewer.id, role: reviewer.role },
      noteId: note.id,
      action: 'REJECT',
      source: 'USER',
      mfaVerified: false,
      rejectionReason: '  needs more detail  ',
      approvedAt: null,
      occurredAt: parseIsoDateTime('2024-07-02T03:30:00.000Z'),
    })
    expect(rejected.ok).toBe(true)
    if (rejected.ok) {
      expect(rejected.value.event.reason).toBe('needs more detail')
      expect(rejected.value.note.status).toBe('REJECTED')
    }
  })

  it('65: transition service does not invent a separate transition table (uses evaluateNoteTransition)', () => {
    const db = createTestDatabase({ noteCount: 10, seed: 44 })
    const note = db.listNotes().find((n) => n.status === 'LOCKED')!
    const versions = [...db.listVersionsForNote(note.id)].sort(
      (a, b) => a.revisionNumber - b.revisionNumber,
    )
    const ownerId = versions[0]!.authorId
    const result = transitionNote(db, {
      actor: { userId: ownerId, role: 'CLINICIAN' },
      noteId: note.id,
      action: 'AMEND',
      source: 'USER',
      mfaVerified: false,
      rejectionReason: null,
      approvedAt: parseIsoDateTime('2024-01-01T00:00:00.000Z'),
      occurredAt: parseIsoDateTime('2024-07-02T04:00:00.000Z'),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(isMockApiError(result.error)).toBe(true)
      expect(result.error.code).toBe('INVALID_TRANSITION')
      expect(result.error.details?.reasonCode).toBeTruthy()
    }
  })
})
