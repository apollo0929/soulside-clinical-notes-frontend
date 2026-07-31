import type { UserId } from '@/domain/ids'
import type { UserRole } from '@/domain/roles'

export type User = {
  readonly id: UserId
  readonly displayName: string
  readonly role: UserRole
}
