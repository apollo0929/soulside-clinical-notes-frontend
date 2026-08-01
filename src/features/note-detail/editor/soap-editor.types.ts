import type { NoteId, VersionId } from '@/domain/ids'
import type { SoapContent, SoapSectionKey } from '@/domain/models/soap'

export type { SoapSectionKey } from '@/domain/models/soap'
export { SOAP_SECTION_KEYS } from '@/domain/models/soap'

export type SoapEditorState = {
  readonly noteId: NoteId
  readonly baseVersionId: VersionId
  readonly initialContent: SoapContent
  readonly draftContent: SoapContent
  readonly dirtySections: ReadonlySet<SoapSectionKey>
}

export type SoapEditorAction =
  | {
      readonly type: 'INITIALIZE'
      readonly noteId: NoteId
      readonly baseVersionId: VersionId
      readonly content: SoapContent
    }
  | {
      readonly type: 'UPDATE_SECTION'
      readonly section: SoapSectionKey
      readonly value: string
    }
  | {
      readonly type: 'RESET_SECTION'
      readonly section: SoapSectionKey
    }
  | { readonly type: 'RESET_ALL' }
  | {
      readonly type: 'ACCEPT_SAVED_VERSION'
      readonly baseVersionId: VersionId
      readonly content: SoapContent
    }
  | {
      readonly type: 'ACKNOWLEDGE_SAVED_VERSION'
      /** Newly created version id from the server. */
      readonly baseVersionId: VersionId
      /** The baseVersionId the save request used; rejects stale acks. */
      readonly expectedBaseVersionId: VersionId
      readonly savedContent: SoapContent
    }
  | {
      /** Restore a draft from the IndexedDB offline queue after reload. */
      readonly type: 'RESTORE_OFFLINE_DRAFT'
      readonly baseVersionId: VersionId
      readonly draftContent: SoapContent
    }

export type EditorAccessDecision =
  | { readonly editable: true }
  | {
      readonly editable: false
      readonly reasonCode: string
      readonly reason: string
    }

export const SOAP_SECTION_LABELS: Readonly<Record<SoapSectionKey, string>> = Object.freeze({
  subjective: 'Subjective',
  objective: 'Objective',
  assessment: 'Assessment',
  plan: 'Plan',
})
