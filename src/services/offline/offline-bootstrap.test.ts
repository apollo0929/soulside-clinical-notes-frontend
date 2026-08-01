import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

import { parseIsoDateTime } from '@/domain/datetime'
import { parseClientMutationId, parseNoteId, parseVersionId } from '@/domain/ids'
import { notesKeys } from '@/features/notes-list/notes-query-keys'
import {
  ConnectivityService,
  installConnectivityServiceForTests,
  resetConnectivityServiceForTests,
} from '@/services/offline/connectivity'
import {
  ensureOfflineBootstrap,
  resetOfflineBootstrapForTests,
} from '@/services/offline/offline-bootstrap'
import {
  installOfflineDatabaseForTests,
  resetOfflineDatabaseForTests,
} from '@/services/offline/offline-db'
import { createQueuedWriteRepository } from '@/services/offline/queued-write.repository'
import { createReadCacheRepository } from '@/services/offline/read-cache.repository'
import { buildSoapContent } from '@/test/fixtures/domain'

describe('offline bootstrap', () => {
  it('69–72: bootstrap is idempotent and hydrates caches', async () => {
    await resetOfflineDatabaseForTests()
    resetOfflineBootstrapForTests()
    resetConnectivityServiceForTests()
    installOfflineDatabaseForTests(`soulside-boot-${Date.now()}`)
    const connectivity = new ConnectivityService({
      getNavigatorOnline: () => false,
      addWindowListener: () => () => undefined,
    })
    installConnectivityServiceForTests(connectivity)
    connectivity.start()
    connectivity.markOffline()

    const noteId = parseNoteId('note_boot_1')
    const readCache = createReadCacheRepository()
    await readCache.putNoteDetail({
      noteId,
      queryKey: JSON.stringify(notesKeys.detail(noteId)),
      payload: { note: { id: noteId }, boot: true },
      updatedAt: parseIsoDateTime('2024-01-01T00:00:00.000Z'),
    })
    await createQueuedWriteRepository().coalesceUnsentForNote({
      noteId,
      baseVersionId: parseVersionId('ver_boot'),
      content: buildSoapContent({ subjective: 'queued' }),
      clientMutationId: parseClientMutationId('mut_boot'),
      fingerprint: 'boot',
      createdAt: parseIsoDateTime('2024-01-01T00:00:01.000Z'),
    })

    const queryClient = new QueryClient()
    const handlers = {
      onConflict: vi.fn(),
      onReplaySuccess: vi.fn(),
    }
    const first = await ensureOfflineBootstrap(queryClient, handlers)
    const second = await ensureOfflineBootstrap(queryClient, handlers)
    expect(second).toBe(first)
    expect(queryClient.getQueryData(notesKeys.detail(noteId))).toMatchObject({ boot: true })
    first.dispose()
    resetOfflineBootstrapForTests()
  })
})
