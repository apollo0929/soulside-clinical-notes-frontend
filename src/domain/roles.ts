export const USER_ROLES = ['CLINICIAN', 'REVIEWER', 'ADMIN', 'READONLY_AUDITOR'] as const

export type UserRole = (typeof USER_ROLES)[number]
