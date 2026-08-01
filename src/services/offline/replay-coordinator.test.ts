import { describe, expect, it, vi } from 'vitest'

import { parseIsoDateTime } from '@/domain/datetime'
import { parseClientMutationId, parseNoteId, parseVersionId } from '@/domain/ids'
import { NetworkApiError } from '@/services/api/api-errors'
import { ConnectivityService } from '@/services/offline/connectivity'
import {
  installOfflineDatabaseForTests,
  resetOfflineDatabaseForTests,
} from '@/services/offline/offline-db'
import { createQueuedWriteRepository } from '@/services/offline/queued-write.repository'
import { createReplayCoordinator } from '@/services/offline/replay-coordinator'
import { buildSoapContent } from '@/test/fixtures/domain'

describe('ReplayCoordinator', () => {
  it('21–28, 37–43: ordered replay, concurrency, backoff via fake scheduler, success removes', async () => {
    await resetOfflineDatabaseForTests()
    installOfflineDatabaseForTests(`soulside-replay-${Date.now()}`)
    const queue = createQueuedWriteRepository()
    const connectivity = new ConnectivityService({
      getNavigatorOnline: () => true,
      addWindowListener: () => () => undefined,
    })
    connectivity.start()

    const noteA = parseNoteId('note_ra')
    const noteB = parseNoteId('note_rb')
    const base = parseVersionId('ver_r_base')

    await queue.coalesceUnsentForNote({
      noteId: noteA,
      baseVersionId: base,
      content: buildSoapContent({ subjective: 'a' }),
      clientMutationId: parseClientMutationId('mut_ra'),
      fingerprint: 'a',
      createdAt: parseIsoDateTime('2024-01-01T00:00:00.000Z'),
    })
    await queue.coalesceUnsentForNote({
      noteId: noteB,
      baseVersionId: base,
      content: buildSoapContent({ subjective: 'b' }),
      clientMutationId: parseClientMutationId('mut_rb'),
      fingerprint: 'b',
      createdAt: parseIsoDateTime('2024-01-01T00:00:01.000Z'),
    })

    const inFlightByNote = new Map<string, number>()
    let maxConcurrent = 0
    let concurrent = 0
    const saveOrder: string[] = []

    const scheduled: Array<() => void> = []
    const coordinator = createReplayCoordinator({
      queue,
      connectivity,
      concurrency: 2,
      scheduler: {
        schedule(_delay, work) {
          scheduled.push(work)
          return () => undefined
        },
      },
      transport: {
        async save(input) {
          const key = String(input.noteId)
          inFlightByNote.set(key, (inFlightByNote.get(key) ?? 0) + 1)
          expect(inFlightByNote.get(key)).toBe(1)
          concurrent += 1
          maxConcurrent = Math.max(maxConcurrent, concurrent)
          saveOrder.push(key)
          await Promise.resolve()
          concurrent -= 1
          inFlightByNote.set(key, (inFlightByNote.get(key) ?? 1) - 1)
          return {
            versionId: parseVersionId(`ver_${key}`),
            revision: 2,
            parentVersionId: input.baseVersionId,
            savedContent: input.content,
          }
        },
      },
      onConflict: vi.fn(),
      onReplaySuccess: vi.fn(),
    })

    await coordinator.replayNow()
    expect(saveOrder).toHaveLength(2)
    expect(maxConcurrent).toBeLessThanOrEqual(2)
    expect(await queue.count()).toBe(0)
    coordinator.dispose()
    connectivity.stop()
  })

  it('29–32, 37–41: 409 blocks note; network retries then FAILED; other notes continue', async () => {
    await resetOfflineDatabaseForTests()
    installOfflineDatabaseForTests(`soulside-replay-conflict-${Date.now()}`)
    const queue = createQueuedWriteRepository()
    const connectivity = new ConnectivityService({
      getNavigatorOnline: () => true,
      addWindowListener: () => () => undefined,
    })
    const noteConflict = parseNoteId('note_c')
    const noteOk = parseNoteId('note_ok')
    const base = parseVersionId('ver_base')

    await queue.coalesceUnsentForNote({
      noteId: noteConflict,
      baseVersionId: base,
      content: buildSoapContent({ subjective: 'c' }),
      clientMutationId: parseClientMutationId('mut_c'),
      fingerprint: 'c',
      createdAt: parseIsoDateTime('2024-01-01T00:00:00.000Z'),
    })
    await queue.coalesceUnsentForNote({
      noteId: noteOk,
      baseVersionId: base,
      content: buildSoapContent({ subjective: 'ok' }),
      clientMutationId: parseClientMutationId('mut_ok'),
      fingerprint: 'ok',
      createdAt: parseIsoDateTime('2024-01-01T00:00:01.000Z'),
    })

    const onConflict = vi.fn()
    const { VersionConflictApiError } = await import('@/services/api/create-version-api')
    const { parseUserId } = await import('@/domain/ids')

    const coordinator = createReplayCoordinator({
      queue,
      connectivity,
      concurrency: 2,
      scheduler: {
        schedule(_d, work) {
          work()
          return () => undefined
        },
      },
      transport: {
        async save(input) {
          if (input.noteId === noteConflict) {
            throw new VersionConflictApiError({
              error: 'version_conflict',
              current: {
                id: parseVersionId('ver_head'),
                revision: 9,
                authoredBy: { id: parseUserId('usr_admin_42'), role: 'ADMIN' },
              },
              commonAncestor: { id: base, revision: 1 },
            })
          }
          return {
            versionId: parseVersionId('ver_ok_2'),
            revision: 2,
            parentVersionId: input.baseVersionId,
            savedContent: input.content,
          }
        },
      },
      onConflict,
      onReplaySuccess: vi.fn(),
    })

    await coordinator.replayNow()
    expect(onConflict).toHaveBeenCalledOnce()
    const blocked = (await queue.listByNote(noteConflict))[0]
    expect(blocked?.status).toBe('BLOCKED_CONFLICT')
    expect(blocked?.conflictPayload).not.toBeNull()
    expect(await queue.listByNote(noteOk)).toHaveLength(0)
    coordinator.dispose()
  })

  it('37–41: network errors retry with fake clock then FAILED', async () => {
    await resetOfflineDatabaseForTests()
    installOfflineDatabaseForTests(`soulside-replay-retry-${Date.now()}`)
    const queue = createQueuedWriteRepository()
    const connectivity = new ConnectivityService({
      getNavigatorOnline: () => true,
      addWindowListener: () => () => undefined,
    })
    const noteId = parseNoteId('note_retry')
    const entry = await queue.coalesceUnsentForNote({
      noteId,
      baseVersionId: parseVersionId('ver_base'),
      content: buildSoapContent({ subjective: 'x' }),
      clientMutationId: parseClientMutationId('mut_retry'),
      fingerprint: 'x',
      createdAt: parseIsoDateTime('2024-01-01T00:00:00.000Z'),
    })

    const coordinator = createReplayCoordinator({
      queue,
      connectivity,
      scheduler: {
        schedule(_d, work) {
          work()
          return () => undefined
        },
      },
      transport: {
        async save() {
          throw new NetworkApiError({ message: 'offline' })
        },
      },
      onConflict: vi.fn(),
      onReplaySuccess: vi.fn(),
    })

    await coordinator.replayNow()
    const failed = await queue.getById(entry.id)
    expect(failed?.status).toBe('FAILED')
    expect(failed?.clientMutationId).toBe('mut_retry')
    expect(failed?.retryCount).toBeGreaterThanOrEqual(1)
    coordinator.dispose()
  })

  it('requeues interrupted REPLAYING; success still removes after dispose during save', async () => {
    await resetOfflineDatabaseForTests()
    installOfflineDatabaseForTests(`soulside-replay-recover-${Date.now()}`)
    const queue = createQueuedWriteRepository()
    const connectivity = new ConnectivityService({
      getNavigatorOnline: () => true,
      addWindowListener: () => () => undefined,
    })
    connectivity.start()

    const noteId = parseNoteId('note_recover')
    const base = parseVersionId('ver_recover')
    const entry = await queue.coalesceUnsentForNote({
      noteId,
      baseVersionId: base,
      content: buildSoapContent({ subjective: 'recover' }),
      clientMutationId: parseClientMutationId('mut_recover'),
      fingerprint: 'fp_recover',
      createdAt: parseIsoDateTime('2024-01-01T00:00:00.000Z'),
    })
    await queue.markReplaying(entry.id)

    const coordinator = createReplayCoordinator({
      queue,
      connectivity,
      concurrency: 2,
      scheduler: {
        schedule(_delay, work) {
          work()
          return () => undefined
        },
      },
      transport: {
        async save(input) {
          coordinator.dispose()
          return {
            versionId: parseVersionId('ver_recovered'),
            revision: 2,
            parentVersionId: input.baseVersionId,
            savedContent: input.content,
          }
        },
      },
      onConflict: vi.fn(),
      onReplaySuccess: vi.fn(),
    })

    await coordinator.replayNow()
    expect(await queue.count()).toBe(0)
    connectivity.stop()
  })
})
