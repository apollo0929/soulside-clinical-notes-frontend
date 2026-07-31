import { z } from 'zod'

import { USER_ROLES } from '@/domain/roles'
import { NOTE_STATUSES } from '@/domain/statuses'

export const userRoleSchema = z.enum(USER_ROLES)
export const noteStatusSchema = z.enum(NOTE_STATUSES)

export const displayNameSchema = z.string().trim().min(1, 'Display name must be non-empty')

export const revisionNumberSchema = z
  .number()
  .int('Revision must be an integer')
  .positive('Revision must be a positive integer (one-based)')

export const nonNegativeIntSchema = z
  .number()
  .int('Count must be an integer')
  .nonnegative('Count must be non-negative')
