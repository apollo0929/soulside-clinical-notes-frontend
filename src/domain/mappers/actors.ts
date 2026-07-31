import type { Patient } from '@/domain/models/patient'
import type { User } from '@/domain/models/user'
import type { ActorRefDto, PatientDto, UserSummaryDto } from '@/domain/schemas/common'

export function mapPatientDtoToDomain(dto: PatientDto): Patient {
  return {
    id: dto.id,
    displayName: dto.displayName,
  }
}

export function mapUserSummaryDtoToDomain(dto: UserSummaryDto): User {
  return {
    id: dto.id,
    displayName: dto.displayName,
    role: dto.role,
  }
}

export function mapActorRefDtoToAuthor(dto: ActorRefDto): {
  readonly authorId: ActorRefDto['id']
  readonly authorRole: ActorRefDto['role']
} {
  return {
    authorId: dto.id,
    authorRole: dto.role,
  }
}
