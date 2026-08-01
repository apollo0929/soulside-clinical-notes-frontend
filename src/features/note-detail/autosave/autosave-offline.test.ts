import { beforeEach, describe, expect, it, vi } from 'vitest'

import { parseIsoDateTime } from '@/domain/datetime'
import { parseClientMutationId, parseNoteId, parseUserId, parseVersionId } from '@/domain/ids'
import { createAutosaveCoordinator } from '@/features/note-detail/autosave/autosave-coordinator'
import { buildCreateVersionFingerprint } from '@/mock/idempotency/fingerprint'
import { NetworkApiError } from '@/services/api/api-errors'
import {
  installOfflineDatabaseForTests,
  resetOfflineDatabaseForTests,
} from '@/services/offline/offline-db'
import { createQueuedWriteRepository } from '@/services/offline/queued-write.repository'
import { buildSoapContent } from '@/test/fixtures/domain'

describe('autosave offline queue integration', () => {
  beforeEach(async () => {
    await resetOfflineDatabaseForTests()
    installOfflineDatabaseForTests(`soulside-as-${Date.now()}`)
  })

  it('61–64: network failure queues offline and preserves mutation id across reload instance', async () => {
    const noteId = parseNoteId('note_as_1')
    const base = parseVersionId('ver_as_1')
    const content = buildSoapContent({ subjective: 'offline-draft' })
    const mutationId = parseClientMutationId('mut_as_offline')
    const fingerprint = buildCreateVersionFingerprint({
      noteId,
      baseVersionId: base,
      content,
      actorUserId: parseUserId('usr_admin_42'),
    })

    const coordinator = createAutosaveCoordinator({
      transport: {
        async save() {
          throw new NetworkApiError({ message: 'offline' })
        },
      },
      nextMutationId: () => mutationId,
      onSuccess: vi.fn(),
      isOffline: () => true,
      persistOfflineWrite: async (intent) => {
        const entry = await createQueuedWriteRepository().coalesceUnsentForNote({
          noteId: intent.noteId,
          baseVersionId: intent.baseVersionId,
          content: intent.content,
          clientMutationId: intent.clientMutationId,
          fingerprint,
          createdAt: parseIsoDateTime('2024-01-01T00:00:00.000Z'),
        })
        return { queueId: entry.id, clientMutationId: entry.clientMutationId }
      },
    })

    coordinator.enqueueLatest({ noteId, baseVersionId: base, content })
    await vi.waitFor(() => {
      expect(coordinator.getSnapshot().kind).toBe('QUEUED_OFFLINE')
    })
    const status = coordinator.getSnapshot()
    expect(status.kind).toBe('QUEUED_OFFLINE')
    if (status.kind === 'QUEUED_OFFLINE') {
      expect(status.mutationId).toBe(mutationId)
    }
    expect(await createQueuedWriteRepository().count()).toBe(1)
    expect(coordinator.hasUnackedWork()).toBe(false)
    coordinator.dispose()
  })
})
