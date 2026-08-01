import { beforeEach, describe, expect, it } from 'vitest'

import { parseIsoDateTime } from '@/domain/datetime'
import { parseClientMutationId, parseNoteId, parseUserId, parseVersionId } from '@/domain/ids'
import { buildCreateVersionFingerprint } from '@/mock/idempotency/fingerprint'
import {
  installOfflineDatabaseForTests,
  resetOfflineDatabaseForTests,
} from '@/services/offline/offline-db'
import {
  createQueuedWriteRepository,
  QueuedWriteConflictError,
} from '@/services/offline/queued-write.repository'
import { buildSoapContent } from '@/test/fixtures/domain'

describe('QueuedWriteRepository', () => {
  beforeEach(async () => {
    await resetOfflineDatabaseForTests()
    installOfflineDatabaseForTests(`soulside-q-${Date.now()}`)
  })

  it('1–7, 12–13: insert, read, clone, dedupe, remove, restore across instances', async () => {
    const dbName = `soulside-q-restore-${Date.now()}`
    installOfflineDatabaseForTests(dbName)
    const repo = createQueuedWriteRepository()
    const noteId = parseNoteId('note_q1')
    const base = parseVersionId('ver_q1')
    const content = buildSoapContent({ subjective: 'local' })
    const mutationId = parseClientMutationId('mut_q_1')
    const fingerprint = buildCreateVersionFingerprint({
      noteId,
      baseVersionId: base,
      content,
      actorUserId: parseUserId('usr_admin_42'),
    })

    const inserted = await repo.insertOrGet({
      noteId,
      baseVersionId: base,
      content,
      clientMutationId: mutationId,
      fingerprint,
      createdAt: parseIsoDateTime('2024-01-01T00:00:00.000Z'),
    })
    expect(inserted.status).toBe('QUEUED')
    expect(inserted.content.subjective).toBe('local')

    const again = await repo.insertOrGet({
      noteId,
      baseVersionId: base,
      content,
      clientMutationId: mutationId,
      fingerprint,
      createdAt: parseIsoDateTime('2024-01-01T00:00:01.000Z'),
    })
    expect(again.id).toBe(inserted.id)

    await expect(
      repo.insertOrGet({
        noteId,
        baseVersionId: base,
        content: buildSoapContent({ subjective: 'changed' }),
        clientMutationId: mutationId,
        fingerprint: 'different',
        createdAt: parseIsoDateTime('2024-01-01T00:00:02.000Z'),
      }),
    ).rejects.toBeInstanceOf(QueuedWriteConflictError)

    const mutable = structuredClone(await repo.getById(inserted.id)) as {
      content: { subjective: string }
    }
    expect(mutable).not.toBeNull()
    mutable.content.subjective = 'hacked'
    const reread = await repo.getById(inserted.id)
    expect(reread?.content.subjective).toBe('local')

    await repo.markReplaying(inserted.id)
    expect((await repo.getById(inserted.id))?.status).toBe('REPLAYING')
    await repo.remove(inserted.id)
    expect(await repo.getById(inserted.id)).toBeNull()

    const reinsert = await repo.insertOrGet({
      noteId,
      baseVersionId: base,
      content,
      clientMutationId: parseClientMutationId('mut_q_2'),
      fingerprint: `${fingerprint}-2`,
      createdAt: parseIsoDateTime('2024-01-01T00:00:03.000Z'),
    })

    // New repository instance against same DB name restores entries.
    const repo2 = createQueuedWriteRepository(installOfflineDatabaseForTests(dbName))
    const restored = await repo2.getById(reinsert.id)
    expect(restored?.content.subjective).toBe('local')
  })

  it('8–10, 14–19: coalesce keeps one unsent entry; changed content replaces; notes isolated', async () => {
    installOfflineDatabaseForTests(`soulside-q-coal-${Date.now()}`)
    const repo = createQueuedWriteRepository()
    const noteA = parseNoteId('note_a')
    const noteB = parseNoteId('note_b')
    const base = parseVersionId('ver_base')

    const first = await repo.coalesceUnsentForNote({
      noteId: noteA,
      baseVersionId: base,
      content: buildSoapContent({ subjective: 'one' }),
      clientMutationId: parseClientMutationId('mut_a_1'),
      fingerprint: 'fp1',
      createdAt: parseIsoDateTime('2024-01-01T00:00:00.000Z'),
    })
    const second = await repo.coalesceUnsentForNote({
      noteId: noteA,
      baseVersionId: base,
      content: buildSoapContent({ subjective: 'two' }),
      clientMutationId: parseClientMutationId('mut_a_2'),
      fingerprint: 'fp2',
      createdAt: parseIsoDateTime('2024-01-01T00:00:01.000Z'),
    })
    expect(second.id).not.toBe(first.id)
    expect(second.content.subjective).toBe('two')
    expect(await repo.listByNote(noteA)).toHaveLength(1)

    await repo.coalesceUnsentForNote({
      noteId: noteB,
      baseVersionId: base,
      content: buildSoapContent({ subjective: 'b' }),
      clientMutationId: parseClientMutationId('mut_b_1'),
      fingerprint: 'fpb',
      createdAt: parseIsoDateTime('2024-01-01T00:00:02.000Z'),
    })
    expect(await repo.count()).toBe(2)

    await repo.markFailed(second.id, { errorCode: 'NETWORK', retryCount: 3 })
    expect((await repo.getById(second.id))?.status).toBe('FAILED')
  })

  it('discard removes all statuses for note; requeue recovers interrupted REPLAYING', async () => {
    const repo = createQueuedWriteRepository()
    const noteId = parseNoteId('note_discard')
    const other = parseNoteId('note_keep')
    const base = parseVersionId('ver_d')

    const a = await repo.coalesceUnsentForNote({
      noteId,
      baseVersionId: base,
      content: buildSoapContent({ subjective: 'drop' }),
      clientMutationId: parseClientMutationId('mut_d1'),
      fingerprint: 'fp_d1',
      createdAt: parseIsoDateTime('2024-01-01T00:00:00.000Z'),
    })
    await repo.markReplaying(a.id)
    expect((await repo.getById(a.id))?.status).toBe('REPLAYING')

    const recovered = await repo.requeueInterruptedReplaying()
    expect(recovered).toBe(1)
    expect((await repo.getById(a.id))?.status).toBe('QUEUED')

    await repo.coalesceUnsentForNote({
      noteId: other,
      baseVersionId: base,
      content: buildSoapContent({ subjective: 'keep' }),
      clientMutationId: parseClientMutationId('mut_keep'),
      fingerprint: 'fp_keep',
      createdAt: parseIsoDateTime('2024-01-01T00:00:01.000Z'),
    })

    await repo.removeUnsentForNote(noteId)
    expect(await repo.listByNote(noteId)).toHaveLength(0)
    expect(await repo.listByNote(other)).toHaveLength(1)
  })
})
