import { describe, expect, it } from 'vitest'

import { parseUserId } from '@/domain/ids'
import {
  evaluateNoteTransition,
  getAllowedAvailableActions,
  getAvailableActions,
} from '@/domain/note-lifecycle'
import { buildNoteTransitionContext } from '@/test/fixtures'

describe('getAvailableActions', () => {
  it('derives every decision from the shared evaluator', () => {
    const context = buildNoteTransitionContext({
      actorRole: 'REVIEWER',
      assignedReviewerId: null,
    })
    const available = getAvailableActions({
      status: 'READY_FOR_REVIEW',
      source: 'USER',
      context,
    })

    for (const decision of available) {
      expect(decision).toEqual(
        evaluateNoteTransition({
          status: 'READY_FOR_REVIEW',
          action: decision.action,
          source: 'USER',
          context,
        }),
      )
    }
  })

  it('READY_FOR_REVIEW reviewer sees START_REVIEW allowed', () => {
    const decisions = getAvailableActions({
      status: 'READY_FOR_REVIEW',
      source: 'USER',
      context: buildNoteTransitionContext({
        actorRole: 'REVIEWER',
        assignedReviewerId: null,
      }),
    })
    const startReview = decisions.find((decision) => decision.action === 'START_REVIEW')

    expect(startReview?.allowed).toBe(true)
  })

  it('READY_FOR_REVIEW clinician sees START_REVIEW denied with reason', () => {
    const decisions = getAvailableActions({
      status: 'READY_FOR_REVIEW',
      source: 'USER',
      context: buildNoteTransitionContext({
        actorId: parseUserId('usr_clinician'),
        actorRole: 'CLINICIAN',
        assignedReviewerId: null,
      }),
    })
    const startReview = decisions.find((decision) => decision.action === 'START_REVIEW')

    expect(startReview).toMatchObject({
      allowed: false,
      reasonCode: 'ROLE_NOT_ALLOWED',
    })
    if (startReview && !startReview.allowed) {
      expect(startReview.reason.length).toBeGreaterThan(0)
    }
  })

  it('IN_REVIEW assigned reviewer sees approval decision based on MFA', () => {
    const withoutMfa = getAvailableActions({
      status: 'IN_REVIEW',
      source: 'USER',
      context: buildNoteTransitionContext({ mfaVerified: false }),
    }).find((decision) => decision.action === 'APPROVE')

    const withMfa = getAvailableActions({
      status: 'IN_REVIEW',
      source: 'USER',
      context: buildNoteTransitionContext({ mfaVerified: true }),
    }).find((decision) => decision.action === 'APPROVE')

    expect(withoutMfa).toMatchObject({
      allowed: false,
      reasonCode: 'MFA_REQUIRED',
    })
    expect(withMfa?.allowed).toBe(true)
  })

  it('LOCKED returns no allowed lifecycle user actions', () => {
    const allowed = getAllowedAvailableActions({
      status: 'LOCKED',
      source: 'USER',
      context: buildNoteTransitionContext(),
    })

    expect(allowed).toEqual([])
  })

  it('available-action helper does not contradict evaluator results', () => {
    const context = buildNoteTransitionContext({
      actorRole: 'CLINICIAN',
      assignedReviewerId: null,
    })
    const available = getAvailableActions({
      status: 'FAILED',
      source: 'USER',
      context,
    })
    const regenerate = available.find((decision) => decision.action === 'REGENERATE')

    expect(regenerate).toEqual(
      evaluateNoteTransition({
        status: 'FAILED',
        action: 'REGENERATE',
        source: 'USER',
        context,
      }),
    )
    expect(regenerate?.allowed).toBe(true)
  })
})
