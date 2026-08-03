import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_DEV_ADMIN_ACTOR,
  DEFAULT_DEV_CLINICIAN_ACTOR,
  DEFAULT_DEV_READONLY_AUDITOR_ACTOR,
  DEFAULT_DEV_REVIEWER_ACTOR,
  getActorIdentity,
  resetActorIdentity,
  setActorIdentity,
  subscribeActorIdentity,
} from '@/services/api/actor-provider'

describe('actor-provider', () => {
  afterEach(() => {
    resetActorIdentity()
  })

  it('accepts predefined and valid console actors', () => {
    expect(() => setActorIdentity(DEFAULT_DEV_ADMIN_ACTOR)).not.toThrow()
    expect(getActorIdentity()).toEqual(DEFAULT_DEV_ADMIN_ACTOR)

    expect(() => setActorIdentity(DEFAULT_DEV_REVIEWER_ACTOR)).not.toThrow()
    expect(() => setActorIdentity(DEFAULT_DEV_CLINICIAN_ACTOR)).not.toThrow()
    expect(() => setActorIdentity(DEFAULT_DEV_READONLY_AUDITOR_ACTOR)).not.toThrow()

    expect(() =>
      setActorIdentity({ userId: 'usr_clinician_42_1', role: 'CLINICIAN' }),
    ).not.toThrow()
    expect(getActorIdentity()).toEqual({ userId: 'usr_clinician_42_1', role: 'CLINICIAN' })
  })

  it('rejects missing userId, empty role, invalid role, and padded role', () => {
    expect(() =>
      setActorIdentity({ role: 'CLINICIAN' } as { userId: string; role: 'CLINICIAN' }),
    ).toThrow(/userId/)

    expect(() => setActorIdentity({ userId: 'usr_clinician_42_1', role: '' as never })).toThrow(
      /role/,
    )

    expect(() => setActorIdentity({ userId: 'usr_clinician_42_1', role: 'FOO' as never })).toThrow(
      /CLINICIAN \| REVIEWER \| ADMIN \| READONLY_AUDITOR/,
    )

    expect(() =>
      setActorIdentity({ userId: 'usr_clinician_42_1', role: 'ADMIN ' as never }),
    ).toThrow(/role/)
  })

  it('notifies subscribers on set and reset without requiring navigation', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeActorIdentity(listener)

    setActorIdentity(DEFAULT_DEV_ADMIN_ACTOR)
    expect(listener).toHaveBeenCalledTimes(1)

    setActorIdentity(DEFAULT_DEV_ADMIN_ACTOR)
    expect(listener).toHaveBeenCalledTimes(1)

    resetActorIdentity()
    expect(listener).toHaveBeenCalledTimes(2)
    expect(getActorIdentity()).toEqual(DEFAULT_DEV_REVIEWER_ACTOR)

    unsubscribe()
    setActorIdentity(DEFAULT_DEV_CLINICIAN_ACTOR)
    expect(listener).toHaveBeenCalledTimes(2)
  })
})
