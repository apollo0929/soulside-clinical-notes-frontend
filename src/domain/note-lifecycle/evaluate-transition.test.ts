import { describe, expect, it } from 'vitest'

import { parseIsoDateTime } from '@/domain/datetime'
import { parseUserId } from '@/domain/ids'
import {
  evaluateNoteTransition,
  getTransitionDecision,
  isTransitionAllowed,
  type NoteTransitionInput,
} from '@/domain/note-lifecycle'
import { buildNoteTransitionContext } from '@/test/fixtures'

function evaluate(
  partial: Omit<NoteTransitionInput, 'context'> & {
    context?: ReturnType<typeof buildNoteTransitionContext>
  },
) {
  return evaluateNoteTransition({
    ...partial,
    context: partial.context ?? buildNoteTransitionContext(),
  })
}

describe('valid transitions', () => {
  it('GENERATING + GENERATION_COMPLETED -> READY_FOR_REVIEW', () => {
    const decision = evaluate({
      status: 'GENERATING',
      action: 'GENERATION_COMPLETED',
      source: 'SERVER',
      context: buildNoteTransitionContext({ actorId: null, actorRole: null }),
    })

    expect(decision).toMatchObject({
      allowed: true,
      fromStatus: 'GENERATING',
      toStatus: 'READY_FOR_REVIEW',
      effects: [],
    })
  })

  it('GENERATING + GENERATION_FAILED -> FAILED', () => {
    const decision = evaluate({
      status: 'GENERATING',
      action: 'GENERATION_FAILED',
      source: 'SYSTEM',
      context: buildNoteTransitionContext({ actorId: null, actorRole: null }),
    })

    expect(decision).toMatchObject({
      allowed: true,
      toStatus: 'FAILED',
    })
  })

  it.each(['CLINICIAN', 'ADMIN'] as const)('FAILED + REGENERATE by %s -> GENERATING', (role) => {
    const decision = evaluate({
      status: 'FAILED',
      action: 'REGENERATE',
      source: 'USER',
      context: buildNoteTransitionContext({
        actorId: parseUserId('usr_actor'),
        actorRole: role,
      }),
    })

    expect(decision).toMatchObject({
      allowed: true,
      toStatus: 'GENERATING',
    })
  })

  it('READY_FOR_REVIEW + START_REVIEW by REVIEWER -> IN_REVIEW with ASSIGN_REVIEWER', () => {
    const actorId = parseUserId('usr_reviewer_1')
    const decision = evaluate({
      status: 'READY_FOR_REVIEW',
      action: 'START_REVIEW',
      source: 'USER',
      context: buildNoteTransitionContext({
        actorId,
        actorRole: 'REVIEWER',
        assignedReviewerId: null,
      }),
    })

    expect(decision.allowed).toBe(true)
    if (decision.allowed) {
      expect(decision.toStatus).toBe('IN_REVIEW')
      expect(decision.effects).toEqual([{ type: 'ASSIGN_REVIEWER', reviewerId: actorId }])
    }
  })

  it('IN_REVIEW + RETURN_TO_QUEUE by assigned reviewer emits RELEASE_REVIEWER', () => {
    const decision = evaluate({
      status: 'IN_REVIEW',
      action: 'RETURN_TO_QUEUE',
      source: 'USER',
      context: buildNoteTransitionContext(),
    })

    expect(decision.allowed).toBe(true)
    if (decision.allowed) {
      expect(decision.toStatus).toBe('READY_FOR_REVIEW')
      expect(decision.effects).toEqual([{ type: 'RELEASE_REVIEWER' }])
    }
  })

  it('IN_REVIEW + APPROVE by assigned reviewer with MFA -> APPROVED', () => {
    const decision = evaluate({
      status: 'IN_REVIEW',
      action: 'APPROVE',
      source: 'USER',
      context: buildNoteTransitionContext({ mfaVerified: true }),
    })

    expect(decision).toMatchObject({
      allowed: true,
      fromStatus: 'IN_REVIEW',
      toStatus: 'APPROVED',
      effects: [],
    })
  })

  it('IN_REVIEW + REJECT normalizes reason and emits RECORD_REJECTION_REASON', () => {
    const decision = evaluate({
      status: 'IN_REVIEW',
      action: 'REJECT',
      source: 'USER',
      context: buildNoteTransitionContext({
        rejectionReason: '  Needs clearer plan section.  ',
      }),
    })

    expect(decision.allowed).toBe(true)
    if (decision.allowed) {
      expect(decision.toStatus).toBe('REJECTED')
      expect(decision.effects).toEqual([
        {
          type: 'RECORD_REJECTION_REASON',
          reason: 'Needs clearer plan section.',
        },
      ])
    }
  })

  it('REJECTED + RESUBMIT by CLINICIAN emits REQUIRE_NEW_VERSION', () => {
    const decision = evaluate({
      status: 'REJECTED',
      action: 'RESUBMIT',
      source: 'USER',
      context: buildNoteTransitionContext({
        actorId: parseUserId('usr_clinician'),
        actorRole: 'CLINICIAN',
      }),
    })

    expect(decision.allowed).toBe(true)
    if (decision.allowed) {
      expect(decision.toStatus).toBe('READY_FOR_REVIEW')
      expect(decision.effects).toEqual([{ type: 'REQUIRE_NEW_VERSION' }])
    }
  })

  it('APPROVED + AMEND within grace emits REQUIRE_NEW_VERSION', () => {
    const approvedAt = parseIsoDateTime('2025-11-04T12:00:00.000Z')
    const decision = evaluate({
      status: 'APPROVED',
      action: 'AMEND',
      source: 'USER',
      context: buildNoteTransitionContext({
        approvedAt,
        occurredAt: parseIsoDateTime('2025-11-04T18:00:00.000Z'),
      }),
    })

    expect(decision.allowed).toBe(true)
    if (decision.allowed) {
      expect(decision.toStatus).toBe('AMENDED')
      expect(decision.effects).toEqual([{ type: 'REQUIRE_NEW_VERSION' }])
    }
  })

  it('APPROVED + GRACE_EXPIRED -> LOCKED', () => {
    const decision = evaluate({
      status: 'APPROVED',
      action: 'GRACE_EXPIRED',
      source: 'SERVER',
      context: buildNoteTransitionContext({ actorId: null, actorRole: null }),
    })

    expect(decision).toMatchObject({
      allowed: true,
      toStatus: 'LOCKED',
    })
  })

  it('AMENDED + START_REVIEW by REVIEWER -> IN_REVIEW', () => {
    const actorId = parseUserId('usr_reviewer_2')
    const decision = evaluate({
      status: 'AMENDED',
      action: 'START_REVIEW',
      source: 'USER',
      context: buildNoteTransitionContext({
        actorId,
        actorRole: 'REVIEWER',
        assignedReviewerId: null,
      }),
    })

    expect(decision.allowed).toBe(true)
    if (decision.allowed) {
      expect(decision.toStatus).toBe('IN_REVIEW')
      expect(decision.effects).toEqual([{ type: 'ASSIGN_REVIEWER', reviewerId: actorId }])
    }
  })
})

describe('invalid transitions', () => {
  it.each([
    {
      name: 'LOCKED cannot start review',
      status: 'LOCKED' as const,
      action: 'START_REVIEW' as const,
      source: 'USER' as const,
    },
    {
      name: 'LOCKED cannot amend',
      status: 'LOCKED' as const,
      action: 'AMEND' as const,
      source: 'USER' as const,
    },
    {
      name: 'READY_FOR_REVIEW cannot approve',
      status: 'READY_FOR_REVIEW' as const,
      action: 'APPROVE' as const,
      source: 'USER' as const,
    },
    {
      name: 'FAILED cannot start review',
      status: 'FAILED' as const,
      action: 'START_REVIEW' as const,
      source: 'USER' as const,
    },
    {
      name: 'APPROVED cannot reject',
      status: 'APPROVED' as const,
      action: 'REJECT' as const,
      source: 'USER' as const,
    },
    {
      name: 'REJECTED cannot approve',
      status: 'REJECTED' as const,
      action: 'APPROVE' as const,
      source: 'USER' as const,
    },
  ])('$name', ({ status, action, source }) => {
    const decision = evaluate({ status, action, source })
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) {
      expect(decision.reasonCode).toBe('INVALID_TRANSITION')
      expect(decision.reason.length).toBeGreaterThan(0)
    }
  })

  it('rejects same-state transitions that are not listed', () => {
    const decision = evaluate({
      status: 'IN_REVIEW',
      action: 'START_REVIEW',
      source: 'USER',
    })

    expect(decision.allowed).toBe(false)
    if (!decision.allowed) {
      expect(decision.reasonCode).toBe('INVALID_TRANSITION')
    }
  })

  it('unknown status/action combinations return INVALID_TRANSITION', () => {
    const decision = evaluate({
      status: 'GENERATING',
      action: 'APPROVE',
      source: 'USER',
    })

    expect(decision).toMatchObject({
      allowed: false,
      reasonCode: 'INVALID_TRANSITION',
    })
  })
})

describe('source validation', () => {
  it.each([
    { action: 'GENERATION_COMPLETED' as const },
    { action: 'GENERATION_FAILED' as const },
    { action: 'GRACE_EXPIRED' as const },
  ])('USER cannot trigger $action', ({ action }) => {
    const status = action === 'GRACE_EXPIRED' ? ('APPROVED' as const) : ('GENERATING' as const)
    const decision = evaluate({
      status,
      action,
      source: 'USER',
    })

    expect(decision).toMatchObject({
      allowed: false,
      reasonCode: 'INVALID_SOURCE',
    })
  })

  it('SERVER cannot invoke user-only REGENERATE', () => {
    const decision = evaluate({
      status: 'FAILED',
      action: 'REGENERATE',
      source: 'SERVER',
      context: buildNoteTransitionContext({ actorRole: 'ADMIN' }),
    })

    expect(decision).toMatchObject({
      allowed: false,
      reasonCode: 'INVALID_SOURCE',
    })
  })

  it('SERVER can invoke GENERATION_COMPLETED', () => {
    expect(
      isTransitionAllowed({
        status: 'GENERATING',
        action: 'GENERATION_COMPLETED',
        source: 'SERVER',
        context: buildNoteTransitionContext({ actorId: null, actorRole: null }),
      }),
    ).toBe(true)
  })

  it('SYSTEM can invoke GRACE_EXPIRED', () => {
    expect(
      isTransitionAllowed({
        status: 'APPROVED',
        action: 'GRACE_EXPIRED',
        source: 'SYSTEM',
        context: buildNoteTransitionContext({ actorId: null, actorRole: null }),
      }),
    ).toBe(true)
  })
})

describe('role and ownership', () => {
  it.each(['REVIEWER', 'READONLY_AUDITOR'] as const)('%s cannot REGENERATE', (role) => {
    const decision = evaluate({
      status: 'FAILED',
      action: 'REGENERATE',
      source: 'USER',
      context: buildNoteTransitionContext({ actorRole: role }),
    })

    expect(decision).toMatchObject({
      allowed: false,
      reasonCode: 'ROLE_NOT_ALLOWED',
    })
  })

  it.each(['CLINICIAN', 'ADMIN'] as const)('%s cannot START_REVIEW', (role) => {
    const decision = evaluate({
      status: 'READY_FOR_REVIEW',
      action: 'START_REVIEW',
      source: 'USER',
      context: buildNoteTransitionContext({ actorRole: role }),
    })

    expect(decision).toMatchObject({
      allowed: false,
      reasonCode: 'ROLE_NOT_ALLOWED',
    })
  })

  it.each(['RETURN_TO_QUEUE', 'APPROVE', 'REJECT'] as const)(
    'different reviewer cannot %s',
    (action) => {
      const decision = evaluate({
        status: 'IN_REVIEW',
        action,
        source: 'USER',
        context: buildNoteTransitionContext({
          actorId: parseUserId('usr_other'),
          actorRole: 'REVIEWER',
          assignedReviewerId: parseUserId('usr_reviewer_1'),
          rejectionReason: action === 'REJECT' ? 'Incomplete assessment' : null,
          mfaVerified: true,
        }),
      })

      expect(decision).toMatchObject({
        allowed: false,
        reasonCode: 'NOT_ASSIGNED_REVIEWER',
      })
      if (!decision.allowed && action === 'APPROVE') {
        expect(decision.reason).toBe('Only the assigned reviewer can approve this note.')
      }
    },
  )

  it.each(['RETURN_TO_QUEUE', 'APPROVE', 'REJECT'] as const)(
    'unassigned note (null assignedReviewerId) cannot %s',
    (action) => {
      const decision = evaluate({
        status: 'IN_REVIEW',
        action,
        source: 'USER',
        context: buildNoteTransitionContext({
          actorId: parseUserId('usr_reviewer_1'),
          actorRole: 'REVIEWER',
          assignedReviewerId: null,
          rejectionReason: action === 'REJECT' ? 'Incomplete assessment' : null,
          mfaVerified: true,
        }),
      })

      expect(decision).toMatchObject({
        allowed: false,
        reasonCode: 'NOT_ASSIGNED_REVIEWER',
      })
    },
  )

  it('assigned actor with non-REVIEWER role cannot APPROVE', () => {
    const actorId = parseUserId('usr_reviewer_1')
    const decision = evaluate({
      status: 'IN_REVIEW',
      action: 'APPROVE',
      source: 'USER',
      context: buildNoteTransitionContext({
        actorId,
        actorRole: 'CLINICIAN',
        assignedReviewerId: actorId,
        mfaVerified: true,
      }),
    })

    expect(decision).toMatchObject({
      allowed: false,
      reasonCode: 'ROLE_NOT_ALLOWED',
    })
  })

  it('assigned actor with non-REVIEWER role cannot REJECT', () => {
    const actorId = parseUserId('usr_reviewer_1')
    const decision = evaluate({
      status: 'IN_REVIEW',
      action: 'REJECT',
      source: 'USER',
      context: buildNoteTransitionContext({
        actorId,
        actorRole: 'ADMIN',
        assignedReviewerId: actorId,
        rejectionReason: 'Incomplete',
      }),
    })

    expect(decision).toMatchObject({
      allowed: false,
      reasonCode: 'ROLE_NOT_ALLOWED',
    })
  })

  it.each(['ADMIN', 'REVIEWER'] as const)('%s cannot RESUBMIT', (role) => {
    const decision = evaluate({
      status: 'REJECTED',
      action: 'RESUBMIT',
      source: 'USER',
      context: buildNoteTransitionContext({ actorRole: role }),
    })

    expect(decision).toMatchObject({
      allowed: false,
      reasonCode: 'ROLE_NOT_ALLOWED',
    })
  })
})

describe('MFA and rejection reason', () => {
  it('APPROVE without MFA is denied with MFA_REQUIRED', () => {
    const decision = evaluate({
      status: 'IN_REVIEW',
      action: 'APPROVE',
      source: 'USER',
      context: buildNoteTransitionContext({ mfaVerified: false }),
    })

    expect(decision).toMatchObject({
      allowed: false,
      reasonCode: 'MFA_REQUIRED',
      reason: 'MFA verification is required before approval.',
    })
  })

  it.each([
    { rejectionReason: null, label: 'null' },
    { rejectionReason: '', label: 'empty' },
    { rejectionReason: '   \t  ', label: 'whitespace-only' },
  ])('REJECT with $label reason is denied', ({ rejectionReason }) => {
    const decision = evaluate({
      status: 'IN_REVIEW',
      action: 'REJECT',
      source: 'USER',
      context: buildNoteTransitionContext({ rejectionReason }),
    })

    expect(decision).toMatchObject({
      allowed: false,
      reasonCode: 'REJECTION_REASON_REQUIRED',
    })
  })
})

describe('amendment grace period', () => {
  const approvedAt = parseIsoDateTime('2025-11-04T12:00:00.000Z')

  it('AMEND immediately after approval is allowed', () => {
    const decision = evaluate({
      status: 'APPROVED',
      action: 'AMEND',
      source: 'USER',
      context: buildNoteTransitionContext({
        approvedAt,
        occurredAt: approvedAt,
      }),
    })

    expect(decision.allowed).toBe(true)
  })

  it('AMEND at exactly 24 hours is allowed', () => {
    const decision = evaluate({
      status: 'APPROVED',
      action: 'AMEND',
      source: 'USER',
      context: buildNoteTransitionContext({
        approvedAt,
        occurredAt: parseIsoDateTime('2025-11-05T12:00:00.000Z'),
      }),
    })

    expect(decision.allowed).toBe(true)
  })

  it('AMEND one millisecond after 24 hours is denied', () => {
    const decision = evaluate({
      status: 'APPROVED',
      action: 'AMEND',
      source: 'USER',
      context: buildNoteTransitionContext({
        approvedAt,
        occurredAt: parseIsoDateTime('2025-11-05T12:00:00.001Z'),
      }),
    })

    expect(decision).toMatchObject({
      allowed: false,
      reasonCode: 'AMENDMENT_GRACE_EXPIRED',
    })
  })

  it('AMEND without approvedAt is denied', () => {
    const decision = evaluate({
      status: 'APPROVED',
      action: 'AMEND',
      source: 'USER',
      context: buildNoteTransitionContext({ approvedAt: null }),
    })

    expect(decision).toMatchObject({
      allowed: false,
      reasonCode: 'APPROVAL_TIMESTAMP_REQUIRED',
    })
  })

  it('current time before approvedAt is denied', () => {
    const decision = evaluate({
      status: 'APPROVED',
      action: 'AMEND',
      source: 'USER',
      context: buildNoteTransitionContext({
        approvedAt,
        occurredAt: parseIsoDateTime('2025-11-04T11:59:59.999Z'),
      }),
    })

    expect(decision).toMatchObject({
      allowed: false,
      reasonCode: 'INVALID_TIME_RANGE',
    })
  })

  it('expired amendment returns AMENDMENT_GRACE_EXPIRED', () => {
    const decision = evaluate({
      status: 'APPROVED',
      action: 'AMEND',
      source: 'USER',
      context: buildNoteTransitionContext({
        approvedAt,
        occurredAt: parseIsoDateTime('2025-11-06T12:00:00.000Z'),
      }),
    })

    expect(decision).toMatchObject({
      allowed: false,
      reasonCode: 'AMENDMENT_GRACE_EXPIRED',
      reason: 'The 24-hour amendment grace period has expired.',
    })
  })
})

describe('decision quality', () => {
  it('denied decisions include stable reasonCode and non-empty reason', () => {
    const decision = evaluate({
      status: 'LOCKED',
      action: 'AMEND',
      source: 'USER',
    })

    expect(decision.allowed).toBe(false)
    if (!decision.allowed) {
      expect(decision.reasonCode).toBe('INVALID_TRANSITION')
      expect(decision.reason).toBe('This action is not available while the note is LOCKED.')
    }
  })

  it('allowed decisions include exact statuses and readonly effects', () => {
    const decision = evaluate({
      status: 'READY_FOR_REVIEW',
      action: 'START_REVIEW',
      source: 'USER',
      context: buildNoteTransitionContext({
        actorRole: 'REVIEWER',
        assignedReviewerId: null,
      }),
    })

    expect(decision.allowed).toBe(true)
    if (decision.allowed) {
      expect(decision.fromStatus).toBe('READY_FOR_REVIEW')
      expect(decision.toStatus).toBe('IN_REVIEW')
      expect(Object.isFrozen(decision.effects)).toBe(true)
      expect(decision.effects.every((effect) => Object.isFrozen(effect))).toBe(true)
    }
  })

  it('evaluator does not mutate its input', () => {
    const context = Object.freeze(buildNoteTransitionContext({ mfaVerified: false }))
    const input = Object.freeze({
      status: 'IN_REVIEW' as const,
      action: 'APPROVE' as const,
      source: 'USER' as const,
      context,
    })

    expect(() => evaluateNoteTransition(input)).not.toThrow()
    expect(context.mfaVerified).toBe(false)
  })

  it('repeated evaluation with same input returns structurally equivalent output', () => {
    const input: NoteTransitionInput = {
      status: 'IN_REVIEW',
      action: 'REJECT',
      source: 'USER',
      context: buildNoteTransitionContext({
        rejectionReason: '  Missing vitals  ',
      }),
    }

    expect(getTransitionDecision(input)).toEqual(evaluateNoteTransition(input))
  })
})

describe('lifecycle boundaries', () => {
  it('does not create ReviewEvent records or mutate Note objects', () => {
    const decision = evaluate({
      status: 'IN_REVIEW',
      action: 'APPROVE',
      source: 'USER',
    })

    expect(decision.allowed).toBe(true)
    if (decision.allowed) {
      expect(decision).not.toHaveProperty('reviewEvent')
      expect(decision).not.toHaveProperty('note')
      expect(decision.effects).toEqual([])
    }
  })
})
