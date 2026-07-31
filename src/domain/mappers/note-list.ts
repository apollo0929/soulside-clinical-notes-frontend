import type { NoteSummary } from '@/domain/models/note-summary'
import type { NotesListItemDto } from '@/domain/schemas/notes-list'

export function mapNoteListItemDtoToNoteSummary(dto: NotesListItemDto): NoteSummary {
  return {
    id: dto.id,
    patientId: dto.patient.id,
    patientDisplayName: dto.patient.displayName,
    status: dto.status,
    currentVersionId: dto.currentVersion.id,
    currentRevision: dto.currentVersion.revision,
    assignedReviewer:
      dto.assignedReviewer === null
        ? null
        : {
            id: dto.assignedReviewer.id,
            displayName: dto.assignedReviewer.displayName,
          },
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  }
}
