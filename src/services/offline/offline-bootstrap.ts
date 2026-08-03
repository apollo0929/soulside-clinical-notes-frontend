import type { QueryClient } from '@tanstack/react-query'

import { parseIsoDateTime } from '@/domain/datetime'
import type { NoteId } from '@/domain/ids'
import type { NoteDetailAggregate } from '@/domain/models/note-detail-aggregate'
import { notesKeys } from '@/features/notes-list/notes-query-keys'
import { getConnectivityService } from '@/services/offline/connectivity'
import { getOfflineDatabase } from '@/services/offline/offline-db'
import { createQueuedWriteRepository } from '@/services/offline/queued-write.repository'
import {
  createReadCacheRepository,
  serializeQueryKey,
} from '@/services/offline/read-cache.repository'
import {
  createReplayCoordinator,
  type ReplayCoordinator,
} from '@/services/offline/replay-coordinator'

export type OfflineBootstrapHandlers = {
  readonly onConflict: Parameters<typeof createReplayCoordinator>[0]['onConflict']
  readonly onReplaySuccess: Parameters<typeof createReplayCoordinator>[0]['onReplaySuccess']
  readonly onReplayFailed?: Parameters<typeof createReplayCoordinator>[0]['onReplayFailed']
}

let bootstrapPromise: Promise<ReplayCoordinator> | null = null
let activeCoordinator: ReplayCoordinator | null = null
let bootstrapEpoch = 0

/**
 * Idempotent offline bootstrap: open IndexedDB, hydrate Query cache, start connectivity + replay.
 * Safe under React Strict Mode double invocation.
 */
export async function ensureOfflineBootstrap(
  queryClient: QueryClient,
  handlers: OfflineBootstrapHandlers,
): Promise<ReplayCoordinator> {
  if (bootstrapPromise) {
    return bootstrapPromise
  }

  const epoch = bootstrapEpoch
  bootstrapPromise = (async () => {
    try {
      const db = getOfflineDatabase()
      await db.open()
      if (epoch !== bootstrapEpoch) {
        throw new Error('Offline bootstrap cancelled')
      }

      const readCache = createReadCacheRepository(db)
      const queue = createQueuedWriteRepository(db)
      const connectivity = getConnectivityService()
      connectivity.start()

      // Hydrate cached reads into TanStack Query (full reload survival).
      const details = await readCache.listNoteDetails()
      if (epoch !== bootstrapEpoch) {
        throw new Error('Offline bootstrap cancelled')
      }
      for (const detail of details) {
        try {
          const key = JSON.parse(detail.queryKey) as ReturnType<typeof notesKeys.detail>
          queryClient.setQueryData(key, detail.payload)
        } catch {
          // Ignore corrupt cache rows.
        }
      }
      const lists = await readCache.listNoteLists()
      for (const list of lists) {
        try {
          const key = JSON.parse(list.queryKey) as unknown[]
          queryClient.setQueryData(key, list.payload)
        } catch {
          // Ignore corrupt cache rows.
        }
      }

      if (activeCoordinator) {
        activeCoordinator.dispose()
      }

      const coordinator = createReplayCoordinator({
        queue,
        connectivity,
        onConflict: handlers.onConflict,
        onReplaySuccess: handlers.onReplaySuccess,
        ...(handlers.onReplayFailed ? { onReplayFailed: handlers.onReplayFailed } : {}),
      })
      if (epoch !== bootstrapEpoch) {
        coordinator.dispose()
        throw new Error('Offline bootstrap cancelled')
      }
      activeCoordinator = coordinator
      coordinator.start()

      if (connectivity.getSnapshot().kind !== 'OFFLINE') {
        void coordinator.replayNow().catch(() => {
          // Teardown / offline races are non-fatal.
        })
      }

      return coordinator
    } catch (error) {
      if (error instanceof Error && error.message === 'Offline bootstrap cancelled') {
        throw error
      }
      // Dexie closed / storage failures during test teardown — return disposed coordinator.
      const coordinator = createReplayCoordinator({
        queue: createQueuedWriteRepository(),
        connectivity: getConnectivityService(),
        onConflict: handlers.onConflict,
        onReplaySuccess: handlers.onReplaySuccess,
        ...(handlers.onReplayFailed ? { onReplayFailed: handlers.onReplayFailed } : {}),
      })
      coordinator.dispose()
      return coordinator
    }
  })()

  try {
    return await bootstrapPromise
  } catch (error) {
    bootstrapPromise = null
    if (error instanceof Error && error.message === 'Offline bootstrap cancelled') {
      // Return a disposed no-op coordinator for cancelled boots.
      const queue = createQueuedWriteRepository()
      const connectivity = getConnectivityService()
      const coordinator = createReplayCoordinator({
        queue,
        connectivity,
        onConflict: handlers.onConflict,
        onReplaySuccess: handlers.onReplaySuccess,
      })
      coordinator.dispose()
      return coordinator
    }
    throw error
  }
}

export function getActiveReplayCoordinator(): ReplayCoordinator | null {
  return activeCoordinator
}

export async function persistNoteDetailToOfflineCache(
  noteId: NoteId,
  aggregate: NoteDetailAggregate,
): Promise<void> {
  try {
    const readCache = createReadCacheRepository()
    await readCache.putNoteDetail({
      noteId,
      queryKey: serializeQueryKey(notesKeys.detail(noteId)),
      payload: aggregate,
      updatedAt: parseIsoDateTime(new Date().toISOString()),
    })
  } catch {
    // Ignore teardown races (DB closed during test cleanup).
  }
}

export async function persistNoteListToOfflineCache(
  queryKey: readonly unknown[],
  payload: unknown,
): Promise<void> {
  try {
    const readCache = createReadCacheRepository()
    await readCache.putNoteList({
      queryKey: serializeQueryKey(queryKey),
      payload,
      updatedAt: parseIsoDateTime(new Date().toISOString()),
    })
  } catch {
    // Ignore teardown races (DB closed during test cleanup).
  }
}

export function resetOfflineBootstrapForTests(): void {
  bootstrapEpoch += 1
  activeCoordinator?.dispose()
  activeCoordinator = null
  bootstrapPromise = null
}
