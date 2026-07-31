import type { IsoDateTime } from '@/domain/datetime'
import type { NoteId, UserId, VersionId } from '@/domain/ids'
import type { SoapContent } from '@/domain/models/soap'
import type { UserRole } from '@/domain/roles'

/**
 * Immutable snapshot of note content. Every save creates a new version.
 * parentVersionId forms a DAG when amendments branch from an approved ancestor.
 */
export type NoteVersion = {
  readonly id: VersionId
  readonly noteId: NoteId
  readonly revisionNumber: number
  readonly parentVersionId: VersionId | null
  readonly content: SoapContent
  readonly authorId: UserId
  readonly authorRole: UserRole
  readonly createdAt: IsoDateTime
}

/**
 * Version metadata without SOAP content (history list / refs).
 */
export type NoteVersionRef = {
  readonly id: VersionId
  readonly noteId: NoteId
  readonly revisionNumber: number
  readonly parentVersionId: VersionId | null
  readonly authorId: UserId
  readonly authorRole: UserRole
  readonly createdAt: IsoDateTime
}
