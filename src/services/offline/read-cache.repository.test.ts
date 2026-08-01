import { beforeEach, describe, expect, it } from 'vitest'

import { parseIsoDateTime } from '@/domain/datetime'
import { parseNoteId } from '@/domain/ids'
import { notesKeys } from '@/features/notes-list/notes-query-keys'
import {
  installOfflineDatabaseForTests,
  resetOfflineDatabaseForTests,
} from '@/services/offline/offline-db'
import {
  createReadCacheRepository,
  serializeQueryKey,
} from '@/services/offline/read-cache.repository'

describe('ReadCacheRepository', () => {
  beforeEach(async () => {
    await resetOfflineDatabaseForTests()
    installOfflineDatabaseForTests(`soulside-read-${Date.now()}`)
  })

  it('52–55: persists and restores detail/list payloads without localStorage', async () => {
    const repo = createReadCacheRepository()
    const noteId = parseNoteId('note_cache_1')
    const detailKey = serializeQueryKey(notesKeys.detail(noteId))
    await repo.putNoteDetail({
      noteId,
      queryKey: detailKey,
      payload: { note: { id: noteId }, marker: 'detail' },
      updatedAt: parseIsoDateTime('2024-01-01T00:00:00.000Z'),
    })
    await repo.putNoteList({
      queryKey: serializeQueryKey(notesKeys.lists()),
      payload: { pages: [{ items: [{ id: noteId }] }] },
      updatedAt: parseIsoDateTime('2024-01-01T00:00:01.000Z'),
    })

    const detail = await repo.getNoteDetail(noteId)
    expect(detail?.payload).toMatchObject({ marker: 'detail' })
    const list = await repo.getNoteList(serializeQueryKey(notesKeys.lists()))
    expect(list?.payload).toMatchObject({ pages: [{ items: [{ id: noteId }] }] })

    expect(globalThis.localStorage.getItem(detailKey)).toBeNull()
  })
})
