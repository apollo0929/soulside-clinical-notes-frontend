import { describe, expect, it } from 'vitest'

import { parseIsoDateTime } from '@/domain/datetime'
import { parseClientMutationId, parseNoteId, parseVersionId } from '@/domain/ids'
import { createNoteVersion } from '@/mock/services/create-version'
import { createTestDatabase } from '@/mock/test/helpers'

function soap(text: string) {
  return {
    sections: {
      S: `S ${text}`,
      O: `O ${text}`,
      A: `A ${text}`,
      P: `P ${text}`,
    },
  }
}

function inReviewFixture(seed: number) {
  const db = createTestDatabase({ noteCount: 40, seed })
  const note = db.listNotes().find((n) => n.status === 'IN_REVIEW' && n.assignedReviewerId)
  if (!note || !note.assignedReviewerId) {
    throw new Error('Expected an IN_REVIEW note with assignee')
  }
  const reviewer = db.getUser(note.assignedReviewerId)
  if (!reviewer) {
    throw new Error('Missing reviewer')
  }
  return {
    db,
    note,
    actor: { userId: reviewer.id, role: reviewer.role } as const,
  }
}

describe('createNoteVersion', () => {
  it('17–30: successful create updates head, freezes content, records mutation, no review event', () => {
    const { db, note, actor } = inReviewFixture(80)
    const priorHead = db.getVersion(note.currentVersionId)!
    const priorEvents = db.listReviewEvents(note.id).length
    const priorUpdatedAt = note.updatedAt
    const maxRevision = db
      .listVersionsForNote(note.id)
      .reduce((max, v) => Math.max(max, v.revisionNumber), 0)
    const occurredAt = parseIsoDateTime('2024-09-01T12:00:00.000Z')
    const content = soap('save-1')

    const result = createNoteVersion(db, {
      actor,
      noteId: note.id,
      baseVersionId: note.currentVersionId,
      content,
      clientMutationId: parseClientMutationId('mut_success_1'),
      occurredAt,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.response.version.parentVersionId).toBe(note.currentVersionId)
    expect(result.response.version.revision).toBe(maxRevision + 1)

    const stored = db.getVersion(result.response.version.id)!
    expect(stored.noteId).toBe(note.id)
    expect(stored.parentVersionId).toBe(note.currentVersionId)
    expect(stored.authorId).toBe(actor.userId)
    expect(stored.authorRole).toBe(actor.role)
    expect(stored.createdAt).toBe(occurredAt)
    expect(stored.content.subjective).toBe('S save-1')

    content.sections.S = 'mutated-after'
    expect(db.getVersion(result.response.version.id)?.content.subjective).toBe('S save-1')

    expect(() => {
      ;(result.response.version as { revision: number }).revision = -1
    }).toThrow()
    expect(result.response.version.revision).toBe(maxRevision + 1)
    const completed = db.getCompletedMutation(parseClientMutationId('mut_success_1'))
    expect(completed?.operation).toBe('CREATE_NOTE_VERSION')
    if (completed?.operation === 'CREATE_NOTE_VERSION') {
      expect(completed.response.version.revision).toBe(maxRevision + 1)
    }

    const updated = db.getNote(note.id)!
    expect(updated.currentVersionId).toBe(result.response.version.id)
    expect(updated.updatedAt).toBe(occurredAt)
    expect(updated.updatedAt).not.toBe(priorUpdatedAt)
    expect(db.getVersion(priorHead.id)?.content.subjective).toBe(priorHead.content.subjective)
    expect(db.listReviewEvents(note.id)).toHaveLength(priorEvents)
    expect(db.getCompletedMutation(parseClientMutationId('mut_success_1'))).not.toBeNull()
  })

  it('31–37: missing note/base, mismatch, and conflict leave state unchanged', () => {
    const { db, note, actor } = inReviewFixture(81)
    const occurredAt = parseIsoDateTime('2024-09-01T13:00:00.000Z')
    const beforeVersions = db.listVersionsForNote(note.id).length
    const beforeHead = note.currentVersionId
    const beforeUpdatedAt = note.updatedAt

    const missingNote = createNoteVersion(db, {
      actor,
      noteId: parseNoteId('note_does_not_exist'),
      baseVersionId: note.currentVersionId,
      content: soap('x'),
      clientMutationId: parseClientMutationId('mut_missing_note'),
      occurredAt,
    })
    expect(missingNote.ok).toBe(false)
    if (!missingNote.ok) {
      expect(missingNote.error.code).toBe('NOT_FOUND')
    }

    const missingBase = createNoteVersion(db, {
      actor,
      noteId: note.id,
      baseVersionId: parseVersionId('ver_does_not_exist'),
      content: soap('x'),
      clientMutationId: parseClientMutationId('mut_missing_base'),
      occurredAt,
    })
    expect(missingBase.ok).toBe(false)
    if (!missingBase.ok) {
      expect(missingBase.error.code).toBe('BASE_VERSION_NOT_FOUND')
    }

    const otherNote = db.listNotes().find((n) => n.id !== note.id)!
    const mismatch = createNoteVersion(db, {
      actor,
      noteId: note.id,
      baseVersionId: otherNote.currentVersionId,
      content: soap('x'),
      clientMutationId: parseClientMutationId('mut_base_mismatch'),
      occurredAt,
    })
    expect(mismatch.ok).toBe(false)
    if (!mismatch.ok) {
      expect(mismatch.error.code).toBe('BASE_VERSION_NOTE_MISMATCH')
    }

    const first = createNoteVersion(db, {
      actor,
      noteId: note.id,
      baseVersionId: note.currentVersionId,
      content: soap('first'),
      clientMutationId: parseClientMutationId('mut_advance_head'),
      occurredAt,
    })
    expect(first.ok).toBe(true)

    const stale = createNoteVersion(db, {
      actor,
      noteId: note.id,
      baseVersionId: beforeHead,
      content: soap('stale'),
      clientMutationId: parseClientMutationId('mut_stale_base'),
      occurredAt: parseIsoDateTime('2024-09-01T13:05:00.000Z'),
    })
    expect(stale.ok).toBe(false)
    if (!stale.ok) {
      expect(stale.error.code).toBe('VERSION_CONFLICT')
      expect(stale.error.conflict).not.toBeNull()
      expect(stale.error.conflict?.current.id).toBe(db.getNote(note.id)?.currentVersionId)
      expect(stale.error.conflict?.commonAncestor.id).toBe(beforeHead)
    }

    expect(db.listVersionsForNote(note.id)).toHaveLength(beforeVersions + 1)
    expect(db.getNote(note.id)?.currentVersionId).not.toBe(beforeHead)
    expect(db.getCompletedMutation(parseClientMutationId('mut_stale_base'))).toBeNull()
    expect(db.getNote(note.id)?.updatedAt).not.toBe(beforeUpdatedAt)
  })

  it('38–43: conflict payload fields and branched ancestor', () => {
    const { db, note, actor } = inReviewFixture(82)
    const root = note.currentVersionId
    const branchA = createNoteVersion(db, {
      actor,
      noteId: note.id,
      baseVersionId: root,
      content: soap('branch-a'),
      clientMutationId: parseClientMutationId('mut_branch_a'),
      occurredAt: parseIsoDateTime('2024-09-02T00:00:00.000Z'),
    })
    expect(branchA.ok).toBe(true)
    if (!branchA.ok) {
      return
    }

    // Simulate concurrent stale save from root while head is branchA
    const conflict = createNoteVersion(db, {
      actor,
      noteId: note.id,
      baseVersionId: root,
      content: soap('branch-b'),
      clientMutationId: parseClientMutationId('mut_branch_b'),
      occurredAt: parseIsoDateTime('2024-09-02T00:01:00.000Z'),
    })
    expect(conflict.ok).toBe(false)
    if (!conflict.ok) {
      expect(conflict.error.code).toBe('VERSION_CONFLICT')
      const payload = conflict.error.conflict!
      expect(payload.current.id).toBe(branchA.response.version.id)
      expect(payload.current.revision).toBe(branchA.response.version.revision)
      expect(payload.current.authoredBy.id).toBe(actor.userId)
      expect(payload.current.authoredBy.role).toBe(actor.role)
      expect(payload.commonAncestor.id).toBe(root)
      const ancestor = db.getVersion(root)!
      expect(payload.commonAncestor.revision).toBe(ancestor.revisionNumber)
    }
  })

  it('45–54: idempotency replay, fingerprint reuse, conflict does not reserve success', () => {
    const { db, note, actor } = inReviewFixture(83)
    const occurredAt = parseIsoDateTime('2024-09-03T00:00:00.000Z')
    const key = parseClientMutationId('mut_idem_1')
    const first = createNoteVersion(db, {
      actor,
      noteId: note.id,
      baseVersionId: note.currentVersionId,
      content: soap('idem'),
      clientMutationId: key,
      occurredAt,
    })
    expect(first.ok).toBe(true)
    if (!first.ok) {
      return
    }

    const versionCount = db.listVersionsForNote(note.id).length
    const updatedAt = db.getNote(note.id)!.updatedAt
    const replay = createNoteVersion(db, {
      actor,
      noteId: note.id,
      baseVersionId: note.currentVersionId,
      content: soap('idem'),
      clientMutationId: key,
      occurredAt: parseIsoDateTime('2024-09-03T01:00:00.000Z'),
    })
    expect(replay.ok).toBe(true)
    if (replay.ok) {
      expect(replay.response).toEqual(first.response)
    }
    expect(db.listVersionsForNote(note.id)).toHaveLength(versionCount)
    expect(db.getNote(note.id)?.updatedAt).toBe(updatedAt)

    const changedContent = createNoteVersion(db, {
      actor,
      noteId: note.id,
      baseVersionId: db.getNote(note.id)!.currentVersionId,
      content: soap('different'),
      clientMutationId: key,
      occurredAt: parseIsoDateTime('2024-09-03T02:00:00.000Z'),
    })
    expect(changedContent.ok).toBe(false)
    if (!changedContent.ok) {
      expect(changedContent.error.code).toBe('IDEMPOTENCY_KEY_REUSED')
    }

    const otherNote = db.listNotes().find((n) => n.id !== note.id && n.status === 'IN_REVIEW')!
    const otherReviewer = db.getUser(otherNote.assignedReviewerId!)!
    const changedNote = createNoteVersion(db, {
      actor: { userId: otherReviewer.id, role: otherReviewer.role },
      noteId: otherNote.id,
      baseVersionId: otherNote.currentVersionId,
      content: soap('idem'),
      clientMutationId: key,
      occurredAt: parseIsoDateTime('2024-09-03T03:00:00.000Z'),
    })
    expect(changedNote.ok).toBe(false)
    if (!changedNote.ok) {
      expect(changedNote.error.code).toBe('IDEMPOTENCY_KEY_REUSED')
    }

    // Conflict binds key without completed success; changed fingerprint later rejects
    const conflictKey = parseClientMutationId('mut_conflict_bind')
    const advance = createNoteVersion(db, {
      actor,
      noteId: note.id,
      baseVersionId: db.getNote(note.id)!.currentVersionId,
      content: soap('advance-for-conflict'),
      clientMutationId: parseClientMutationId('mut_advance_for_conflict'),
      occurredAt: parseIsoDateTime('2024-09-03T04:00:00.000Z'),
    })
    expect(advance.ok).toBe(true)
    const staleBase = note.currentVersionId
    const conflict = createNoteVersion(db, {
      actor,
      noteId: note.id,
      baseVersionId: staleBase,
      content: soap('conflict-attempt'),
      clientMutationId: conflictKey,
      occurredAt: parseIsoDateTime('2024-09-03T04:05:00.000Z'),
    })
    expect(conflict.ok).toBe(false)
    expect(db.getCompletedMutation(conflictKey)).toBeNull()

    const reuseAfterConflict = createNoteVersion(db, {
      actor,
      noteId: note.id,
      baseVersionId: db.getNote(note.id)!.currentVersionId,
      content: soap('resolved-merge'),
      clientMutationId: conflictKey,
      occurredAt: parseIsoDateTime('2024-09-03T04:10:00.000Z'),
    })
    expect(reuseAfterConflict.ok).toBe(false)
    if (!reuseAfterConflict.ok) {
      expect(reuseAfterConflict.error.code).toBe('IDEMPOTENCY_KEY_REUSED')
    }
  })

  it('55–59: atomic commit failures leave no version/head/mutation', () => {
    const { db, note, actor } = inReviewFixture(84)
    const beforeVersions = db.listVersionsForNote(note.id).length
    const beforeHead = db.getNote(note.id)!.currentVersionId
    const beforeUpdatedAt = db.getNote(note.id)!.updatedAt

    expect(() =>
      db.commitCreateVersion({
        note: {
          ...note,
          currentVersionId: parseVersionId('ver_generated_999999'),
          updatedAt: parseIsoDateTime('2024-09-04T00:00:00.000Z'),
        },
        version: {
          id: note.currentVersionId,
          noteId: note.id,
          revisionNumber: 999,
          parentVersionId: note.currentVersionId,
          content: Object.freeze({
            subjective: 's',
            objective: 'o',
            assessment: 'a',
            plan: 'p',
          }),
          authorId: actor.userId,
          authorRole: actor.role,
          createdAt: parseIsoDateTime('2024-09-04T00:00:00.000Z'),
        },
        mutation: {
          operation: 'CREATE_NOTE_VERSION',
          clientMutationId: parseClientMutationId('mut_dup_version'),
          noteId: note.id,
          fingerprint: 'fp',
          response: {
            version: {
              id: note.currentVersionId,
              revision: 999,
              parentVersionId: note.currentVersionId,
            },
          },
          completedAt: parseIsoDateTime('2024-09-04T00:00:00.000Z'),
        },
      }),
    ).toThrow()

    expect(db.listVersionsForNote(note.id)).toHaveLength(beforeVersions)
    expect(db.getNote(note.id)?.currentVersionId).toBe(beforeHead)
    expect(db.getNote(note.id)?.updatedAt).toBe(beforeUpdatedAt)
    expect(db.getCompletedMutation(parseClientMutationId('mut_dup_version'))).toBeNull()
  })

  it('60–63: deterministic version IDs and no system clock in service path', () => {
    const a = createTestDatabase({ noteCount: 16, seed: 85 })
    const b = createTestDatabase({ noteCount: 16, seed: 85 })
    const noteA = a.listNotes().find((n) => n.status === 'IN_REVIEW' && n.assignedReviewerId)!
    const noteB = b.listNotes().find((n) => n.status === 'IN_REVIEW' && n.assignedReviewerId)!
    const actorA = a.getUser(noteA.assignedReviewerId!)!
    const actorB = b.getUser(noteB.assignedReviewerId!)!
    const occurredAt = parseIsoDateTime('2024-09-05T00:00:00.000Z')

    const resultA = createNoteVersion(a, {
      actor: { userId: actorA.id, role: actorA.role },
      noteId: noteA.id,
      baseVersionId: noteA.currentVersionId,
      content: soap('det'),
      clientMutationId: parseClientMutationId('mut_det_a'),
      occurredAt,
    })
    const resultB = createNoteVersion(b, {
      actor: { userId: actorB.id, role: actorB.role },
      noteId: noteB.id,
      baseVersionId: noteB.currentVersionId,
      content: soap('det'),
      clientMutationId: parseClientMutationId('mut_det_b'),
      occurredAt,
    })
    expect(resultA.ok && resultB.ok).toBe(true)
    if (resultA.ok && resultB.ok) {
      expect(resultA.response.version.id).toBe(resultB.response.version.id)
      expect(String(resultA.response.version.id)).toMatch(/^ver_generated_000001$/)
    }

    a.reset()
    expect(a.allocateVersionId()).toBe(parseVersionId('ver_generated_000001'))
  })

  it('authorization denials for auditor and locked notes', () => {
    const db = createTestDatabase({ noteCount: 40, seed: 86 })
    const locked = db.listNotes().find((n) => n.status === 'LOCKED')!
    const owner = [...db.listVersionsForNote(locked.id)].sort(
      (a, b) => a.revisionNumber - b.revisionNumber,
    )[0]!
    const auditor = db.listUsers().find((u) => u.role === 'READONLY_AUDITOR')!

    const auditorDenied = createNoteVersion(db, {
      actor: { userId: auditor.id, role: auditor.role },
      noteId: locked.id,
      baseVersionId: locked.currentVersionId,
      content: soap('nope'),
      clientMutationId: parseClientMutationId('mut_auditor'),
      occurredAt: parseIsoDateTime('2024-09-06T00:00:00.000Z'),
    })
    expect(auditorDenied.ok).toBe(false)
    if (!auditorDenied.ok) {
      expect(auditorDenied.error.code).toBe('FORBIDDEN')
    }

    const lockedDenied = createNoteVersion(db, {
      actor: { userId: owner.authorId, role: 'CLINICIAN' },
      noteId: locked.id,
      baseVersionId: locked.currentVersionId,
      content: soap('nope'),
      clientMutationId: parseClientMutationId('mut_locked'),
      occurredAt: parseIsoDateTime('2024-09-06T00:01:00.000Z'),
    })
    expect(lockedDenied.ok).toBe(false)
    if (!lockedDenied.ok) {
      expect(
        lockedDenied.error.code === 'STATUS_NOT_EDITABLE' ||
          lockedDenied.error.code === 'FORBIDDEN',
      ).toBe(true)
    }

    const rejected = db.listNotes().find((n) => n.status === 'REJECTED')!
    const rejectedOwner = [...db.listVersionsForNote(rejected.id)].sort(
      (a, b) => a.revisionNumber - b.revisionNumber,
    )[0]!
    const allowed = createNoteVersion(db, {
      actor: { userId: rejectedOwner.authorId, role: 'CLINICIAN' },
      noteId: rejected.id,
      baseVersionId: rejected.currentVersionId,
      content: soap('resubmit-draft'),
      clientMutationId: parseClientMutationId('mut_rejected_ok'),
      occurredAt: parseIsoDateTime('2024-09-06T00:02:00.000Z'),
    })
    expect(allowed.ok).toBe(true)
  })
})
