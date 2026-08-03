/**
 * Soulside offline IndexedDB (Dexie).
 *
 * Schema version history:
 * - v1: queuedWrites, cachedNoteDetails, cachedNoteLists, replayMetadata
 * - v2: + telemetryBatches (privacy-safe telemetry offline persistence)
 *
 * Future migrations must bump version() and use .upgrade() callbacks.
 * Do not mutate prior stores in place without a version bump.
 */
import Dexie, { type EntityTable } from 'dexie'

import type {
  CachedNoteDetailRecord,
  CachedNoteListRecord,
  QueuedCreateVersionWrite,
  ReplayMetadataRecord,
} from '@/services/offline/offline.types'
import type { StoredTelemetryBatch } from '@/services/telemetry/telemetry.types'

export class SoulsideOfflineDatabase extends Dexie {
  queuedWrites!: EntityTable<QueuedCreateVersionWrite, 'id'>
  cachedNoteDetails!: EntityTable<CachedNoteDetailRecord, 'noteId'>
  cachedNoteLists!: EntityTable<CachedNoteListRecord, 'queryKey'>
  replayMetadata!: EntityTable<ReplayMetadataRecord, 'id'>
  telemetryBatches!: EntityTable<StoredTelemetryBatch, 'batchId'>

  constructor(databaseName: string) {
    super(databaseName)
    this.version(1).stores({
      queuedWrites: 'id, noteId, clientMutationId, status, createdAt, [noteId+createdAt]',
      cachedNoteDetails: 'noteId, updatedAt',
      cachedNoteLists: 'queryKey, updatedAt',
      replayMetadata: 'id',
    })
    this.version(2).stores({
      queuedWrites: 'id, noteId, clientMutationId, status, createdAt, [noteId+createdAt]',
      cachedNoteDetails: 'noteId, updatedAt',
      cachedNoteLists: 'queryKey, updatedAt',
      replayMetadata: 'id',
      telemetryBatches: 'batchId, createdAt, status',
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
  await db.open()
  await db.transaction(
    'rw',
    db.queuedWrites,
    db.cachedNoteDetails,
    db.cachedNoteLists,
    db.replayMetadata,
    db.telemetryBatches,
    async () => {
      await Promise.all([
        db.queuedWrites.clear(),
        db.cachedNoteDetails.clear(),
        db.cachedNoteLists.clear(),
        db.replayMetadata.clear(),
        db.telemetryBatches.clear(),
      ])
    },
  )
}
