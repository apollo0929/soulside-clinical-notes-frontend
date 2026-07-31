import { describe, expect, it } from 'vitest'

import {
  authorize,
  type AuthorizeInput,
  combineAuthorizationAndLifecycle,
  getAuthorizedPermissions,
  getPermissionDecision,
  getPermissionsForRole,
  hasPermission,
} from '@/domain/authorization'
import { parseUserId } from '@/domain/ids'
import { evaluateNoteTransition } from '@/domain/note-lifecycle'
import {
  buildAuthorizationActor,
  buildNoteAuthorizationResource,
  buildNoteTransitionContext,
} from '@/test/fixtures'

function decide(
  partial: Omit<AuthorizeInput, 'actor' | 'resource'> & {
    actor?: ReturnType<typeof buildAuthorizationActor>
    resource?: ReturnType<typeof buildNoteAuthorizationResource> | null
  },
) {
  return authorize({
    permission: partial.permission,
    actor: partial.actor ?? buildAuthorizationActor(),
    resource: partial.resource === undefined ? buildNoteAuthorizationResource() : partial.resource,
  })
}

describe('role-level access', () => {
  it.each(['CLINICIAN', 'REVIEWER', 'ADMIN', 'READONLY_AUDITOR'] as const)(
    '%s can view notes',
    (role) => {
      expect(
        decide({
          permission: 'NOTES_VIEW',
          actor: buildAuthorizationActor({ role }),
          resource: null,
        }).allowed,
      ).toBe(true)
    },
  )

  it('READONLY_AUDITOR can view note history and review events', () => {
    const actor = buildAuthorizationActor({ role: 'READONLY_AUDITOR' })
    const resource = buildNoteAuthorizationResource()

    expect(decide({ permission: 'NOTE_HISTORY_VIEW', actor, resource }).allowed).toBe(true)
    expect(decide({ permission: 'REVIEW_EVENTS_VIEW', actor, resource }).allowed).toBe(true)
  })

  it.each([
    'NOTE_EDIT',
    'REVIEW_START',
    'REVIEW_RETURN',
    'REVIEW_APPROVE',
    'REVIEW_REJECT',
    'NOTE_RESUBMIT',
    'NOTE_REGENERATE',
    'NOTE_AMEND',
    'NOTE_ASSIGN_REVIEWER',
    'NOTE_BULK_ASSIGN_REVIEWER',
    'NOTE_BULK_REGENERATE',
    'ADMIN_SIMULATION_CONTROL',
  ] as const)('READONLY_AUDITOR cannot %s', (permission) => {
    const decision = decide({
      permission,
      actor: buildAuthorizationActor({ role: 'READONLY_AUDITOR' }),
      resource:
        permission === 'NOTE_BULK_ASSIGN_REVIEWER' ||
        permission === 'NOTE_BULK_REGENERATE' ||
        permission === 'ADMIN_SIMULATION_CONTROL'
          ? null
          : buildNoteAuthorizationResource(),
    })

    expect(decision).toMatchObject({
      allowed: false,
      reasonCode: 'READ_ONLY_ROLE',
      reason: 'Read-only auditors cannot modify notes.',
    })
  })

  it('CLINICIAN cannot assign reviewer', () => {
    expect(
      decide({
        permission: 'NOTE_ASSIGN_REVIEWER',
        actor: buildAuthorizationActor({ role: 'CLINICIAN' }),
      }),
    ).toMatchObject({
      allowed: false,
      reasonCode: 'ROLE_NOT_PERMITTED',
    })
  })

  it('REVIEWER cannot perform bulk assignment', () => {
    expect(
      decide({
        permission: 'NOTE_BULK_ASSIGN_REVIEWER',
        actor: buildAuthorizationActor({ role: 'REVIEWER' }),
        resource: null,
      }),
    ).toMatchObject({
      allowed: false,
      reasonCode: 'ROLE_NOT_PERMITTED',
    })
  })

  it('ADMIN can assign reviewer, bulk assign, and control simulation', () => {
    const actor = buildAuthorizationActor({ role: 'ADMIN', userId: parseUserId('usr_admin') })

    expect(decide({ permission: 'NOTE_ASSIGN_REVIEWER', actor }).allowed).toBe(true)
    expect(decide({ permission: 'NOTE_BULK_ASSIGN_REVIEWER', actor, resource: null }).allowed).toBe(
      true,
    )
    expect(decide({ permission: 'ADMIN_SIMULATION_CONTROL', actor, resource: null }).allowed).toBe(
      true,
    )
  })

  it.each(['CLINICIAN', 'REVIEWER', 'READONLY_AUDITOR'] as const)(
    '%s cannot control simulation',
    (role) => {
      expect(
        decide({
          permission: 'ADMIN_SIMULATION_CONTROL',
          actor: buildAuthorizationActor({ role }),
          resource: null,
        }),
      ).toMatchObject({
        allowed: false,
        reasonCode: role === 'READONLY_AUDITOR' ? 'READ_ONLY_ROLE' : 'ROLE_NOT_PERMITTED',
      })
    },
  )
})

describe('clinician ownership', () => {
  const clinicianId = parseUserId('usr_clinician_1')
  const otherClinicianId = parseUserId('usr_clinician_2')

  it.each(['NOTE_EDIT', 'NOTE_RESUBMIT', 'NOTE_REGENERATE', 'NOTE_AMEND'] as const)(
    'CLINICIAN can %s an owned note',
    (permission) => {
      expect(
        decide({
          permission,
          actor: buildAuthorizationActor({ role: 'CLINICIAN', userId: clinicianId }),
          resource: buildNoteAuthorizationResource({ clinicianId }),
        }).allowed,
      ).toBe(true)
    },
  )

  it.each(['NOTE_EDIT', 'NOTE_RESUBMIT', 'NOTE_REGENERATE', 'NOTE_AMEND'] as const)(
    "CLINICIAN cannot %s another clinician's note",
    (permission) => {
      const decision = decide({
        permission,
        actor: buildAuthorizationActor({ role: 'CLINICIAN', userId: clinicianId }),
        resource: buildNoteAuthorizationResource({ clinicianId: otherClinicianId }),
      })

      expect(decision).toMatchObject({
        allowed: false,
        reasonCode: 'NOTE_OWNERSHIP_REQUIRED',
      })
      if (!decision.allowed) {
        expect(decision.reason.length).toBeGreaterThan(0)
        if (permission === 'NOTE_EDIT') {
          expect(decision.reason).toBe('Only the clinician who owns this note can edit it.')
        }
      }
    },
  )
})

describe('reviewer rules', () => {
  it.each(['REVIEW_START', 'REVIEW_APPROVE', 'REVIEW_REJECT', 'REVIEW_RETURN'] as const)(
    'REVIEWER has %s role permission',
    (permission) => {
      expect(
        decide({
          permission,
          actor: buildAuthorizationActor({ role: 'REVIEWER' }),
        }).allowed,
      ).toBe(true)
    },
  )

  it('REVIEWER can edit an assigned note', () => {
    const reviewerId = parseUserId('usr_reviewer_1')
    expect(
      decide({
        permission: 'NOTE_EDIT',
        actor: buildAuthorizationActor({ role: 'REVIEWER', userId: reviewerId }),
        resource: buildNoteAuthorizationResource({ assignedReviewerId: reviewerId }),
      }).allowed,
    ).toBe(true)
  })

  it('REVIEWER cannot edit an unassigned note', () => {
    expect(
      decide({
        permission: 'NOTE_EDIT',
        actor: buildAuthorizationActor({ role: 'REVIEWER' }),
        resource: buildNoteAuthorizationResource({ assignedReviewerId: null }),
      }),
    ).toMatchObject({
      allowed: false,
      reasonCode: 'ASSIGNED_REVIEWER_REQUIRED',
      reason: 'Only the assigned reviewer can edit this note.',
    })
  })

  it('REVIEWER cannot edit a note assigned to another reviewer', () => {
    expect(
      decide({
        permission: 'NOTE_EDIT',
        actor: buildAuthorizationActor({
          role: 'REVIEWER',
          userId: parseUserId('usr_reviewer_1'),
        }),
        resource: buildNoteAuthorizationResource({
          assignedReviewerId: parseUserId('usr_reviewer_2'),
        }),
      }),
    ).toMatchObject({
      allowed: false,
      reasonCode: 'ASSIGNED_REVIEWER_REQUIRED',
    })
  })

  it.each(['NOTE_RESUBMIT', 'NOTE_REGENERATE', 'NOTE_AMEND'] as const)(
    'REVIEWER cannot %s',
    (permission) => {
      expect(
        decide({
          permission,
          actor: buildAuthorizationActor({ role: 'REVIEWER' }),
        }),
      ).toMatchObject({
        allowed: false,
        reasonCode: 'ROLE_NOT_PERMITTED',
      })
    },
  )
})

describe('admin rules', () => {
  const admin = buildAuthorizationActor({ role: 'ADMIN', userId: parseUserId('usr_admin') })

  it('ADMIN can edit, regenerate, and amend any note', () => {
    const resource = buildNoteAuthorizationResource({
      clinicianId: parseUserId('usr_someone_else'),
      assignedReviewerId: null,
    })

    expect(decide({ permission: 'NOTE_EDIT', actor: admin, resource }).allowed).toBe(true)
    expect(decide({ permission: 'NOTE_REGENERATE', actor: admin, resource }).allowed).toBe(true)
    expect(decide({ permission: 'NOTE_AMEND', actor: admin, resource }).allowed).toBe(true)
  })

  it('ADMIN role permission alone does not imply a valid lifecycle transition', () => {
    expect(getPermissionsForRole('ADMIN')).toContain('NOTE_EDIT')
    expect(getPermissionsForRole('ADMIN')).not.toContain('REVIEW_START')
    expect(getPermissionsForRole('ADMIN')).not.toContain('NOTE_RESUBMIT')
  })

  it('ADMIN authorization does not bypass lifecycle denial', () => {
    const authorization = authorize({
      permission: 'NOTE_AMEND',
      actor: buildAuthorizationActor({ role: 'ADMIN', userId: parseUserId('usr_admin') }),
      resource: buildNoteAuthorizationResource({
        clinicianId: parseUserId('usr_someone_else'),
      }),
    })
    const lifecycle = evaluateNoteTransition({
      status: 'LOCKED',
      action: 'AMEND',
      source: 'USER',
      context: buildNoteTransitionContext(),
    })
    const combined = combineAuthorizationAndLifecycle({ authorization, lifecycle })

    expect(authorization.allowed).toBe(true)
    expect(combined.allowed).toBe(false)
    if (!combined.allowed && combined.source === 'LIFECYCLE') {
      expect(combined.lifecycle.reasonCode).toBe('INVALID_TRANSITION')
    }
  })
})

describe('resource context', () => {
  it('resource-required permission without resource is denied', () => {
    expect(
      decide({
        permission: 'NOTE_EDIT',
        actor: buildAuthorizationActor({ role: 'ADMIN' }),
        resource: null,
      }),
    ).toMatchObject({
      allowed: false,
      reasonCode: 'RESOURCE_CONTEXT_REQUIRED',
      reason: 'This operation requires note context.',
    })
  })

  it('role-only permission does not require note context', () => {
    expect(
      decide({
        permission: 'NOTES_VIEW',
        actor: buildAuthorizationActor({ role: 'CLINICIAN' }),
        resource: null,
      }).allowed,
    ).toBe(true)
    expect(
      decide({
        permission: 'ADMIN_SIMULATION_CONTROL',
        actor: buildAuthorizationActor({ role: 'ADMIN' }),
        resource: null,
      }).allowed,
    ).toBe(true)
  })

  it('missing assignedReviewerId is handled explicitly for reviewer edit', () => {
    const decision = decide({
      permission: 'NOTE_EDIT',
      actor: buildAuthorizationActor({ role: 'REVIEWER' }),
      resource: buildNoteAuthorizationResource({ assignedReviewerId: null }),
    })

    expect(decision.allowed).toBe(false)
    if (!decision.allowed) {
      expect(decision.reasonCode).toBe('ASSIGNED_REVIEWER_REQUIRED')
    }
  })

  it('ownership comparison uses branded UserId correctly', () => {
    const clinicianId = parseUserId('usr_clinician_1')
    expect(
      decide({
        permission: 'NOTE_EDIT',
        actor: buildAuthorizationActor({ role: 'CLINICIAN', userId: clinicianId }),
        resource: buildNoteAuthorizationResource({ clinicianId }),
      }).allowed,
    ).toBe(true)
  })

  it('evaluator does not mutate input resource and is deterministic', () => {
    const resource = Object.freeze(buildNoteAuthorizationResource())
    const actor = Object.freeze(
      buildAuthorizationActor({
        role: 'CLINICIAN',
        userId: resource.clinicianId,
      }),
    )
    const input = Object.freeze({
      permission: 'NOTE_EDIT' as const,
      actor,
      resource,
    })

    const first = authorize(input)
    const second = getPermissionDecision(input)

    expect(() => authorize(input)).not.toThrow()
    expect(first).toEqual(second)
    expect(resource.clinicianId).toBe(parseUserId('usr_clinician_1'))
  })
})

describe('decision quality', () => {
  it('allowed decision contains permission and role', () => {
    const decision = decide({
      permission: 'NOTES_VIEW',
      actor: buildAuthorizationActor({ role: 'REVIEWER' }),
      resource: null,
    })

    expect(decision).toEqual({
      allowed: true,
      permission: 'NOTES_VIEW',
      role: 'REVIEWER',
    })
  })

  it('denied decision contains stable reasonCode and non-empty reason', () => {
    const decision = decide({
      permission: 'NOTE_ASSIGN_REVIEWER',
      actor: buildAuthorizationActor({ role: 'CLINICIAN' }),
    })

    expect(decision.allowed).toBe(false)
    if (!decision.allowed) {
      expect(decision.reasonCode).toBe('ROLE_NOT_PERMITTED')
      expect(decision.reason.length).toBeGreaterThan(0)
    }
  })

  it('resource-context denial is distinct from role denial', () => {
    const missingResource = decide({
      permission: 'NOTE_CONTENT_VIEW',
      actor: buildAuthorizationActor({ role: 'CLINICIAN' }),
      resource: null,
    })
    const missingRole = decide({
      permission: 'NOTE_ASSIGN_REVIEWER',
      actor: buildAuthorizationActor({ role: 'CLINICIAN' }),
    })

    expect(missingResource).toMatchObject({ reasonCode: 'RESOURCE_CONTEXT_REQUIRED' })
    expect(missingRole).toMatchObject({ reasonCode: 'ROLE_NOT_PERMITTED' })
  })
})

describe('helpers', () => {
  it('hasPermission delegates consistently to authorize', () => {
    const input = {
      permission: 'NOTES_VIEW' as const,
      actor: buildAuthorizationActor({ role: 'ADMIN' }),
      resource: null,
    }

    expect(hasPermission(input)).toBe(authorize(input).allowed)
  })

  it('getPermissionsForRole contains only role-level capabilities', () => {
    const clinicianPermissions = getPermissionsForRole('CLINICIAN')
    const reviewerPermissions = getPermissionsForRole('REVIEWER')
    const auditorPermissions = getPermissionsForRole('READONLY_AUDITOR')

    expect(clinicianPermissions).toEqual(
      expect.arrayContaining([
        'NOTES_VIEW',
        'NOTE_EDIT',
        'NOTE_RESUBMIT',
        'NOTE_REGENERATE',
        'NOTE_AMEND',
      ]),
    )
    expect(clinicianPermissions).not.toContain('REVIEW_APPROVE')
    expect(reviewerPermissions).toEqual(
      expect.arrayContaining(['REVIEW_START', 'REVIEW_APPROVE', 'NOTE_EDIT']),
    )
    expect(reviewerPermissions).not.toContain('NOTE_RESUBMIT')
    expect(auditorPermissions).not.toContain('NOTE_EDIT')
    expect(auditorPermissions).toEqual(
      expect.arrayContaining([
        'NOTES_VIEW',
        'NOTE_CONTENT_VIEW',
        'NOTE_HISTORY_VIEW',
        'REVIEW_EVENTS_VIEW',
      ]),
    )
  })

  it('resource ownership is still enforced by authorize despite role catalog', () => {
    expect(getPermissionsForRole('CLINICIAN')).toContain('NOTE_EDIT')
    expect(
      decide({
        permission: 'NOTE_EDIT',
        actor: buildAuthorizationActor({
          role: 'CLINICIAN',
          userId: parseUserId('usr_clinician_1'),
        }),
        resource: buildNoteAuthorizationResource({
          clinicianId: parseUserId('usr_clinician_2'),
        }),
      }).allowed,
    ).toBe(false)
  })

  it('getAuthorizedPermissions uses the same evaluator', () => {
    const actor = buildAuthorizationActor({ role: 'REVIEWER' })
    const resource = buildNoteAuthorizationResource({ assignedReviewerId: null })
    const decisions = getAuthorizedPermissions(actor, resource)
    const edit = decisions.find((decision) => decision.permission === 'NOTE_EDIT')

    expect(edit).toEqual(
      authorize({
        permission: 'NOTE_EDIT',
        actor,
        resource,
      }),
    )
  })
})

describe('authorization boundaries', () => {
  it('authorization module does not expose lifecycle transition APIs', async () => {
    const auth = await import('@/domain/authorization')

    expect(auth).not.toHaveProperty('NOTE_TRANSITION_SPECIFICATIONS')
    expect(auth).not.toHaveProperty('evaluateNoteTransition')
    expect(auth).not.toHaveProperty('AMENDMENT_GRACE_PERIOD_MS')
  })
})
