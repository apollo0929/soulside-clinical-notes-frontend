import type { NoteId, VersionId } from '@/domain/ids'
import type { SoapContent } from '@/domain/models/soap'
import type { VersionConflictResponseDto } from '@/domain/schemas/conflict'
import { isApiClientError, isNetworkApiError } from '@/services/api/api-errors'
import { createNoteVersion, isVersionConflictApiError } from '@/services/api/create-version-api'
import type { ConnectivityService } from '@/services/offline/connectivity'
import {
  type QueuedCreateVersionWrite,
  REPLAY_BACKOFF_MS,
  REPLAY_CROSS_NOTE_CONCURRENCY,
  REPLAY_MAX_ATTEMPTS,
} from '@/services/offline/offline.types'
import type { QueuedWriteRepository } from '@/services/offline/queued-write.repository'

export type ReplayScheduler = {
  schedule(delayMs: number, work: () => void): () => void
}

export type ReplayTransportResult = {
  readonly versionId: VersionId
  readonly revision: number
  readonly parentVersionId: VersionId
  readonly savedContent: SoapContent
}

export type ReplayCoordinatorDeps = {
  readonly queue: QueuedWriteRepository
  readonly connectivity: ConnectivityService
  readonly concurrency?: number
  readonly scheduler?: ReplayScheduler
  readonly transport?: {
    save(input: {
      readonly noteId: NoteId
      readonly baseVersionId: VersionId
      readonly content: SoapContent
      readonly clientMutationId: QueuedCreateVersionWrite['clientMutationId']
    }): Promise<ReplayTransportResult>
  }
  readonly onConflict: (input: {
    readonly entry: QueuedCreateVersionWrite
    readonly conflict: VersionConflictResponseDto
  }) => void
  readonly onReplaySuccess: (input: {
    readonly entry: QueuedCreateVersionWrite
    readonly result: ReplayTransportResult
  }) => void
}

function defaultScheduler(): ReplayScheduler {
  return {
    schedule(delayMs, work) {
      const handle = globalThis.setTimeout(work, delayMs)
      return () => globalThis.clearTimeout(handle)
    },
  }
}

function backoffDelay(retryCount: number): number {
  const index = Math.min(retryCount, REPLAY_BACKOFF_MS.length - 1)
  return REPLAY_BACKOFF_MS[index]!
}

/**
 * Framework-independent offline replay coordinator.
 * Same-note writes never run concurrently; cross-note concurrency is bounded.
 */
export class ReplayCoordinator {
  readonly #deps: ReplayCoordinatorDeps
  readonly #concurrency: number
  readonly #scheduler: ReplayScheduler
  #running = false
  #disposed = false
  #activeNotes = new Set<NoteId>()
  #inFlight = 0
  #cancelTimers = new Set<() => void>()
  #unsubscribeOnline: (() => void) | null = null

  constructor(deps: ReplayCoordinatorDeps) {
    this.#deps = deps
    this.#concurrency = deps.concurrency ?? REPLAY_CROSS_NOTE_CONCURRENCY
    this.#scheduler = deps.scheduler ?? defaultScheduler()
  }

  start(): void {
    if (this.#disposed || this.#unsubscribeOnline) {
      return
    }
    this.#unsubscribeOnline = this.#deps.connectivity.subscribe((state) => {
      if (state.kind === 'RECONNECTING' || state.kind === 'ONLINE' || state.kind === 'DEGRADED') {
        void this.replayNow()
      }
    })
  }

  dispose(): void {
    this.#disposed = true
    this.#running = false
    this.#unsubscribeOnline?.()
    this.#unsubscribeOnline = null
    for (const cancel of this.#cancelTimers) {
      cancel()
    }
    this.#cancelTimers.clear()
    this.#activeNotes.clear()
  }

  async replayNow(): Promise<void> {
    if (this.#disposed || this.#running) {
      return
    }
    this.#running = true
    try {
      // Recover rows left REPLAYING after crash/dispose before selecting work.
      await this.#deps.queue.requeueInterruptedReplaying()
      await this.#pump()
    } finally {
      this.#running = false
    }
  }

  async #pump(): Promise<void> {
    while (!this.#disposed) {
      let entries: readonly QueuedCreateVersionWrite[]
      try {
        entries = await this.#deps.queue.listAll()
      } catch {
        return
      }
      if (this.#disposed) {
        return
      }
      const blockedNotes = new Set(
        entries.filter((entry) => entry.status === 'BLOCKED_CONFLICT').map((entry) => entry.noteId),
      )
      const queued = entries.filter(
        (entry) => entry.status === 'QUEUED' && !blockedNotes.has(entry.noteId),
      )
      const conflicts = entries.filter((entry) => entry.status === 'BLOCKED_CONFLICT').length
      const failed = entries.filter((entry) => entry.status === 'FAILED').length
      const pendingReplay = entries.filter(
        (entry) => entry.status === 'QUEUED' || entry.status === 'REPLAYING',
      ).length

      this.#deps.connectivity.setQueueSummary({
        queued: pendingReplay,
        conflicts,
        failed,
      })

      if (queued.length === 0 && this.#inFlight === 0) {
        if (conflicts > 0) {
          this.#deps.connectivity.markDegraded(
            `${conflicts} change(s) require conflict resolution.`,
          )
        } else if (failed > 0) {
          this.#deps.connectivity.markDegraded('Some changes could not be synchronized.')
        } else {
          const snap = this.#deps.connectivity.getSnapshot()
          if (snap.kind !== 'OFFLINE') {
            this.#deps.connectivity.markOnline()
          }
        }
        return
      }

      if (this.#deps.connectivity.getSnapshot().kind === 'OFFLINE') {
        return
      }

      this.#deps.connectivity.markReplaying(queued.length + this.#inFlight)

      const candidates = this.#selectCandidates(queued)
      if (candidates.length === 0) {
        if (this.#inFlight > 0) {
          await this.#wait(25)
          continue
        }
        return
      }

      await Promise.all(candidates.map((entry) => this.#replayOne(entry)))
    }
  }

  #selectCandidates(queued: readonly QueuedCreateVersionWrite[]): QueuedCreateVersionWrite[] {
    const byNote = new Map<NoteId, QueuedCreateVersionWrite[]>()
    for (const entry of queued) {
      const list = byNote.get(entry.noteId) ?? []
      list.push(entry)
      byNote.set(entry.noteId, list)
    }

    const selected: QueuedCreateVersionWrite[] = []
    for (const [noteId, list] of byNote) {
      if (this.#activeNotes.has(noteId)) {
        continue
      }
      // Blocked conflict for this note stops later same-note replay.
      // FAILED/QUEUED with predecessor still waiting is skipped.
      const next = list[0]
      if (!next) {
        continue
      }
      if (next.predecessorQueueId) {
        continue
      }
      selected.push(next)
      if (selected.length + this.#inFlight >= this.#concurrency) {
        break
      }
    }
    return selected
  }

  async #replayOne(entry: QueuedCreateVersionWrite): Promise<void> {
    if (this.#disposed) {
      return
    }
    this.#activeNotes.add(entry.noteId)
    this.#inFlight += 1
    try {
      if (this.#disposed) {
        return
      }
      await this.#deps.queue.markReplaying(entry.id)
      if (this.#disposed) {
        return
      }
      const transport = this.#deps.transport ?? {
        save: async (input) => {
          const result = await createNoteVersion({
            noteId: input.noteId,
            baseVersionId: input.baseVersionId,
            content: input.content,
            clientMutationId: input.clientMutationId,
          })
          return {
            versionId: result.version.id,
            revision: result.version.revision,
            parentVersionId: result.version.parentVersionId,
            savedContent: result.savedContent,
          }
        },
      }

      try {
        const result = await transport.save({
          noteId: entry.noteId,
          baseVersionId: entry.baseVersionId,
          content: entry.content,
          clientMutationId: entry.clientMutationId,
        })
        // Always advance/remove after server success — even if dispose raced —
        // so the queue cannot stick in REPLAYING with a server-applied mutation.
        await this.#deps.queue.advanceFollowUpBase(entry.id, result.versionId)
        await this.#deps.queue.remove(entry.id)
        if (!this.#disposed) {
          this.#deps.onReplaySuccess({ entry, result })
        }
      } catch (error) {
        if (this.#disposed) {
          return
        }
        if (isVersionConflictApiError(error)) {
          await this.#deps.queue.markBlockedConflict(entry.id, 'VERSION_CONFLICT', error.conflict)
          this.#deps.onConflict({ entry, conflict: error.conflict })
          return
        }

        const status = isApiClientError(error) ? error.status : null
        if (status === 403 || status === 400) {
          await this.#deps.queue.markFailed(entry.id, {
            errorCode: isApiClientError(error) ? error.code : 'CLIENT_ERROR',
            retryCount: entry.retryCount,
          })
          return
        }

        const retryable =
          isNetworkApiError(error) || (isApiClientError(error) && (status ?? 0) >= 500)
        const nextRetry = entry.retryCount + 1
        if (!retryable || nextRetry >= REPLAY_MAX_ATTEMPTS) {
          await this.#deps.queue.markFailed(entry.id, {
            errorCode: isApiClientError(error)
              ? error.code
              : isNetworkApiError(error)
                ? 'NETWORK'
                : 'UNKNOWN',
            retryCount: nextRetry,
          })
          return
        }

        await this.#deps.queue.markQueuedForRetry(entry.id, {
          errorCode: isApiClientError(error)
            ? error.code
            : isNetworkApiError(error)
              ? 'NETWORK'
              : 'UNKNOWN',
          retryCount: nextRetry,
        })
        await this.#wait(backoffDelay(entry.retryCount))
      }
    } catch {
      // Swallow storage errors during dispose/teardown.
    } finally {
      this.#inFlight -= 1
      this.#activeNotes.delete(entry.noteId)
    }
  }

  #wait(delayMs: number): Promise<void> {
    return new Promise((resolve) => {
      let cancel: (() => void) | null = null
      cancel = this.#scheduler.schedule(delayMs, () => {
        if (cancel) {
          this.#cancelTimers.delete(cancel)
        }
        resolve()
      })
      this.#cancelTimers.add(cancel)
    })
  }
}

export function createReplayCoordinator(deps: ReplayCoordinatorDeps): ReplayCoordinator {
  return new ReplayCoordinator(deps)
}
