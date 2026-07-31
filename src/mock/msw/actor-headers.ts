import { parseUserId } from '@/domain/ids'
import { USER_ROLES, type UserRole } from '@/domain/roles'
import { createMockApiError, type MockApiError } from '@/mock/errors'
import type { ActorContext } from '@/mock/services/seed-service'

export const ACTOR_USER_ID_HEADER = 'x-user-id'
export const ACTOR_USER_ROLE_HEADER = 'x-user-role'

function parseUserRole(value: string): UserRole | null {
  for (const role of USER_ROLES) {
    if (role === value) {
      return role
    }
  }
  return null
}

export function parseActorHeaders(headers: Headers): ActorContext | MockApiError {
  const userIdRaw = headers.get(ACTOR_USER_ID_HEADER)
  const roleRaw = headers.get(ACTOR_USER_ROLE_HEADER)

  if (!userIdRaw || userIdRaw.trim() === '') {
    return createMockApiError({
      code: 'INVALID_REQUEST',
      status: 400,
      message: `Missing required header ${ACTOR_USER_ID_HEADER}.`,
    })
  }

  if (!roleRaw || roleRaw.trim() === '') {
    return createMockApiError({
      code: 'INVALID_REQUEST',
      status: 400,
      message: `Missing required header ${ACTOR_USER_ROLE_HEADER}.`,
    })
  }

  const role = parseUserRole(roleRaw)
  if (role === null) {
    return createMockApiError({
      code: 'INVALID_REQUEST',
      status: 400,
      message: `Invalid ${ACTOR_USER_ROLE_HEADER} value.`,
    })
  }

  let userId
  try {
    userId = parseUserId(userIdRaw)
  } catch {
    return createMockApiError({
      code: 'INVALID_REQUEST',
      status: 400,
      message: `Invalid ${ACTOR_USER_ID_HEADER} value.`,
    })
  }

  return {
    userId,
    role,
  }
}
