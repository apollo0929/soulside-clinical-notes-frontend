import type { ClientMutationId, NoteId, VersionId } from '@/domain/ids'
import type { SoapContent } from '@/domain/models/soap'
import type { VersionConflictResponseDto } from '@/domain/schemas/conflict'

export const AUTOSAVE_DEBOUNCE_MS = 700

export type SaveIntent = {
  readonly noteId: NoteId
  readonly baseVersionId: VersionId
  readonly content: SoapContent
  readonly clientMutationId: ClientMutationId
}

export type AutosaveStatus =
  | { readonly kind: 'CLEAN' }
  | { readonly kind: 'DEBOUNCING' }
  | { readonly kind: 'SAVING'; readonly mutationId: ClientMutationId }
  | { readonly kind: 'QUEUED'; readonly inFlightMutationId: ClientMutationId }
  | { readonly kind: 'SAVED'; readonly versionId: VersionId }
  | {
      readonly kind: 'ERROR'
      readonly message: string
      readonly retryable: boolean
      readonly mutationId: ClientMutationId
    }
  | {
      readonly kind: 'CONFLICT'
      readonly conflict: VersionConflictResponseDto
    }

export type SaveSuccessEvent = {
  readonly intent: SaveIntent
  readonly versionId: VersionId
  readonly revision: number
  readonly parentVersionId: VersionId
  readonly savedContent: SoapContent
}

export type CreateVersionTransport = {
  save(
    intent: SaveIntent,
    signal: AbortSignal,
  ): Promise<{
    readonly versionId: VersionId
    readonly revision: number
    readonly parentVersionId: VersionId
    readonly savedContent: SoapContent
  }>
}

export type AutosaveCoordinatorDeps = {
  readonly transport: CreateVersionTransport
  readonly nextMutationId: () => ClientMutationId
  readonly onSuccess: (event: SaveSuccessEvent) => void
}
