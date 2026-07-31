import type { IsoDateTime } from '@/domain/datetime'
import type { NoteId, PatientId, SessionId, UserId, VersionId } from '@/domain/ids'
import type { NoteStatus } from '@/domain/statuses'

/**
 * Workflow container for one patient session.
 * Does not own editable clinical SOAP content — that lives on NoteVersion.
 */
export type Note = {
  readonly id: NoteId
  readonly patientId: PatientId
  readonly sessionId: SessionId
  readonly status: NoteStatus
  readonly currentVersionId: VersionId
  readonly assignedReviewerId: UserId | null
  readonly createdAt: IsoDateTime
  readonly updatedAt: IsoDateTime
}
