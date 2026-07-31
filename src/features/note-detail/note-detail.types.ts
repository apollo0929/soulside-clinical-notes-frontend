import type { IsoDateTime } from '@/domain/datetime'
import type { NoteId, VersionId } from '@/domain/ids'
import type { NoteDetailAggregate } from '@/domain/models/note-detail-aggregate'
import type { NoteVersion, NoteVersionRef } from '@/domain/models/note-version'
import type { ReviewEvent } from '@/domain/models/review-event'
import type { SoapContent } from '@/domain/models/soap'
import type { NoteLifecycleAction } from '@/domain/note-lifecycle'
import type { WordDiffSegment } from '@/shared/diff'

export const USER_LIFECYCLE_ACTIONS = [
  'REGENERATE',
  'START_REVIEW',
  'RETURN_TO_QUEUE',
  'APPROVE',
  'REJECT',
  'RESUBMIT',
  'AMEND',
] as const satisfies readonly NoteLifecycleAction[]

export type UserLifecycleAction = (typeof USER_LIFECYCLE_ACTIONS)[number]

export type LifecycleActionDescriptor = {
  readonly action: UserLifecycleAction
  readonly label: string
  readonly allowed: boolean
  readonly denialCode: string | null
  readonly denialReason: string | null
}

export type VersionComparisonState = {
  readonly baseVersionId: VersionId | null
  readonly compareVersionId: VersionId | null
}

export type VersionComparisonAction =
  | {
      readonly type: 'RESET'
      readonly currentVersionId: VersionId
      readonly parentVersionId: VersionId | null
    }
  | { readonly type: 'CLEAR' }
  | { readonly type: 'SET_BASE'; readonly versionId: VersionId }
  | { readonly type: 'SET_COMPARE'; readonly versionId: VersionId }

export type SoapSectionKey = 'subjective' | 'objective' | 'assessment' | 'plan'

export type SoapSectionDiff = {
  readonly key: SoapSectionKey
  readonly label: string
  readonly segments: readonly WordDiffSegment[]
}

export type NoteDetailViewModel = {
  readonly aggregate: NoteDetailAggregate
  readonly sortedVersions: readonly NoteVersionRef[]
  readonly approvedAt: IsoDateTime | null
  readonly timelineNewestFirst: readonly ReviewEvent[]
}

export type ResolvedVersionContent = {
  readonly versionId: VersionId
  readonly content: SoapContent
  readonly revision: number
  readonly source: 'detail-current' | 'version-query'
}

export type NotesListNavState = {
  readonly fromList: string
}

export function isNotesListNavState(value: unknown): value is NotesListNavState {
  if (value === null || typeof value !== 'object') {
    return false
  }
  const record = value as { fromList?: unknown }
  return typeof record.fromList === 'string'
}

/**
 * Safe back-link resolver. Only accepts the notes list path with optional query.
 * Rejects protocol-relative URLs, absolute URLs, and detail paths like /notes/:id.
 */
export function resolveNotesBackHref(locationState: unknown): string {
  if (!isNotesListNavState(locationState)) {
    return '/notes'
  }
  const candidate = locationState.fromList
  if (
    candidate.includes('://') ||
    candidate.startsWith('//') ||
    candidate.includes('\\') ||
    candidate.includes('..')
  ) {
    return '/notes'
  }
  if (candidate === '/notes' || candidate.startsWith('/notes?')) {
    return candidate
  }
  return '/notes'
}

export type { NoteId, NoteVersion, SoapContent, VersionId }
