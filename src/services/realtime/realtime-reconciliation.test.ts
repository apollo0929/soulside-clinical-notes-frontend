import { describe, expect, it } from 'vitest'

import { parseIsoDateTime } from '@/domain/datetime'
import { parseClientMutationId, parseNoteId, parseVersionId } from '@/domain/ids'
import { mapNoteListItemDtoToNoteSummary } from '@/domain/mappers/note-list'
import type { NoteDetailAggregate } from '@/domain/models/note-detail-aggregate'
import type { NoteVersionCreatedEventDto } from '@/domain/schemas/realtime'
import type { NotesInfiniteData } from '@/features/notes-list/notes-list-cache'
import {
  applyNoteSummaryToListCache,
  applyStatusOrReviewerToDetail,
  applyVersionCreatedToDetail,
  classifyVersionEventAgainstEditor,
  shouldInvalidateListForMembershipChange,
} from '@/services/realtime/realtime-reconciliation'
import {
  buildNote,
  buildNoteVersion,
  buildPatient,
  buildSoapContent,
  buildUser,
} from '@/test/fixtures/domain'
import {
  buildNoteListItemDto,
  buildStatusChangedRealtimeEventDto,
  buildVersionAddedRealtimeEventDto,
} from '@/test/fixtures/dto'

function baseAggregate(revision = 5): NoteDetailAggregate {
  const noteId = parseNoteId('note_123')
  const versionId = parseVersionId('ver_5')
  const version = buildNoteVersion({
    id: versionId,
    noteId,
    revisionNumber: revision,
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

describe('realtime reconciliation helpers', () => {
  it('11–14: applyVersionCreatedToDetail ignores stale revision and dedupes version id', () => {
    const aggregate = baseAggregate(6)
    const staleEvent = buildVersionAddedRealtimeEventDto({
      revision: 5,
    }) as NoteVersionCreatedEventDto
    expect(applyVersionCreatedToDetail(aggregate, staleEvent)).toBeNull()

    const freshEvent = buildVersionAddedRealtimeEventDto({
      revision: 7,
    }) as NoteVersionCreatedEventDto
    const first = applyVersionCreatedToDetail(aggregate, freshEvent)
    expect(first?.currentVersion.id).toBe(parseVersionId('ver_6'))
    expect(first?.versions).toHaveLength(2)
    expect(aggregate.versions).toHaveLength(1)

    const second = applyVersionCreatedToDetail(first!, freshEvent)
    expect(second?.versions).toHaveLength(2)
  })

  it('15–16: applyStatusOrReviewerToDetail updates status/reviewer immutably', () => {
    const aggregate = baseAggregate()
    const event = buildStatusChangedRealtimeEventDto() as ReturnType<
      typeof buildStatusChangedRealtimeEventDto
    > & { eventType: 'NOTE_STATUS_CHANGED' }
    const next = applyStatusOrReviewerToDetail(aggregate, event)
    expect(next.note.status).toBe('IN_REVIEW')
    expect(aggregate.note.status).toBe('IN_REVIEW')
    expect(next).not.toBe(aggregate)
  })

  it('17–18: applyNoteSummaryToListCache patches rows and preserves cursors', () => {
    const item = mapNoteListItemDtoToNoteSummary(buildNoteListItemDto())
    const infiniteData: NotesInfiniteData = {
      pages: [
        {
          items: [item],
          nextCursor: 'opaque-cursor-or-null',
          hasMore: true,
          total: 1,
          returned: 1,
          generatedAt: parseIsoDateTime('2025-11-04T14:41:03Z'),
        },
      ],
      pageParams: [null],
    }
    const summary = {
      id: parseNoteId('note_123'),
      status: 'AMENDED' as const,
      currentVersionId: parseVersionId('ver_9'),
      currentRevision: 9,
      assignedReviewer: null,
      updatedAt: parseIsoDateTime('2025-11-04T14:41:02Z'),
    }
    const patched = applyNoteSummaryToListCache(infiniteData, summary)
    expect(patched.pageParams).toEqual(infiniteData.pageParams)
    expect(patched.pages[0]?.items[0]?.status).toBe('AMENDED')
    expect(infiniteData.pages[0]?.items[0]?.status).toBe('READY_FOR_REVIEW')
  })

  it('19: shouldInvalidateListForMembershipChange', () => {
    expect(
      shouldInvalidateListForMembershipChange(
        buildStatusChangedRealtimeEventDto() as ReturnType<
          typeof buildStatusChangedRealtimeEventDto
        >,
      ),
    ).toBe(true)
    expect(
      shouldInvalidateListForMembershipChange(
        buildVersionAddedRealtimeEventDto() as ReturnType<typeof buildVersionAddedRealtimeEventDto>,
      ),
    ).toBe(false)
  })

  it('20–23: classifyVersionEventAgainstEditor self/stale/dirty/clean', () => {
    const event = buildVersionAddedRealtimeEventDto({
      originatingClientMutationId: parseClientMutationId('mut_local'),
    }) as NoteVersionCreatedEventDto

    expect(
      classifyVersionEventAgainstEditor({
        editorBaseVersionId: parseVersionId('ver_5'),
        isDirty: false,
        event,
        localMutationIds: new Set([String(parseClientMutationId('mut_local'))]),
      }),
    ).toBe('IGNORE_SELF')

    expect(
      classifyVersionEventAgainstEditor({
        editorBaseVersionId: parseVersionId(event.versionId),
        isDirty: false,
        event,
        localMutationIds: new Set(),
      }),
    ).toBe('IGNORE_STALE')

    expect(
      classifyVersionEventAgainstEditor({
        editorBaseVersionId: parseVersionId('ver_5'),
        isDirty: false,
        event: { ...event, originatingClientMutationId: null },
        localMutationIds: new Set(),
      }),
    ).toBe('APPLY_CLEAN')

    expect(
      classifyVersionEventAgainstEditor({
        editorBaseVersionId: parseVersionId('ver_5'),
        isDirty: true,
        event: { ...event, originatingClientMutationId: null },
        localMutationIds: new Set(),
      }),
    ).toBe('WARN_DIRTY')

    expect(
      classifyVersionEventAgainstEditor({
        editorBaseVersionId: parseVersionId('ver_5'),
        isDirty: false,
        event: { ...event, originatingClientMutationId: null },
        localMutationIds: new Set(),
      }),
    ).toBe('APPLY_CLEAN')
  })
})
