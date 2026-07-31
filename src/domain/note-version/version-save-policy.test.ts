import { describe, expect, it } from 'vitest'

import { evaluateVersionSavePolicy } from '@/domain/note-version'

describe('version save policy', () => {
  it('8: IN_REVIEW assigned reviewer is allowed', () => {
    expect(
      evaluateVersionSavePolicy({
        status: 'IN_REVIEW',
        actorRole: 'REVIEWER',
        isOwner: false,
        isAssignedReviewer: true,
      }).allowed,
    ).toBe(true)
  })

  it('9: IN_REVIEW unassigned reviewer is denied', () => {
    const decision = evaluateVersionSavePolicy({
      status: 'IN_REVIEW',
      actorRole: 'REVIEWER',
      isOwner: false,
      isAssignedReviewer: false,
    })
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) {
      expect(decision.reasonCode).toBe('ASSIGNED_REVIEWER_REQUIRED')
    }
  })

  it('10–13: LOCKED, APPROVED, GENERATING, FAILED saves are denied', () => {
    for (const status of ['LOCKED', 'APPROVED', 'GENERATING', 'FAILED'] as const) {
      const decision = evaluateVersionSavePolicy({
        status,
        actorRole: 'CLINICIAN',
        isOwner: true,
        isAssignedReviewer: false,
      })
      expect(decision.allowed).toBe(false)
      if (!decision.allowed) {
        expect(decision.reasonCode).toBe('STATUS_NOT_EDITABLE')
      }
    }
  })

  it('ADMIN cannot bypass non-editable workflow statuses', () => {
    for (const status of ['APPROVED', 'LOCKED', 'READY_FOR_REVIEW'] as const) {
      const decision = evaluateVersionSavePolicy({
        status,
        actorRole: 'ADMIN',
        isOwner: false,
        isAssignedReviewer: false,
      })
      expect(decision.allowed).toBe(false)
      if (!decision.allowed) {
        expect(decision.reasonCode).toBe('STATUS_NOT_EDITABLE')
      }
    }
  })

  it('14: READONLY_AUDITOR save is denied', () => {
    const decision = evaluateVersionSavePolicy({
      status: 'REJECTED',
      actorRole: 'READONLY_AUDITOR',
      isOwner: false,
      isAssignedReviewer: false,
    })
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) {
      expect(decision.reasonCode).toBe('ROLE_NOT_ALLOWED_TO_EDIT')
    }
  })

  it('15: clinician may save REJECTED and AMENDED when owner', () => {
    for (const status of ['REJECTED', 'AMENDED'] as const) {
      expect(
        evaluateVersionSavePolicy({
          status,
          actorRole: 'CLINICIAN',
          isOwner: true,
          isAssignedReviewer: false,
        }).allowed,
      ).toBe(true)
    }
  })

  it('16: clinician is denied for IN_REVIEW and non-owned REJECTED', () => {
    expect(
      evaluateVersionSavePolicy({
        status: 'IN_REVIEW',
        actorRole: 'CLINICIAN',
        isOwner: true,
        isAssignedReviewer: false,
      }).allowed,
    ).toBe(false)
    expect(
      evaluateVersionSavePolicy({
        status: 'REJECTED',
        actorRole: 'CLINICIAN',
        isOwner: false,
        isAssignedReviewer: false,
      }).allowed,
    ).toBe(false)
  })
})
