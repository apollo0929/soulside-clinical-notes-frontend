import type { NoteId, VersionId } from '@/domain/ids'
import type { SoapContent, SoapSectionKey } from '@/domain/models/soap'

export const SECTION_CONFLICT_KINDS = [
  'UNCHANGED',
  'LOCAL_ONLY',
  'SERVER_ONLY',
  'SAME_CHANGE',
  'CONFLICT',
] as const

export type SectionConflictKind = (typeof SECTION_CONFLICT_KINDS)[number]

export const SECTION_RESOLUTION_CHOICES = ['KEEP_LOCAL', 'USE_SERVER', 'MANUAL'] as const

export type SectionResolutionChoice = (typeof SECTION_RESOLUTION_CHOICES)[number]

export type AutomaticSectionResolution = {
  readonly kind: 'AUTOMATIC'
  readonly conflictKind: Exclude<SectionConflictKind, 'CONFLICT'>
  readonly value: string
}

export type ExplicitSectionResolution =
  | {
      readonly kind: 'EXPLICIT'
      readonly choice: 'KEEP_LOCAL' | 'USE_SERVER'
      readonly value: string
    }
  | {
      readonly kind: 'EXPLICIT'
      readonly choice: 'MANUAL'
      readonly value: string
    }

export type UnresolvedSectionResolution = {
  readonly kind: 'UNRESOLVED'
}

export type SectionResolutionState =
  AutomaticSectionResolution | ExplicitSectionResolution | UnresolvedSectionResolution

export type SectionConflictState = {
  readonly section: SoapSectionKey
  readonly conflictKind: SectionConflictKind
  readonly ancestor: string
  readonly local: string
  readonly server: string
  readonly resolution: SectionResolutionState
}

/**
 * Immutable snapshot of ancestor / local / server content after hydration.
 * Created only when both server versions have loaded successfully.
 */
export type ConflictResolutionSession = {
  readonly noteId: NoteId
  readonly localBaseVersionId: VersionId
  readonly serverHeadVersionId: VersionId
  readonly serverHeadRevision: number
  readonly commonAncestorVersionId: VersionId
  readonly commonAncestorRevision: number
  readonly ancestorContent: SoapContent
  readonly localContent: SoapContent
  readonly serverContent: SoapContent
  readonly sections: Readonly<Record<SoapSectionKey, SectionConflictState>>
}

export type ConflictResolutionState = {
  readonly session: ConflictResolutionSession
  readonly sections: Readonly<Record<SoapSectionKey, SectionResolutionState>>
}

export type ConflictResolutionAction =
  | { readonly type: 'CHOOSE_LOCAL'; readonly section: SoapSectionKey }
  | { readonly type: 'CHOOSE_SERVER'; readonly section: SoapSectionKey }
  | { readonly type: 'CHOOSE_MANUAL'; readonly section: SoapSectionKey }
  | {
      readonly type: 'UPDATE_MANUAL_VALUE'
      readonly section: SoapSectionKey
      readonly value: string
    }
  | { readonly type: 'RESET_SECTION'; readonly section: SoapSectionKey }
  | { readonly type: 'RESET_ALL' }
