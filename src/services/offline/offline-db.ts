import Dexie, { type EntityTable } from 'dexie'

import type {
  CachedNoteDetailRecord,
  CachedNoteListRecord,
  QueuedCreateVersionWrite,
  ReplayMetadataRecord,
} from '@/services/offline/offline.types'

/**
 * Soulside offline IndexedDB (Dexie).
 *
 * Schema version history:
 * - v1: queuedWrites, cachedNoteDetails, cachedNoteLists, replayMetadata
 *
 * Future migrations must bump version() and use .upgrade() callbacks.
 * Do not mutate v1 stores in place without a version bump.
 */
export class SoulsideOfflineDatabase extends Dexie {
  queuedWrites!: EntityTable<QueuedCreateVersionWrite, 'id'>
  cachedNoteDetails!: EntityTable<CachedNoteDetailRecord, 'noteId'>
  cachedNoteLists!: EntityTable<CachedNoteListRecord, 'queryKey'>
  replayMetadata!: EntityTable<ReplayMetadataRecord, 'id'>

  constructor(databaseName: string) {
    super(databaseName)
    this.version(1).stores({
      queuedWrites: 'id, noteId, clientMutationId, status, createdAt, [noteId+createdAt]',
      cachedNoteDetails: 'noteId, updatedAt',
      cachedNoteLists: 'queryKey, updatedAt',
      replayMetadata: 'id',
    })
  }
}

let sharedDb: SoulsideOfflineDatabase | null = null
let sharedDbName = 'soulside-offline-v1'

export function getOfflineDatabaseName(): string {
  return sharedDbName
}

/**
 * Opens (or returns) the process-wide offline database.
 * Tests must call `installOfflineDatabaseForTests` / `resetOfflineDatabaseForTests`.
 */
export function getOfflineDatabase(): SoulsideOfflineDatabase {
  if (!sharedDb) {
    sharedDb = new SoulsideOfflineDatabase(sharedDbName)
  }
  return sharedDb
}

export function installOfflineDatabaseForTests(databaseName: string): SoulsideOfflineDatabase {
  sharedDbName = databaseName
  sharedDb = new SoulsideOfflineDatabase(databaseName)
  return sharedDb
}

export async function resetOfflineDatabaseForTests(): Promise<void> {
  if (sharedDb) {
    sharedDb.close()
    await Dexie.delete(sharedDbName)
    sharedDb = null
  }
  sharedDbName = `soulside-offline-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export async function clearOfflineDatabaseContents(
  db: SoulsideOfflineDatabase = getOfflineDatabase(),
): Promise<void> {
  await db.transaction(
    'rw',
    db.queuedWrites,
    db.cachedNoteDetails,
    db.cachedNoteLists,
    db.replayMetadata,
    async () => {
      await Promise.all([
        db.queuedWrites.clear(),
        db.cachedNoteDetails.clear(),
        db.cachedNoteLists.clear(),
        db.replayMetadata.clear(),
      ])
    },
  )
}
