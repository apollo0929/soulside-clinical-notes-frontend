import { describe, expect, it } from 'vitest'

import { evaluateReviewerAssignment } from '@/domain/note-assignment/assignment-policy'
import { NOTE_STATUSES } from '@/domain/statuses'

describe('evaluateReviewerAssignment', () => {
  it('allows ADMIN for READY_FOR_REVIEW, IN_REVIEW, and AMENDED', () => {
    for (const status of ['READY_FOR_REVIEW', 'IN_REVIEW', 'AMENDED'] as const) {
      expect(evaluateReviewerAssignment({ status, isAdmin: true })).toEqual({ allowed: true })
    }
  })

  it('denies non-admin for assignable statuses', () => {
    const decision = evaluateReviewerAssignment({
      status: 'READY_FOR_REVIEW',
      isAdmin: false,
    })
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) {
      expect(decision.reasonCode).toBe('ROLE_NOT_PERMITTED')
    }
  })

  it('denies disallowed statuses for ADMIN', () => {
    for (const status of NOTE_STATUSES) {
      if (status === 'READY_FOR_REVIEW' || status === 'IN_REVIEW' || status === 'AMENDED') {
        continue
      }
      const decision = evaluateReviewerAssignment({ status, isAdmin: true })
      expect(decision.allowed).toBe(false)
      if (!decision.allowed) {
        expect(decision.reasonCode).toBe('STATUS_NOT_ASSIGNABLE')
      }
    }
  })
})
