import type { ClientMutationId, NoteId, VersionId } from '@/domain/ids'
import type { SoapContent } from '@/domain/models/soap'
import { soapContentEquals } from '@/features/note-detail/editor/soap-editor.reducer'
import { isApiClientError, isNetworkApiError } from '@/services/api/api-errors'
import { isVersionConflictApiError } from '@/services/api/create-version-api'

import type { AutosaveCoordinatorDeps, AutosaveStatus, SaveIntent } from './autosave.types'

type QueuedDraft = {
  readonly noteId: NoteId
  readonly content: SoapContent
}

function cloneContent(content: SoapContent): SoapContent {
  return Object.freeze({
    subjective: content.subjective,
    objective: content.objective,
    assessment: content.assessment,
    plan: content.plan,
  })
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  )
}

/**
 * Note-scoped save serializer: one in-flight request, one coalesced follow-up.
 * Framework-independent.
 */
export class AutosaveCoordinator {
  readonly #deps: AutosaveCoordinatorDeps
  #status: AutosaveStatus = { kind: 'CLEAN' }
  #inFlight: SaveIntent | null = null
  #queued: QueuedDraft | null = null
  #failedIntent: SaveIntent | null = null
  #ackedBaseVersionId: VersionId | null = null
  #lastSavedContent: SoapContent | null = null
  #abortController: AbortController | null = null
  #disposed = false
  #listeners = new Set<() => void>()
  #generation = 0

  constructor(deps: AutosaveCoordinatorDeps) {
    this.#deps = deps
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  getSnapshot(): AutosaveStatus {
    return this.#status
  }

  getFailedIntent(): SaveIntent | null {
    return this.#failedIntent
  }

  /** True when a save is outstanding and navigation should stay guarded. */
  hasUnackedWork(): boolean {
    if (this.#disposed) {
      return false
    }
    // IndexedDB-persisted offline queue is locally durable — do not block navigation.
    if (
      this.#status.kind === 'QUEUED_OFFLINE' ||
      this.#status.kind === 'REPLAYING' ||
      this.#status.kind === 'SYNC_FAILED'
    ) {
      return this.#queued !== null || this.#inFlight !== null
    }
    return (
      this.#inFlight !== null ||
      this.#queued !== null ||
      this.#failedIntent !== null ||
      this.#status.kind === 'DEBOUNCING' ||
      this.#status.kind === 'CONFLICT' ||
      this.#status.kind === 'BLOCKED_CONFLICT'
    )
  }

  setDebouncing(): void {
    if (
      this.#disposed ||
      this.#status.kind === 'CONFLICT' ||
      this.#status.kind === 'BLOCKED_CONFLICT' ||
      this.#status.kind === 'QUEUED_OFFLINE' ||
      this.#status.kind === 'REPLAYING' ||
      this.#status.kind === 'SYNC_FAILED'
    ) {
      return
    }
    if (this.#inFlight) {
      this.#setStatus({
        kind: 'QUEUED',
        inFlightMutationId: this.#inFlight.clientMutationId,
      })
      return
    }
    this.#setStatus({ kind: 'DEBOUNCING' })
  }

  enqueueLatest(input: {
    readonly noteId: NoteId
    readonly baseVersionId: VersionId
    readonly content: SoapContent
  }): void {
    if (
      this.#disposed ||
      this.#status.kind === 'CONFLICT' ||
      this.#status.kind === 'BLOCKED_CONFLICT'
    ) {
      return
    }

    const content = cloneContent(input.content)

    // Retryable ERROR: never start a new mutation id automatically.
    // Coalesce newer drafts into the single follow-up slot for after a successful retry.
    if (this.#status.kind === 'ERROR') {
      if (this.#failedIntent) {
        this.#queued = { noteId: input.noteId, content }
      }
      return
    }

    // SYNC_FAILED / offline-queued: coalesce newer content into IndexedDB (new mutation ID).
    if (
      this.#status.kind === 'SYNC_FAILED' ||
      this.#status.kind === 'QUEUED_OFFLINE' ||
      this.#status.kind === 'REPLAYING'
    ) {
      if (!this.#deps.persistOfflineWrite) {
        this.#queued = { noteId: input.noteId, content }
        return
      }
      const intent: SaveIntent = {
        noteId: input.noteId,
        baseVersionId: this.#ackedBaseVersionId ?? input.baseVersionId,
        content,
        clientMutationId: this.#deps.nextMutationId(),
      }
      void this.#persistOffline(intent)
      return
    }

    if (
      this.#lastSavedContent &&
      soapContentEquals(content, this.#lastSavedContent) &&
      !this.#inFlight
    ) {
      this.#queued = null
      this.#setStatus({ kind: 'CLEAN' })
      return
    }

    if (this.#ackedBaseVersionId === null) {
      this.#ackedBaseVersionId = input.baseVersionId
    }

    if (this.#inFlight) {
      this.#queued = { noteId: input.noteId, content }
      this.#setStatus({
        kind: 'QUEUED',
        inFlightMutationId: this.#inFlight.clientMutationId,
      })
      return
    }

    const intent: SaveIntent = {
      noteId: input.noteId,
      baseVersionId: this.#ackedBaseVersionId ?? input.baseVersionId,
      content,
      clientMutationId: this.#deps.nextMutationId(),
    }
    void this.#start(intent)
  }

  retry(): void {
    if (this.#disposed || this.#status.kind !== 'ERROR' || !this.#status.retryable) {
      return
    }
    if (!this.#failedIntent || this.#inFlight) {
      return
    }
    const intent = this.#failedIntent
    this.#failedIntent = null
    void this.#start(intent)
  }

  markClean(): void {
    if (
      this.#disposed ||
      this.#status.kind === 'CONFLICT' ||
      this.#status.kind === 'BLOCKED_CONFLICT' ||
      this.#status.kind === 'ERROR' ||
      this.#status.kind === 'SYNC_FAILED' ||
      this.#status.kind === 'QUEUED_OFFLINE' ||
      this.#status.kind === 'REPLAYING'
    ) {
      return
    }
    if (this.#inFlight) {
      return
    }
    this.#queued = null
    this.#failedIntent = null
    // Keep SAVED visible after a successful acknowledgment until the next edit.
    if (this.#status.kind === 'SAVED') {
      return
    }
    this.#setStatus({ kind: 'CLEAN' })
  }

  /**
   * Clears a coalesced follow-up without aborting an in-flight request.
   * Used when edit mode ends or access is revoked before a queued save starts.
   */
  cancelPending(): void {
    if (
      this.#disposed ||
      this.#status.kind === 'CONFLICT' ||
      this.#status.kind === 'BLOCKED_CONFLICT'
    ) {
      return
    }
    this.#queued = null
    if (this.#inFlight) {
      this.#setStatus({
        kind: 'SAVING',
        mutationId: this.#inFlight.clientMutationId,
      })
      return
    }
    if (this.#failedIntent && this.#status.kind === 'ERROR') {
      return
    }
    if (
      this.#status.kind === 'QUEUED_OFFLINE' ||
      this.#status.kind === 'REPLAYING' ||
      this.#status.kind === 'SYNC_FAILED'
    ) {
      return
    }
    this.#setStatus({ kind: 'CLEAN' })
  }

  /** External: replay began for a previously offline-queued mutation. */
  markReplaying(mutationId: ClientMutationId): void {
    if (this.#disposed) {
      return
    }
    this.#setStatus({ kind: 'REPLAYING', mutationId })
  }

  /** External: offline replay exhausted retries. */
  markSyncFailed(mutationId: ClientMutationId, message: string): void {
    if (this.#disposed) {
      return
    }
    this.#setStatus({ kind: 'SYNC_FAILED', mutationId, message })
  }

  /** External: offline replay succeeded for this note — advance base like an online save ACK. */
  applyReplaySuccess(input: {
    readonly versionId: VersionId
    readonly content: SoapContent
    readonly mutationId: ClientMutationId
  }): void {
    if (this.#disposed) {
      return
    }
    this.#queued = null
    this.#failedIntent = null
    this.#inFlight = null
    this.#abortController = null
    this.#ackedBaseVersionId = input.versionId
    this.#lastSavedContent = cloneContent(input.content)
    this.#setStatus({ kind: 'SAVED', versionId: input.versionId })
  }

  /**
   * Exit CONFLICT / BLOCKED_CONFLICT after a successful resolved save.
   * Advances the coordinator base so later autosave continues from the new head.
   */
  clearConflictResolved(input: {
    readonly versionId: VersionId
    readonly content: SoapContent
  }): void {
    if (
      this.#disposed ||
      (this.#status.kind !== 'CONFLICT' && this.#status.kind !== 'BLOCKED_CONFLICT')
    ) {
      return
    }
    this.#queued = null
    this.#failedIntent = null
    this.#inFlight = null
    this.#abortController = null
    this.#ackedBaseVersionId = input.versionId
    this.#lastSavedContent = cloneContent(input.content)
    this.#setStatus({ kind: 'SAVED', versionId: input.versionId })
  }

  /**
   * Replace the conflict payload when a resolution save itself conflicts (409).
   */
  replaceConflict(conflict: import('@/domain/schemas/conflict').VersionConflictResponseDto): void {
    if (
      this.#disposed ||
      (this.#status.kind !== 'CONFLICT' && this.#status.kind !== 'BLOCKED_CONFLICT')
    ) {
      return
    }
    this.#queued = null
    this.#failedIntent = null
    this.#setStatus({ kind: 'CONFLICT', conflict })
  }

  /**
   * Restore autosave status from a persisted queue entry after reload.
   */
  restoreFromQueuedWrite(input: {
    readonly queueId: string
    readonly mutationId: ClientMutationId
    readonly status: 'QUEUED' | 'REPLAYING' | 'FAILED' | 'BLOCKED_CONFLICT'
    readonly conflict?: import('@/domain/schemas/conflict').VersionConflictResponseDto | null
    readonly lastErrorCode?: string | null
  }): void {
    if (this.#disposed) {
      return
    }
    switch (input.status) {
      case 'QUEUED':
        this.#setStatus({
          kind: 'QUEUED_OFFLINE',
          mutationId: input.mutationId,
          queueId: input.queueId,
        })
        return
      case 'REPLAYING':
        this.#setStatus({ kind: 'REPLAYING', mutationId: input.mutationId })
        return
      case 'FAILED':
        this.#setStatus({
          kind: 'SYNC_FAILED',
          mutationId: input.mutationId,
          message: input.lastErrorCode
            ? `Sync failed (${input.lastErrorCode}).`
            : 'Some changes could not be synchronized.',
        })
        return
      case 'BLOCKED_CONFLICT':
        if (input.conflict) {
          this.#setStatus({
            kind: 'BLOCKED_CONFLICT',
            mutationId: input.mutationId,
            conflict: input.conflict,
          })
        }
        return
      default: {
        const _exhaustive: never = input.status
        return _exhaustive
      }
    }
  }

  dispose(options: { readonly abortInFlight?: boolean } = {}): void {
    if (this.#disposed) {
      return
    }
    this.#disposed = true
    this.#queued = null
    this.#failedIntent = null
    if (options.abortInFlight !== false && this.#abortController) {
      this.#abortController.abort()
    }
    this.#abortController = null
    this.#inFlight = null
    this.#listeners.clear()
  }

  #setStatus(status: AutosaveStatus): void {
    this.#status = status
    for (const listener of this.#listeners) {
      listener()
    }
  }

  async #persistOffline(intent: SaveIntent): Promise<void> {
    if (!this.#deps.persistOfflineWrite) {
      return
    }
    try {
      const persisted = await this.#deps.persistOfflineWrite(intent)
      if (this.#disposed) {
        return
      }
      this.#failedIntent = null
      this.#setStatus({
        kind: 'QUEUED_OFFLINE',
        mutationId: persisted.clientMutationId,
        queueId: persisted.queueId,
      })
    } catch {
      if (this.#disposed) {
        return
      }
      this.#failedIntent = intent
      this.#setStatus({
        kind: 'ERROR',
        message: 'Could not save offline.',
        retryable: true,
        mutationId: intent.clientMutationId,
      })
    }
  }

  async #start(intent: SaveIntent): Promise<void> {
    if (this.#disposed) {
      return
    }

    if (this.#deps.isOffline?.() && this.#deps.persistOfflineWrite) {
      this.#inFlight = null
      this.#abortController = null
      await this.#persistOffline(intent)
      return
    }

    const generation = ++this.#generation
    const controller = new AbortController()
    this.#abortController = controller
    this.#inFlight = intent
    this.#setStatus({ kind: 'SAVING', mutationId: intent.clientMutationId })

    try {
      const result = await this.#deps.transport.save(intent, controller.signal)
      if (this.#disposed || generation !== this.#generation) {
        return
      }
      this.#inFlight = null
      this.#abortController = null
      this.#ackedBaseVersionId = result.versionId
      this.#lastSavedContent = cloneContent(result.savedContent)
      this.#failedIntent = null

      this.#deps.onSuccess({
        intent,
        versionId: result.versionId,
        revision: result.revision,
        parentVersionId: result.parentVersionId,
        savedContent: result.savedContent,
      })

      const queued = this.#queued
      this.#queued = null
      if (queued && !soapContentEquals(queued.content, result.savedContent)) {
        const followUp: SaveIntent = {
          noteId: queued.noteId,
          baseVersionId: result.versionId,
          content: queued.content,
          clientMutationId: this.#deps.nextMutationId(),
        }
        void this.#start(followUp)
        return
      }

      this.#setStatus({ kind: 'SAVED', versionId: result.versionId })
    } catch (error) {
      if (this.#disposed || generation !== this.#generation) {
        return
      }
      this.#inFlight = null
      this.#abortController = null

      if (isAbortError(error)) {
        // Intentional abort (dispose/navigation). Never surface as a save failure.
        if (!this.#disposed && this.#generation === generation) {
          this.#setStatus({ kind: 'CLEAN' })
        }
        return
      }

      if (isVersionConflictApiError(error)) {
        this.#queued = null
        this.#failedIntent = null
        this.#setStatus({ kind: 'CONFLICT', conflict: error.conflict })
        return
      }

      const isNetwork = isNetworkApiError(error)
      const isServer = isApiClientError(error) && error.status >= 500

      if ((isNetwork || isServer) && this.#deps.persistOfflineWrite) {
        try {
          const persisted = await this.#deps.persistOfflineWrite(intent)
          this.#failedIntent = null
          this.#setStatus({
            kind: 'QUEUED_OFFLINE',
            mutationId: persisted.clientMutationId,
            queueId: persisted.queueId,
          })
          // Coalesce any newer draft that arrived during the failed request.
          const queued = this.#queued
          this.#queued = null
          if (queued && !soapContentEquals(queued.content, intent.content)) {
            const followUp: SaveIntent = {
              noteId: queued.noteId,
              baseVersionId: intent.baseVersionId,
              content: queued.content,
              clientMutationId: this.#deps.nextMutationId(),
            }
            try {
              const followPersisted = await this.#deps.persistOfflineWrite(followUp)
              this.#setStatus({
                kind: 'QUEUED_OFFLINE',
                mutationId: followPersisted.clientMutationId,
                queueId: followPersisted.queueId,
              })
            } catch {
              // Keep the first offline entry if follow-up persist fails.
            }
          }
          return
        } catch {
          // Fall through to ERROR if IndexedDB persistence fails.
        }
      }

      const retryable = isNetwork || isServer
      const message = error instanceof Error ? error.message : 'Save failed.'
      this.#failedIntent = intent
      this.#setStatus({
        kind: 'ERROR',
        message,
        retryable,
        mutationId: intent.clientMutationId,
      })
    }
  }
}

export function createAutosaveCoordinator(deps: AutosaveCoordinatorDeps): AutosaveCoordinator {
  return new AutosaveCoordinator(deps)
}
