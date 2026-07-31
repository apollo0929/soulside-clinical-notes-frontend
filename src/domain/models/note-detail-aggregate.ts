import type { Note } from '@/domain/models/note'
import type { NoteVersion, NoteVersionRef } from '@/domain/models/note-version'
import type { Patient } from '@/domain/models/patient'
import type { ReviewEvent } from '@/domain/models/review-event'
import type { User } from '@/domain/models/user'

/**
 * Composed result of mapping a note-detail API response into domain objects.
 */
export type NoteDetailAggregate = {
  readonly note: Note
  readonly patient: Patient
  readonly assignedReviewer: User | null
  readonly currentVersion: NoteVersion
  readonly versions: readonly NoteVersionRef[]
  readonly reviewEvents: readonly ReviewEvent[]
}
