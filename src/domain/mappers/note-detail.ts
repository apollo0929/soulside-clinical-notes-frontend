import type { SessionId } from '@/domain/ids'
import { mapPatientDtoToDomain, mapUserSummaryDtoToDomain } from '@/domain/mappers/actors'
import {
  mapNoteVersionDtoToDomain,
  mapNoteVersionRefDtoToDomain,
} from '@/domain/mappers/note-version'
import { mapReviewEventDtoToDomain } from '@/domain/mappers/review-event'
import type { NoteDetailAggregate } from '@/domain/models/note-detail-aggregate'
import type { NoteDetailDto } from '@/domain/schemas/note-detail'

export type MapNoteDetailOptions = {
  readonly sessionId: SessionId
}

/**
 * Maps a validated note-detail DTO into normalized domain objects.
 * sessionId is required because the list/detail transport samples omit it,
 * while the Note aggregate requires a session association.
 */
export function mapNoteDetailDtoToDomain(
  dto: NoteDetailDto,
  options: MapNoteDetailOptions,
): NoteDetailAggregate {
  const patient = mapPatientDtoToDomain(dto.patient)
  const assignedReviewer =
    dto.assignedReviewer === null ? null : mapUserSummaryDtoToDomain(dto.assignedReviewer)
  const currentVersion = mapNoteVersionDtoToDomain(dto.currentVersion, dto.id)
  const versions = dto.versions.map((version) => mapNoteVersionRefDtoToDomain(version, dto.id))
  const reviewEvents = dto.review.events.map((event) => mapReviewEventDtoToDomain(event, dto.id))

  return {
    note: {
      id: dto.id,
      patientId: patient.id,
      sessionId: options.sessionId,
      status: dto.status,
      currentVersionId: currentVersion.id,
      assignedReviewerId: assignedReviewer?.id ?? null,
      createdAt: dto.createdAt,
      updatedAt: dto.updatedAt,
    },
    patient,
    assignedReviewer,
    currentVersion,
    versions,
    reviewEvents,
  }
}
