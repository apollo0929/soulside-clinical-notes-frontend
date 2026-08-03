import { describe, expect, it } from 'vitest'

import { parseNoteId, parseUserId } from '@/domain/ids'
import type { NoteStatus } from '@/domain/statuses'

import { evaluateEditorAccess, resolveClinicianOwnerId } from './editor-access'

const noteId = parseNoteId('note_access_1')
const ownerId = parseUserId('usr_clinician_owner')
const otherClinician = parseUserId('usr_clinician_other')
const reviewerId = parseUserId('usr_reviewer_assigned')
const otherReviewer = parseUserId('usr_reviewer_other')
const adminId = parseUserId('usr_admin_1')
const auditorId = parseUserId('usr_auditor_1')

function access(input: {
  role: 'CLINICIAN' | 'REVIEWER' | 'ADMIN' | 'READONLY_AUDITOR'
  userId: ReturnType<typeof parseUserId>
  status: NoteStatus
  assignedReviewerId?: ReturnType<typeof parseUserId> | null
}) {
  return evaluateEditorAccess({
    actor: { userId: input.userId, role: input.role },
    noteId,
    status: input.status,
    clinicianId: ownerId,
    assignedReviewerId:
      input.assignedReviewerId === undefined ? reviewerId : input.assignedReviewerId,
  })
}

describe('evaluateEditorAccess', () => {
  it('26–27: assigned reviewer may edit IN_REVIEW; unassigned may not', () => {
    expect(access({ role: 'REVIEWER', userId: reviewerId, status: 'IN_REVIEW' }).editable).toBe(
      true,
    )
    const denied = access({
      role: 'REVIEWER',
      userId: otherReviewer,
      status: 'IN_REVIEW',
    })
    expect(denied.editable).toBe(false)
    if (!denied.editable) {
      expect(denied.reasonCode).toMatch(/ASSIGNED_REVIEWER|ROLE/)
    }
  })

  it('28–30: owning clinician may edit REJECTED and AMENDED; others may not', () => {
    expect(access({ role: 'CLINICIAN', userId: ownerId, status: 'REJECTED' }).editable).toBe(true)
    expect(access({ role: 'CLINICIAN', userId: otherClinician, status: 'REJECTED' }).editable).toBe(
      false,
    )
    expect(access({ role: 'CLINICIAN', userId: ownerId, status: 'AMENDED' }).editable).toBe(true)
  })

  it('31–34: APPROVED, LOCKED, READY_FOR_REVIEW, and auditor are read-only', () => {
    expect(access({ role: 'ADMIN', userId: adminId, status: 'APPROVED' }).editable).toBe(false)
    expect(access({ role: 'ADMIN', userId: adminId, status: 'LOCKED' }).editable).toBe(false)
    expect(access({ role: 'ADMIN', userId: adminId, status: 'READY_FOR_REVIEW' }).editable).toBe(
      false,
    )
    expect(
      access({ role: 'READONLY_AUDITOR', userId: auditorId, status: 'IN_REVIEW' }).editable,
    ).toBe(false)
  })

  // ── Test 3: null assignedReviewerId does not crash lifecycle/editor-access ──
  it('3: evaluateEditorAccess and resolveClinicianOwnerId handle null assignedReviewerId', () => {
    // FAILED note: reviewer not assigned → assignedReviewerId is null
    const failedAccess = evaluateEditorAccess({
      actor: { userId: ownerId, role: 'CLINICIAN' },
      noteId,
      status: 'FAILED',
      clinicianId: ownerId,
      assignedReviewerId: null,
    })
    // FAILED notes are not editable (save policy blocks it)
    expect(failedAccess.editable).toBe(false)
    if (!failedAccess.editable) {
      expect(failedAccess.reasonCode).toBeDefined()
    }

    // A reviewer trying to access a FAILED note with null assignedReviewerId must not crash
    const reviewerAccess = evaluateEditorAccess({
      actor: { userId: reviewerId, role: 'REVIEWER' },
      noteId,
      status: 'FAILED',
      clinicianId: ownerId,
      assignedReviewerId: null,
    })
    expect(reviewerAccess.editable).toBe(false)

    // resolveClinicianOwnerId with a single version (no null confusion)
    const ownerFromVersions = resolveClinicianOwnerId(
      [{ revisionNumber: 1, authorId: ownerId }],
      otherClinician,
    )
    expect(ownerFromVersions).toBe(ownerId)

    // Empty versions falls back to fallback authorId, never crashes
    const fallback = resolveClinicianOwnerId([], otherClinician)
    expect(fallback).toBe(otherClinician)
  })

  it('35–36: ADMIN matches save policy; ownership helper uses lowest revision', () => {
    expect(access({ role: 'ADMIN', userId: adminId, status: 'IN_REVIEW' }).editable).toBe(true)
    expect(access({ role: 'ADMIN', userId: adminId, status: 'REJECTED' }).editable).toBe(true)
    expect(access({ role: 'ADMIN', userId: adminId, status: 'AMENDED' }).editable).toBe(true)

    const clinicianId = resolveClinicianOwnerId(
      [
        { revisionNumber: 2, authorId: otherClinician },
        { revisionNumber: 1, authorId: ownerId },
      ],
      otherClinician,
    )
    expect(clinicianId).toBe(ownerId)
  })
})
