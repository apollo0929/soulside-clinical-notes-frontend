import { cloneSoapContent, type SoapContent } from '@/domain/models/soap'
import type {
  QueuedCreateVersionWrite,
  QueuedWriteInsertInput,
  QueuedWriteStatus,
} from '@/services/offline/offline.types'
import { getOfflineDatabase, type SoulsideOfflineDatabase } from '@/services/offline/offline-db'

export class QueuedWriteConflictError extends Error {
  readonly code = 'QUEUE_FINGERPRINT_MISMATCH' as const

  constructor(message: string) {
    super(message)
    this.name = 'QueuedWriteConflictError'
  }
}

function cloneWrite(entry: QueuedCreateVersionWrite): QueuedCreateVersionWrite {
  // Return a deep clone so callers cannot mutate IndexedDB-backed records.
  // Intentionally not frozen so tests can prove mutations do not leak to storage.
  return {
    ...entry,
    content: cloneSoapContent(entry.content),
    conflictPayload: entry.conflictPayload
      ? (JSON.parse(JSON.stringify(entry.conflictPayload)) as NonNullable<
          QueuedCreateVersionWrite['conflictPayload']
        >)
      : null,
  }
}

function newQueueId(): string {
  const value =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
  return `qw_${value}`
}

/**
 * Dexie-backed repository for offline create-version writes.
 * UI must not touch Dexie tables directly — go through this API.
 */
export class QueuedWriteRepository {
  readonly #db: SoulsideOfflineDatabase

  constructor(db: SoulsideOfflineDatabase = getOfflineDatabase()) {
    this.#db = db
  }

  async listAll(): Promise<readonly QueuedCreateVersionWrite[]> {
    const rows = await this.#db.queuedWrites.orderBy('createdAt').toArray()
    return rows.map(cloneWrite)
  }

  async listByNote(
    noteId: QueuedCreateVersionWrite['noteId'],
  ): Promise<readonly QueuedCreateVersionWrite[]> {
    const rows = await this.#db.queuedWrites.where('noteId').equals(noteId).sortBy('createdAt')
    return rows.map(cloneWrite)
  }

  async getById(id: string): Promise<QueuedCreateVersionWrite | null> {
    const row = await this.#db.queuedWrites.get(id)
    return row ? cloneWrite(row) : null
  }

  async getByClientMutationId(
    clientMutationId: QueuedCreateVersionWrite['clientMutationId'],
  ): Promise<QueuedCreateVersionWrite | null> {
    const row = await this.#db.queuedWrites
      .where('clientMutationId')
      .equals(clientMutationId)
      .first()
    return row ? cloneWrite(row) : null
  }

  async count(): Promise<number> {
    return this.#db.queuedWrites.count()
  }

  async countByStatus(status: QueuedWriteStatus): Promise<number> {
    return this.#db.queuedWrites.where('status').equals(status).count()
  }

  /**
   * Insert or return existing entry for the same clientMutationId + fingerprint.
   * Same mutation ID with a different fingerprint is rejected.
   */
  async insertOrGet(input: QueuedWriteInsertInput): Promise<QueuedCreateVersionWrite> {
    const existing = await this.getByClientMutationId(input.clientMutationId)
    if (existing) {
      if (existing.fingerprint !== input.fingerprint) {
        throw new QueuedWriteConflictError(
          'clientMutationId was already queued with a different request fingerprint.',
        )
      }
      return existing
    }

    const entry: QueuedCreateVersionWrite = Object.freeze({
      id: newQueueId(),
      operation: 'CREATE_NOTE_VERSION',
      noteId: input.noteId,
      baseVersionId: input.baseVersionId,
      content: cloneSoapContent(input.content),
      clientMutationId: input.clientMutationId,
      fingerprint: input.fingerprint,
      createdAt: input.createdAt,
      status: 'QUEUED',
      retryCount: 0,
      lastErrorCode: null,
      predecessorQueueId: input.predecessorQueueId ?? null,
      conflictPayload: null,
    })

    await this.#db.queuedWrites.put(entry)
    return cloneWrite(entry)
  }

  /**
   * Coalesce policy (safer recommended rule):
   * - At most one unsent QUEUED entry per note with no predecessor.
   * - Changed content → new clientMutationId; remove prior unsent entry atomically.
   * - If a REPLAYING entry exists, insert a follow-up QUEUED with predecessor link.
   */
  async coalesceUnsentForNote(input: {
    readonly noteId: QueuedCreateVersionWrite['noteId']
    readonly baseVersionId: QueuedCreateVersionWrite['baseVersionId']
    readonly content: SoapContent
    readonly clientMutationId: QueuedCreateVersionWrite['clientMutationId']
    readonly fingerprint: string
    readonly createdAt: QueuedCreateVersionWrite['createdAt']
  }): Promise<QueuedCreateVersionWrite> {
    return this.#db.transaction('rw', this.#db.queuedWrites, async () => {
      const rows = await this.#db.queuedWrites
        .where('noteId')
        .equals(input.noteId)
        .sortBy('createdAt')

      const replaying = rows.find((row) => row.status === 'REPLAYING') ?? null
      const blocked = rows.find((row) => row.status === 'BLOCKED_CONFLICT') ?? null
      if (blocked) {
        // Do not coalesce over a conflict-blocked entry.
        const entry: QueuedCreateVersionWrite = Object.freeze({
          id: newQueueId(),
          operation: 'CREATE_NOTE_VERSION',
          noteId: input.noteId,
          baseVersionId: input.baseVersionId,
          content: cloneSoapContent(input.content),
          clientMutationId: input.clientMutationId,
          fingerprint: input.fingerprint,
          createdAt: input.createdAt,
          status: 'QUEUED',
          retryCount: 0,
          lastErrorCode: null,
          predecessorQueueId: blocked.id,
          conflictPayload: null,
        })
        await this.#db.queuedWrites.put(entry)
        return cloneWrite(entry)
      }

      if (replaying) {
        // Keep at most one follow-up after the in-flight replay.
        const followUps = rows.filter(
          (row) => row.status === 'QUEUED' && row.predecessorQueueId === replaying.id,
        )
        for (const followUp of followUps) {
          await this.#db.queuedWrites.delete(followUp.id)
        }
        const entry: QueuedCreateVersionWrite = Object.freeze({
          id: newQueueId(),
          operation: 'CREATE_NOTE_VERSION',
          noteId: input.noteId,
          baseVersionId: input.baseVersionId,
          content: cloneSoapContent(input.content),
          clientMutationId: input.clientMutationId,
          fingerprint: input.fingerprint,
          createdAt: input.createdAt,
          status: 'QUEUED',
          retryCount: 0,
          lastErrorCode: null,
          predecessorQueueId: replaying.id,
          conflictPayload: null,
        })
        await this.#db.queuedWrites.put(entry)
        return cloneWrite(entry)
      }

      const unsent = rows.filter(
        (row) => row.status === 'QUEUED' && row.predecessorQueueId === null,
      )
      if (unsent.length === 1 && unsent[0]!.fingerprint === input.fingerprint) {
        // Same semantic request — preserve existing clientMutationId (reload-safe).
        return cloneWrite(unsent[0]!)
      }
      for (const prior of unsent) {
        await this.#db.queuedWrites.delete(prior.id)
      }

      const entry: QueuedCreateVersionWrite = Object.freeze({
        id: newQueueId(),
        operation: 'CREATE_NOTE_VERSION',
        noteId: input.noteId,
        baseVersionId: input.baseVersionId,
        content: cloneSoapContent(input.content),
        clientMutationId: input.clientMutationId,
        fingerprint: input.fingerprint,
        createdAt: input.createdAt,
        status: 'QUEUED',
        retryCount: 0,
        lastErrorCode: null,
        predecessorQueueId: null,
        conflictPayload: null,
      })
      await this.#db.queuedWrites.put(entry)
      return cloneWrite(entry)
    })
  }

  async markReplaying(id: string): Promise<QueuedCreateVersionWrite | null> {
    return this.#db.transaction('rw', this.#db.queuedWrites, async () => {
      const row = await this.#db.queuedWrites.get(id)
      if (!row) {
        return null
      }
      const next = Object.freeze({ ...row, status: 'REPLAYING' as const, lastErrorCode: null })
      await this.#db.queuedWrites.put(next)
      return cloneWrite(next)
    })
  }

  async markBlockedConflict(
    id: string,
    errorCode: string,
    conflictPayload: NonNullable<QueuedCreateVersionWrite['conflictPayload']>,
  ): Promise<QueuedCreateVersionWrite | null> {
    return this.#db.transaction('rw', this.#db.queuedWrites, async () => {
      const row = await this.#db.queuedWrites.get(id)
      if (!row) {
        return null
      }
      const next = Object.freeze({
        ...row,
        status: 'BLOCKED_CONFLICT' as const,
        lastErrorCode: errorCode,
        conflictPayload,
      })
      await this.#db.queuedWrites.put(next)
      return cloneWrite(next)
    })
  }

  async markFailed(
    id: string,
    input: { readonly errorCode: string; readonly retryCount: number },
  ): Promise<QueuedCreateVersionWrite | null> {
    return this.#db.transaction('rw', this.#db.queuedWrites, async () => {
      const row = await this.#db.queuedWrites.get(id)
      if (!row) {
        return null
      }
      const next = Object.freeze({
        ...row,
        status: 'FAILED' as const,
        lastErrorCode: input.errorCode,
        retryCount: input.retryCount,
      })
      await this.#db.queuedWrites.put(next)
      return cloneWrite(next)
    })
  }

  async markQueuedForRetry(
    id: string,
    input: { readonly errorCode: string; readonly retryCount: number },
  ): Promise<QueuedCreateVersionWrite | null> {
    return this.#db.transaction('rw', this.#db.queuedWrites, async () => {
      const row = await this.#db.queuedWrites.get(id)
      if (!row) {
        return null
      }
      const next = Object.freeze({
        ...row,
        status: 'QUEUED' as const,
        lastErrorCode: input.errorCode,
        retryCount: input.retryCount,
      })
      await this.#db.queuedWrites.put(next)
      return cloneWrite(next)
    })
  }

  async advanceFollowUpBase(
    predecessorId: string,
    nextBaseVersionId: QueuedCreateVersionWrite['baseVersionId'],
  ): Promise<void> {
    await this.#db.transaction('rw', this.#db.queuedWrites, async () => {
      const rows = await this.#db.queuedWrites.toArray()
      for (const followUp of rows) {
        if (followUp.predecessorQueueId !== predecessorId) {
          continue
        }
        await this.#db.queuedWrites.put(
          Object.freeze({
            ...followUp,
            baseVersionId: nextBaseVersionId,
            predecessorQueueId: null,
          }),
        )
      }
    })
  }

  async remove(id: string): Promise<void> {
    await this.#db.queuedWrites.delete(id)
  }

  /**
   * User discard: drop all local queue rows for the note (including follow-ups /
   * failed / blocked), so discarded content cannot replay later.
   */
  async removeUnsentForNote(noteId: QueuedCreateVersionWrite['noteId']): Promise<void> {
    await this.#db.transaction('rw', this.#db.queuedWrites, async () => {
      const rows = await this.#db.queuedWrites.where('noteId').equals(noteId).toArray()
      for (const row of rows) {
        await this.#db.queuedWrites.delete(row.id)
      }
    })
  }

  /**
   * Crash/reload recovery: interrupted REPLAYING rows become QUEUED again so
   * idempotent replay can resume (same clientMutationId).
   */
  async requeueInterruptedReplaying(): Promise<number> {
    return this.#db.transaction('rw', this.#db.queuedWrites, async () => {
      const rows = await this.#db.queuedWrites.where('status').equals('REPLAYING').toArray()
      for (const row of rows) {
        await this.#db.queuedWrites.put(
          Object.freeze({
            ...row,
            status: 'QUEUED' as const,
            lastErrorCode: row.lastErrorCode ?? 'REPLAY_INTERRUPTED',
          }),
        )
      }
      return rows.length
    })
  }

  async clearAll(): Promise<void> {
    await this.#db.queuedWrites.clear()
  }
}

export function createQueuedWriteRepository(db?: SoulsideOfflineDatabase): QueuedWriteRepository {
  return new QueuedWriteRepository(db)
}
