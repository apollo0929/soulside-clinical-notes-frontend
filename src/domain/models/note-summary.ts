import type { IsoDateTime } from '@/domain/datetime'
import type { NoteId, PatientId, UserId, VersionId } from '@/domain/ids'
import type { NoteStatus } from '@/domain/statuses'

export type NoteSummaryReviewer = {
  readonly id: UserId
  readonly displayName: string
}

/**
 * List-view projection. Does not embed SOAP clinical content.
 */
export type NoteSummary = {
  readonly id: NoteId
  readonly patientId: PatientId
  readonly patientDisplayName: string
  readonly status: NoteStatus
  readonly currentVersionId: VersionId
  readonly currentRevision: number
  readonly assignedReviewer: NoteSummaryReviewer | null
  readonly createdAt: IsoDateTime
  readonly updatedAt: IsoDateTime
}
