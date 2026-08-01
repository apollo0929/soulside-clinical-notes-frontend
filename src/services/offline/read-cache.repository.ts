import type { IsoDateTime } from '@/domain/datetime'
import type { NoteId } from '@/domain/ids'
import type { CachedNoteDetailRecord, CachedNoteListRecord } from '@/services/offline/offline.types'
import { getOfflineDatabase, type SoulsideOfflineDatabase } from '@/services/offline/offline-db'

function deepCloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/**
 * Focused IndexedDB read cache for note detail and list pages.
 * Clinical content is stored in IndexedDB only — never localStorage.
 */
export class ReadCacheRepository {
  readonly #db: SoulsideOfflineDatabase

  constructor(db: SoulsideOfflineDatabase = getOfflineDatabase()) {
    this.#db = db
  }

  async putNoteDetail(input: {
    readonly noteId: NoteId
    readonly queryKey: string
    readonly payload: unknown
    readonly updatedAt: IsoDateTime
  }): Promise<void> {
    const record: CachedNoteDetailRecord = Object.freeze({
      noteId: input.noteId,
      queryKey: input.queryKey,
      payload: deepCloneJson(input.payload),
      updatedAt: input.updatedAt,
    })
    await this.#db.cachedNoteDetails.put(record)
  }

  async getNoteDetail(noteId: NoteId): Promise<CachedNoteDetailRecord | null> {
    const row = await this.#db.cachedNoteDetails.get(noteId)
    if (!row) {
      return null
    }
    return Object.freeze({
      ...row,
      payload: deepCloneJson(row.payload),
    })
  }

  async putNoteList(input: {
    readonly queryKey: string
    readonly payload: unknown
    readonly updatedAt: IsoDateTime
  }): Promise<void> {
    const record: CachedNoteListRecord = Object.freeze({
      queryKey: input.queryKey,
      payload: deepCloneJson(input.payload),
      updatedAt: input.updatedAt,
    })
    await this.#db.cachedNoteLists.put(record)
  }

  async getNoteList(queryKey: string): Promise<CachedNoteListRecord | null> {
    const row = await this.#db.cachedNoteLists.get(queryKey)
    if (!row) {
      return null
    }
    return Object.freeze({
      ...row,
      payload: deepCloneJson(row.payload),
    })
  }

  async listNoteDetails(): Promise<readonly CachedNoteDetailRecord[]> {
    const rows = await this.#db.cachedNoteDetails.toArray()
    return rows.map((row) =>
      Object.freeze({
        ...row,
        payload: deepCloneJson(row.payload),
      }),
    )
  }

  async listNoteLists(): Promise<readonly CachedNoteListRecord[]> {
    const rows = await this.#db.cachedNoteLists.toArray()
    return rows.map((row) =>
      Object.freeze({
        ...row,
        payload: deepCloneJson(row.payload),
      }),
    )
  }

  async clearAll(): Promise<void> {
    await this.#db.transaction(
      'rw',
      this.#db.cachedNoteDetails,
      this.#db.cachedNoteLists,
      async () => {
        await this.#db.cachedNoteDetails.clear()
        await this.#db.cachedNoteLists.clear()
      },
    )
  }
}

export function createReadCacheRepository(db?: SoulsideOfflineDatabase): ReadCacheRepository {
  return new ReadCacheRepository(db)
}

/** Canonical string key for IndexedDB list cache (stable JSON of the query key). */
export function serializeQueryKey(queryKey: readonly unknown[]): string {
  return JSON.stringify(queryKey)
}
