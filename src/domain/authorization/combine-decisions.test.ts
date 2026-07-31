import { describe, expect, it } from 'vitest'

import { authorize, combineAuthorizationAndLifecycle } from '@/domain/authorization'
import { parseUserId } from '@/domain/ids'
import { evaluateNoteTransition } from '@/domain/note-lifecycle'
import {
  buildAuthorizationActor,
  buildNoteAuthorizationResource,
  buildNoteTransitionContext,
} from '@/test/fixtures'

describe('combineAuthorizationAndLifecycle', () => {
  it('authorization denial wins and preserves authorization reason codes', () => {
    const authorization = authorize({
      permission: 'REVIEW_APPROVE',
      actor: buildAuthorizationActor({ role: 'CLINICIAN' }),
      resource: buildNoteAuthorizationResource(),
    })
    const lifecycle = evaluateNoteTransition({
      status: 'IN_REVIEW',
      action: 'APPROVE',
      source: 'USER',
      context: buildNoteTransitionContext(),
    })

    const combined = combineAuthorizationAndLifecycle({ authorization, lifecycle })

    expect(combined.allowed).toBe(false)
    if (!combined.allowed) {
      expect(combined.source).toBe('AUTHORIZATION')
      expect(combined.authorization.allowed).toBe(false)
      if (!combined.authorization.allowed) {
        expect(combined.authorization.reasonCode).toBe('ROLE_NOT_PERMITTED')
      }
    }
  })

  it('lifecycle denial is preserved when authorization allows', () => {
    const reviewerId = parseUserId('usr_reviewer_1')
    const authorization = authorize({
      permission: 'REVIEW_APPROVE',
      actor: buildAuthorizationActor({ role: 'REVIEWER', userId: reviewerId }),
      resource: buildNoteAuthorizationResource({ assignedReviewerId: reviewerId }),
    })
    const lifecycle = evaluateNoteTransition({
      status: 'IN_REVIEW',
      action: 'APPROVE',
      source: 'USER',
      context: buildNoteTransitionContext({
        actorId: reviewerId,
        actorRole: 'REVIEWER',
        assignedReviewerId: reviewerId,
        mfaVerified: false,
      }),
    })

    const combined = combineAuthorizationAndLifecycle({ authorization, lifecycle })

    expect(authorization.allowed).toBe(true)
    expect(combined.allowed).toBe(false)
    if (!combined.allowed && combined.source === 'LIFECYCLE') {
      expect(combined.lifecycle.allowed).toBe(false)
      expect(combined.lifecycle.reasonCode).toBe('MFA_REQUIRED')
      expect(combined.lifecycle.reason).toBe('MFA verification is required before approval.')
    }
  })

  it('both allowed produce a combined allowed result', () => {
    const reviewerId = parseUserId('usr_reviewer_1')
    const authorization = authorize({
      permission: 'REVIEW_APPROVE',
      actor: buildAuthorizationActor({ role: 'REVIEWER', userId: reviewerId }),
      resource: buildNoteAuthorizationResource({ assignedReviewerId: reviewerId }),
    })
    const lifecycle = evaluateNoteTransition({
      status: 'IN_REVIEW',
      action: 'APPROVE',
      source: 'USER',
      context: buildNoteTransitionContext({
        actorId: reviewerId,
        actorRole: 'REVIEWER',
        assignedReviewerId: reviewerId,
        mfaVerified: true,
      }),
    })

    const combined = combineAuthorizationAndLifecycle({ authorization, lifecycle })

    expect(combined).toEqual({
      allowed: true,
      authorization,
      lifecycle,
    })
  })

  it('combined helper is pure and does not mutate either decision', () => {
    const authorization = Object.freeze(
      authorize({
        permission: 'NOTES_VIEW',
        actor: buildAuthorizationActor({ role: 'ADMIN' }),
        resource: null,
      }),
    )
    const lifecycle = Object.freeze(
      evaluateNoteTransition({
        status: 'GENERATING',
        action: 'GENERATION_COMPLETED',
        source: 'SERVER',
        context: buildNoteTransitionContext({ actorId: null, actorRole: null }),
      }),
    )

    const first = combineAuthorizationAndLifecycle({ authorization, lifecycle })
    const second = combineAuthorizationAndLifecycle({ authorization, lifecycle })

    expect(first).toEqual(second)
    expect(authorization.allowed).toBe(true)
    expect(lifecycle.allowed).toBe(true)
  })

  it('does not convert authorization reason codes into lifecycle reason codes', () => {
    const authorization = authorize({
      permission: 'NOTE_EDIT',
      actor: buildAuthorizationActor({
        role: 'CLINICIAN',
        userId: parseUserId('usr_clinician_1'),
      }),
      resource: buildNoteAuthorizationResource({
        clinicianId: parseUserId('usr_clinician_2'),
      }),
    })
    const lifecycle = evaluateNoteTransition({
      status: 'LOCKED',
      action: 'AMEND',
      source: 'USER',
      context: buildNoteTransitionContext(),
    })

    const combined = combineAuthorizationAndLifecycle({ authorization, lifecycle })

    expect(combined.allowed).toBe(false)
    if (!combined.allowed && combined.source === 'AUTHORIZATION') {
      expect(combined.authorization.reasonCode).toBe('NOTE_OWNERSHIP_REQUIRED')
      expect(combined.authorization).not.toHaveProperty('fromStatus')
    }
  })
})
