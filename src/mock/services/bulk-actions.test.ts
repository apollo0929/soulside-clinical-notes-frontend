import { beforeEach, describe, expect, it } from 'vitest'

import { authorize } from '@/domain/authorization'
import { parseIsoDateTime } from '@/domain/datetime'
import { parseClientMutationId, parseNoteId, parseUserId } from '@/domain/ids'
import type { NoteStatus } from '@/domain/statuses'
import { FixedMockClock } from '@/mock/clock'
import { MockDatabase } from '@/mock/database/repository'
import { seedMockDatabase } from '@/mock/seed/seed'
import { bulkAssignReviewer, MAX_BULK_ASSIGN_SIZE } from '@/mock/services/bulk-assign-reviewer'
import { bulkRegenerateNotes, MAX_BULK_REGENERATE_SIZE } from '@/mock/services/bulk-regenerate'
import { resolveNoteOwner } from '@/mock/services/transition'
import { adminActor, auditorActor, clinicianActor, reviewerActor } from '@/mock/test/helpers'

const OCCURRED_AT = parseIsoDateTime('2024-11-15T10:00:00.000Z')

function seededDb(noteCount = 48): MockDatabase {
  const db = new MockDatabase()
  seedMockDatabase(db, { seed: 42, noteCount })
  return db
}

function noteByStatus(db: MockDatabase, status: NoteStatus) {
  const note = db.listNotes().find((n) => n.status === status)
  if (!note) {
    throw new Error(`Expected a seeded note with status ${status}`)
  }
  return note
}

function firstReviewerId(db: MockDatabase) {
  const reviewer = db.listUsers().find((user) => user.role === 'REVIEWER')
  if (!reviewer) {
    throw new Error('Expected a seeded reviewer')
  }
  return reviewer.id
}

function secondReviewerId(db: MockDatabase) {
  const reviewers = db.listUsers().filter((user) => user.role === 'REVIEWER')
  if (reviewers.length < 2) {
    throw new Error('Expected at least two seeded reviewers')
  }
  return reviewers[1]!.id
}

describe('bulkAssignReviewer', () => {
  let db: MockDatabase
  let clock: FixedMockClock

  beforeEach(() => {
    db = seededDb()
    clock = new FixedMockClock(OCCURRED_AT)
  })

  it('1: rejects empty noteIds', () => {
    const result = bulkAssignReviewer(db, {
      actor: adminActor(db),
      noteIds: [],
      reviewerId: firstReviewerId(db),
      clientMutationId: parseClientMutationId('mut_assign_empty'),
      occurredAt: clock.now(),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_REQUEST')
      expect(result.error.status).toBe(400)
      expect(result.error.message).toMatch(/empty/i)
    }
  })

  it('2: rejects duplicate noteIds', () => {
    const note = noteByStatus(db, 'READY_FOR_REVIEW')
    const result = bulkAssignReviewer(db, {
      actor: adminActor(db),
      noteIds: [note.id, note.id],
      reviewerId: firstReviewerId(db),
      clientMutationId: parseClientMutationId('mut_assign_dup'),
      occurredAt: clock.now(),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_REQUEST')
      expect(result.error.message).toMatch(/unique/i)
    }
  })

  it('3: enforces batch limit of 100', () => {
    const noteIds = Array.from({ length: MAX_BULK_ASSIGN_SIZE + 1 }, (_, index) =>
      parseNoteId(`note_bulk_limit_${index}`),
    )
    const result = bulkAssignReviewer(db, {
      actor: adminActor(db),
      noteIds,
      reviewerId: firstReviewerId(db),
      clientMutationId: parseClientMutationId('mut_assign_limit'),
      occurredAt: clock.now(),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_REQUEST')
      expect(result.error.message).toContain(String(MAX_BULK_ASSIGN_SIZE))
    }
  })

  it('4: denies non-admin actors', () => {
    const note = noteByStatus(db, 'READY_FOR_REVIEW')
    for (const actor of [reviewerActor(db), clinicianActor(db)]) {
      const result = bulkAssignReviewer(db, {
        actor,
        noteIds: [note.id],
        reviewerId: firstReviewerId(db),
        clientMutationId: parseClientMutationId(`mut_assign_denied_${actor.role}`),
        occurredAt: clock.now(),
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe('FORBIDDEN')
        expect(result.error.status).toBe(403)
      }
    }
  })

  it('5: rejects unknown reviewerId', () => {
    const note = noteByStatus(db, 'READY_FOR_REVIEW')
    const result = bulkAssignReviewer(db, {
      actor: adminActor(db),
      noteIds: [note.id],
      reviewerId: parseUserId('usr_unknown_reviewer'),
      clientMutationId: parseClientMutationId('mut_assign_unknown_reviewer'),
      occurredAt: clock.now(),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_REQUEST')
      expect(result.error.message).toMatch(/Unknown reviewerId/i)
    }
  })

  it('6: rejects non-reviewer assignee', () => {
    const note = noteByStatus(db, 'READY_FOR_REVIEW')
    const clinician = db.listUsers().find((user) => user.role === 'CLINICIAN')
    if (!clinician) {
      throw new Error('Expected a seeded clinician')
    }
    const result = bulkAssignReviewer(db, {
      actor: adminActor(db),
      noteIds: [note.id],
      reviewerId: clinician.id,
      clientMutationId: parseClientMutationId('mut_assign_non_reviewer'),
      occurredAt: clock.now(),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_REQUEST')
      expect(result.error.message).toMatch(/REVIEWER/i)
    }
  })

  it('7–9: READY_FOR_REVIEW / IN_REVIEW / AMENDED assignment succeeds', () => {
    const reviewerId = firstReviewerId(db)
    const actor = adminActor(db)
    for (const status of ['READY_FOR_REVIEW', 'IN_REVIEW', 'AMENDED'] as const) {
      const note = noteByStatus(db, status)
      const result = bulkAssignReviewer(db, {
        actor,
        noteIds: [note.id],
        reviewerId,
        clientMutationId: parseClientMutationId(`mut_assign_ok_${status}`),
        occurredAt: clock.now(),
      })
      expect(result.ok).toBe(true)
      if (!result.ok) {
        continue
      }
      expect(result.response.results).toHaveLength(1)
      const item = result.response.results[0]!
      expect(item.success).toBe(true)
      if (item.success) {
        expect(item.note.assignedReviewer?.id).toBe(reviewerId)
        expect(item.note.status).toBe(status)
      }
      expect(db.getNote(note.id)?.assignedReviewerId).toBe(reviewerId)
    }
  })

  it('10: disallowed statuses fail per item', () => {
    const disallowed = noteByStatus(db, 'APPROVED')
    const result = bulkAssignReviewer(db, {
      actor: adminActor(db),
      noteIds: [disallowed.id],
      reviewerId: firstReviewerId(db),
      clientMutationId: parseClientMutationId('mut_assign_disallowed'),
      occurredAt: clock.now(),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    const item = result.response.results[0]!
    expect(item.success).toBe(false)
    if (!item.success) {
      expect(item.error.code).toBe('STATUS_NOT_ASSIGNABLE')
    }
  })

  it('11–12: assignment does not change status; updates assignee and updatedAt', () => {
    const note = noteByStatus(db, 'READY_FOR_REVIEW')
    const priorStatus = note.status
    const priorUpdatedAt = note.updatedAt
    const priorEvents = db.listReviewEvents(note.id).length
    const reviewerId = firstReviewerId(db)
    const occurredAt = clock.now()

    const result = bulkAssignReviewer(db, {
      actor: adminActor(db),
      noteIds: [note.id],
      reviewerId,
      clientMutationId: parseClientMutationId('mut_assign_fields'),
      occurredAt,
    })
    expect(result.ok).toBe(true)

    const updated = db.getNote(note.id)!
    expect(updated.status).toBe(priorStatus)
    expect(updated.assignedReviewerId).toBe(reviewerId)
    expect(updated.updatedAt).toBe(occurredAt)
    expect(updated.updatedAt).not.toBe(priorUpdatedAt)
    expect(db.listReviewEvents(note.id)).toHaveLength(priorEvents)
  })

  it('13: one invalid note does not block another success', () => {
    const assignable = noteByStatus(db, 'READY_FOR_REVIEW')
    const blocked = noteByStatus(db, 'LOCKED')
    const reviewerId = firstReviewerId(db)

    const result = bulkAssignReviewer(db, {
      actor: adminActor(db),
      noteIds: [blocked.id, assignable.id],
      reviewerId,
      clientMutationId: parseClientMutationId('mut_assign_partial'),
      occurredAt: clock.now(),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    expect(result.response.results).toHaveLength(2)
    const blockedResult = result.response.results.find((item) => item.noteId === blocked.id)!
    const okResult = result.response.results.find((item) => item.noteId === assignable.id)!
    expect(blockedResult.success).toBe(false)
    expect(okResult.success).toBe(true)
    expect(db.getNote(assignable.id)?.assignedReviewerId).toBe(reviewerId)
    expect(db.getNote(blocked.id)?.assignedReviewerId).toBe(blocked.assignedReviewerId)
  })

  it('14: identical assignment retry is an idempotent replay', () => {
    const note = noteByStatus(db, 'IN_REVIEW')
    const reviewerId = firstReviewerId(db)
    const key = parseClientMutationId('mut_assign_replay')
    const actor = adminActor(db)

    const first = bulkAssignReviewer(db, {
      actor,
      noteIds: [note.id],
      reviewerId,
      clientMutationId: key,
      occurredAt: clock.now(),
    })
    expect(first.ok).toBe(true)
    if (!first.ok) {
      return
    }

    const afterFirst = db.getNote(note.id)!
    clock.advanceMs(60_000)

    const replay = bulkAssignReviewer(db, {
      actor,
      noteIds: [note.id],
      reviewerId,
      clientMutationId: key,
      occurredAt: clock.now(),
    })
    expect(replay.ok).toBe(true)
    if (replay.ok) {
      expect(replay.response).toEqual(first.response)
    }
    const afterReplay = db.getNote(note.id)!
    expect(afterReplay.updatedAt).toBe(afterFirst.updatedAt)
    expect(afterReplay.assignedReviewerId).toBe(afterFirst.assignedReviewerId)
    expect(afterReplay.status).toBe(afterFirst.status)

    if (replay.ok) {
      const success = replay.response.results[0]
      expect(success?.success).toBe(true)
      if (success?.success) {
        expect(() => {
          ;(success.note as { status: string }).status = 'LOCKED'
        }).toThrow()
        const again = db.getCompletedMutation(key)
        expect(again?.operation).toBe('BULK_ASSIGN_REVIEWER')
        if (again?.operation === 'BULK_ASSIGN_REVIEWER') {
          const stored = again.response.results[0]
          expect(stored?.success).toBe(true)
          if (stored?.success) {
            expect(stored.note.status).not.toBe('LOCKED')
            expect(stored.note).not.toBe(success.note)
          }
        }
      }
    }
  })

  it('15: changed fingerprint with same key is rejected', () => {
    const note = noteByStatus(db, 'READY_FOR_REVIEW')
    const key = parseClientMutationId('mut_assign_fingerprint')
    const actor = adminActor(db)

    const first = bulkAssignReviewer(db, {
      actor,
      noteIds: [note.id],
      reviewerId: firstReviewerId(db),
      clientMutationId: key,
      occurredAt: clock.now(),
    })
    expect(first.ok).toBe(true)

    const changed = bulkAssignReviewer(db, {
      actor,
      noteIds: [note.id],
      reviewerId: secondReviewerId(db),
      clientMutationId: key,
      occurredAt: clock.now(),
    })
    expect(changed.ok).toBe(false)
    if (!changed.ok) {
      expect(changed.error.code).toBe('IDEMPOTENCY_KEY_REUSED')
      expect(changed.error.status).toBe(409)
    }
  })
})

describe('bulkRegenerateNotes', () => {
  let db: MockDatabase
  let clock: FixedMockClock

  beforeEach(() => {
    db = seededDb()
    clock = new FixedMockClock(OCCURRED_AT)
  })

  it('16 & 19: FAILED regeneration succeeds and appends one ReviewEvent', () => {
    const note = noteByStatus(db, 'FAILED')
    const beforeEvents = db.listReviewEvents(note.id).length
    const result = bulkRegenerateNotes(db, {
      actor: adminActor(db),
      noteIds: [note.id],
      clientMutationId: parseClientMutationId('mut_regen_failed_ok'),
      occurredAt: clock.now(),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    const item = result.response.results[0]!
    expect(item.success).toBe(true)
    if (item.success) {
      expect(item.note.status).toBe('GENERATING')
    }
    expect(db.getNote(note.id)?.status).toBe('GENERATING')
    expect(db.listReviewEvents(note.id)).toHaveLength(beforeEvents + 1)
  })

  it('17 & 20: non-FAILED fails per item and appends no event', () => {
    const note = noteByStatus(db, 'READY_FOR_REVIEW')
    const beforeEvents = db.listReviewEvents(note.id).length
    const beforeStatus = note.status
    const result = bulkRegenerateNotes(db, {
      actor: adminActor(db),
      noteIds: [note.id],
      clientMutationId: parseClientMutationId('mut_regen_non_failed'),
      occurredAt: clock.now(),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    const item = result.response.results[0]!
    expect(item.success).toBe(false)
    expect(db.getNote(note.id)?.status).toBe(beforeStatus)
    expect(db.listReviewEvents(note.id)).toHaveLength(beforeEvents)
  })

  it('18: REVIEWER regeneration denied at request level', () => {
    const note = noteByStatus(db, 'FAILED')
    const result = bulkRegenerateNotes(db, {
      actor: reviewerActor(db),
      noteIds: [note.id],
      clientMutationId: parseClientMutationId('mut_regen_unauthorized'),
      occurredAt: clock.now(),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('FORBIDDEN')
      expect(result.error.status).toBe(403)
    }
    expect(db.getNote(note.id)?.status).toBe('FAILED')
  })

  it('usr_clinician_42_1 FAILED regeneration succeeds for owned note_42_1', () => {
    // note_42_1 (index=1) is deterministically FAILED and authored by clinicians[1%5]=usr_clinician_42_1
    const actor = { userId: parseUserId('usr_clinician_42_1'), role: 'CLINICIAN' as const }
    const noteId = parseNoteId('note_42_1')
    const note = db.getNote(noteId)
    expect(note?.status).toBe('FAILED')
    const beforeEvents = db.listReviewEvents(noteId).length

    const result = bulkRegenerateNotes(db, {
      actor,
      noteIds: [noteId],
      clientMutationId: parseClientMutationId('mut_regen_clinician_42_1_ok'),
      occurredAt: clock.now(),
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    const item = result.response.results[0]!
    expect(item.success).toBe(true)
    if (item.success) {
      expect(item.note.status).toBe('GENERATING')
    }
    expect(db.getNote(noteId)?.status).toBe('GENERATING')
    expect(db.listReviewEvents(noteId)).toHaveLength(beforeEvents + 1)
  })

  it('usr_clinician_42_0 cannot regenerate note_42_1 (non-owner)', () => {
    // note_42_1 is owned by usr_clinician_42_1, so usr_clinician_42_0 must be denied per-item
    const actor = { userId: parseUserId('usr_clinician_42_0'), role: 'CLINICIAN' as const }
    const noteId = parseNoteId('note_42_1')

    const result = bulkRegenerateNotes(db, {
      actor,
      noteIds: [noteId],
      clientMutationId: parseClientMutationId('mut_regen_clinician_42_0_unowned'),
      occurredAt: clock.now(),
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    const item = result.response.results[0]!
    expect(item.success).toBe(false)
    if (!item.success) {
      expect(item.error.code).toBe('FORBIDDEN')
      expect(item.error.message).toMatch(/clinician who owns/i)
    }
    expect(db.getNote(noteId)?.status).toBe('FAILED')
  })

  it('READONLY_AUDITOR regeneration denied at request level', () => {
    const note = noteByStatus(db, 'FAILED')
    const result = bulkRegenerateNotes(db, {
      actor: auditorActor(db),
      noteIds: [note.id],
      clientMutationId: parseClientMutationId('mut_regen_auditor_denied'),
      occurredAt: clock.now(),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('FORBIDDEN')
      expect(result.error.status).toBe(403)
    }
    expect(db.getNote(note.id)?.status).toBe('FAILED')
  })

  it('21: partial regeneration succeeds for FAILED and fails for others', () => {
    const failed = noteByStatus(db, 'FAILED')
    const approved = noteByStatus(db, 'APPROVED')
    const failedEventsBefore = db.listReviewEvents(failed.id).length
    const approvedEventsBefore = db.listReviewEvents(approved.id).length

    const result = bulkRegenerateNotes(db, {
      actor: adminActor(db),
      noteIds: [failed.id, approved.id],
      clientMutationId: parseClientMutationId('mut_regen_partial'),
      occurredAt: clock.now(),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    const failedItem = result.response.results.find((item) => item.noteId === failed.id)!
    const approvedItem = result.response.results.find((item) => item.noteId === approved.id)!
    expect(failedItem.success).toBe(true)
    expect(approvedItem.success).toBe(false)
    expect(db.getNote(failed.id)?.status).toBe('GENERATING')
    expect(db.getNote(approved.id)?.status).toBe('APPROVED')
    expect(db.listReviewEvents(failed.id)).toHaveLength(failedEventsBefore + 1)
    expect(db.listReviewEvents(approved.id)).toHaveLength(approvedEventsBefore)
  })

  it('22: identical regeneration retry is an idempotent replay', () => {
    const note = noteByStatus(db, 'FAILED')
    const key = parseClientMutationId('mut_regen_replay')
    const actor = adminActor(db)

    const first = bulkRegenerateNotes(db, {
      actor,
      noteIds: [note.id],
      clientMutationId: key,
      occurredAt: clock.now(),
    })
    expect(first.ok).toBe(true)
    if (!first.ok) {
      return
    }
    const eventCount = db.listReviewEvents(note.id).length
    const updatedAt = db.getNote(note.id)!.updatedAt
    clock.advanceMs(30_000)

    const replay = bulkRegenerateNotes(db, {
      actor,
      noteIds: [note.id],
      clientMutationId: key,
      occurredAt: clock.now(),
    })
    expect(replay.ok).toBe(true)
    if (replay.ok) {
      expect(replay.response).toEqual(first.response)
    }
    expect(db.listReviewEvents(note.id)).toHaveLength(eventCount)
    expect(db.getNote(note.id)?.updatedAt).toBe(updatedAt)
  })

  it('rejects empty noteIds and enforces regenerate batch limit', () => {
    const empty = bulkRegenerateNotes(db, {
      actor: adminActor(db),
      noteIds: [],
      clientMutationId: parseClientMutationId('mut_regen_empty'),
      occurredAt: clock.now(),
    })
    expect(empty.ok).toBe(false)
    if (!empty.ok) {
      expect(empty.error.code).toBe('INVALID_REQUEST')
    }

    const noteIds = Array.from({ length: MAX_BULK_REGENERATE_SIZE + 1 }, (_, index) =>
      parseNoteId(`note_regen_limit_${index}`),
    )
    const overLimit = bulkRegenerateNotes(db, {
      actor: adminActor(db),
      noteIds,
      clientMutationId: parseClientMutationId('mut_regen_limit'),
      occurredAt: clock.now(),
    })
    expect(overLimit.ok).toBe(false)
    if (!overLimit.ok) {
      expect(overLimit.error.code).toBe('INVALID_REQUEST')
      expect(overLimit.error.message).toContain(String(MAX_BULK_REGENERATE_SIZE))
    }
  })
})

describe('note ownership helper — resolveNoteOwner', () => {
  it('note_42_1 owner is usr_clinician_42_1 (deterministic seed)', () => {
    const db = seededDb()
    const note = db.getNote(parseNoteId('note_42_1'))
    expect(note).not.toBeNull()
    const owner = resolveNoteOwner(db, note!)
    expect(owner).toBe(parseUserId('usr_clinician_42_1'))
  })

  it('backend authorization and resolveNoteOwner agree for note_42_1 + usr_clinician_42_1', () => {
    const db = seededDb()
    const noteId = parseNoteId('note_42_1')
    const note = db.getNote(noteId)!
    const actorUserId = parseUserId('usr_clinician_42_1')
    const owner = resolveNoteOwner(db, note)

    expect(owner).toBe(actorUserId)

    const auth = authorize({
      permission: 'NOTE_REGENERATE',
      actor: { userId: actorUserId, role: 'CLINICIAN' },
      resource: {
        kind: 'NOTE',
        noteId,
        clinicianId: owner!,
        assignedReviewerId: note.assignedReviewerId,
      },
    })
    expect(auth.allowed).toBe(true)
  })

  it('authorization denies usr_clinician_42_0 for note_42_1 (ownership mismatch)', () => {
    const db = seededDb()
    const noteId = parseNoteId('note_42_1')
    const note = db.getNote(noteId)!
    const wrongActorId = parseUserId('usr_clinician_42_0')
    const owner = resolveNoteOwner(db, note)

    expect(owner).not.toBe(wrongActorId)

    const auth = authorize({
      permission: 'NOTE_REGENERATE',
      actor: { userId: wrongActorId, role: 'CLINICIAN' },
      resource: {
        kind: 'NOTE',
        noteId,
        clinicianId: owner!,
        assignedReviewerId: note.assignedReviewerId,
      },
    })
    expect(auth.allowed).toBe(false)
    if (!auth.allowed) {
      expect(auth.reasonCode).toBe('NOTE_OWNERSHIP_REQUIRED')
      expect(auth.reason).toMatch(/clinician who owns/i)
    }
  })
})

describe('bulk action idempotency isolation', () => {
  it('23: assign and regenerate keys do not collide across operations', () => {
    const db = seededDb()
    const clock = new FixedMockClock(OCCURRED_AT)
    const sharedKey = parseClientMutationId('mut_shared_bulk_key')
    const actor = adminActor(db)
    const assignable = noteByStatus(db, 'READY_FOR_REVIEW')
    const failed = noteByStatus(db, 'FAILED')

    const assigned = bulkAssignReviewer(db, {
      actor,
      noteIds: [assignable.id],
      reviewerId: firstReviewerId(db),
      clientMutationId: sharedKey,
      occurredAt: clock.now(),
    })
    expect(assigned.ok).toBe(true)

    const regenerate = bulkRegenerateNotes(db, {
      actor,
      noteIds: [failed.id],
      clientMutationId: sharedKey,
      occurredAt: clock.now(),
    })
    expect(regenerate.ok).toBe(false)
    if (!regenerate.ok) {
      expect(regenerate.error.code).toBe('IDEMPOTENCY_KEY_REUSED')
      expect(regenerate.error.message).toMatch(/different operation/i)
    }
    expect(db.getNote(failed.id)?.status).toBe('FAILED')
  })

  it('changed regenerate fingerprint with same key is rejected', () => {
    const db = seededDb()
    const clock = new FixedMockClock(OCCURRED_AT)
    const key = parseClientMutationId('mut_regen_fingerprint')
    const actor = adminActor(db)
    const failed = noteByStatus(db, 'FAILED')
    const otherFailed = db
      .listNotes()
      .find((note) => note.status === 'FAILED' && note.id !== failed.id)
    const secondId = otherFailed?.id ?? noteByStatus(db, 'APPROVED').id

    const first = bulkRegenerateNotes(db, {
      actor,
      noteIds: [failed.id],
      clientMutationId: key,
      occurredAt: clock.now(),
    })
    expect(first.ok).toBe(true)

    const changed = bulkRegenerateNotes(db, {
      actor,
      noteIds: [secondId],
      clientMutationId: key,
      occurredAt: clock.now(),
    })
    expect(changed.ok).toBe(false)
    if (!changed.ok) {
      expect(changed.error.code).toBe('IDEMPOTENCY_KEY_REUSED')
    }
  })
})
