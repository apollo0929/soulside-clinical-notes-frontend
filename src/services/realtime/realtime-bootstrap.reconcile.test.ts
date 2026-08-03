import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'

import { parseClientMutationId, parseNoteId, parseVersionId } from '@/domain/ids'
import type { NoteDetailAggregate } from '@/domain/models/note-detail-aggregate'
import { notesKeys } from '@/features/notes-list/notes-query-keys'
import {
  reconcileRealtimeEvent,
  rememberLocalMutation,
  resetMutationCorrelationForTests,
} from '@/services/realtime'
import {
  buildNote,
  buildNoteVersion,
  buildPatient,
  buildSoapContent,
  buildUser,
} from '@/test/fixtures/domain'
import { buildVersionAddedRealtimeEventDto } from '@/test/fixtures/dto'

function aggregate(): NoteDetailAggregate {
  const noteId = parseNoteId('note_123')
  const versionId = parseVersionId('ver_5')
  const version = buildNoteVersion({
    id: versionId,
    noteId,
    revisionNumber: 5,
    parentVersionId: parseVersionId('ver_4'),
    content: buildSoapContent({ subjective: 'baseline' }),
  })
  return {
    note: buildNote({ id: noteId, currentVersionId: versionId, status: 'IN_REVIEW' }),
    patient: buildPatient(),
    assignedReviewer: buildUser(),
    currentVersion: version,
    versions: [
      {
        id: version.id,
        noteId: version.noteId,
        revisionNumber: version.revisionNumber,
        parentVersionId: version.parentVersionId,
        authorId: version.authorId,
        authorRole: version.authorRole,
        createdAt: version.createdAt,
      },
    ],
    reviewEvents: [],
  }
}

describe('reconcileRealtimeEvent', () => {
  it('skips self-correlated NOTE_VERSION_CREATED echoes', () => {
    resetMutationCorrelationForTests()
    const queryClient = new QueryClient()
    const detailKey = notesKeys.detail(parseNoteId('note_123'))
    const before = aggregate()
    queryClient.setQueryData(detailKey, before)

    const mutationId = parseClientMutationId('mut_self_1')
    rememberLocalMutation({ mutationId })

    reconcileRealtimeEvent(
      queryClient,
      buildVersionAddedRealtimeEventDto({
        revision: 6,
        originatingClientMutationId: mutationId,
      }),
    )

    expect(queryClient.getQueryData(detailKey)).toBe(before)
    resetMutationCorrelationForTests()
  })

  it('applies remote NOTE_VERSION_CREATED and soft-invalidates detail', () => {
    resetMutationCorrelationForTests()
    const queryClient = new QueryClient()
    const detailKey = notesKeys.detail(parseNoteId('note_123'))
    queryClient.setQueryData(detailKey, aggregate())

    reconcileRealtimeEvent(
      queryClient,
      buildVersionAddedRealtimeEventDto({
        revision: 6,
        originatingClientMutationId: null,
      }),
    )

    const next = queryClient.getQueryData<NoteDetailAggregate>(detailKey)
    expect(next?.currentVersion.id).toBe(parseVersionId('ver_6'))
    expect(next?.currentVersion.content.subjective).toBe('baseline')
    const state = queryClient.getQueryState(detailKey)
    expect(state?.isInvalidated).toBe(true)
    resetMutationCorrelationForTests()
  })
})
