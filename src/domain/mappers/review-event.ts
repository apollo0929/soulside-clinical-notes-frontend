import type { NoteId } from '@/domain/ids'
import type { ReviewEvent } from '@/domain/models/review-event'
import type { ReviewEventDto } from '@/domain/schemas/note-detail'

export function mapReviewEventDtoToDomain(dto: ReviewEventDto, noteId: NoteId): ReviewEvent {
  return {
    id: dto.id,
    noteId,
    versionId: dto.versionId,
    fromStatus: dto.fromStatus,
    toStatus: dto.toStatus,
    actorId: dto.actorId,
    actorRole: dto.actorRole,
    reason: dto.reason,
    occurredAt: dto.occurredAt,
  }
}
