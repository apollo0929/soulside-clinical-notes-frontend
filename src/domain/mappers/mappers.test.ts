import { describe, expect, it } from 'vitest'

import { parseSessionId, parseUserId } from '@/domain/ids'
import {
  mapNoteDetailDtoToDomain,
  mapNoteListItemDtoToNoteSummary,
  mapNoteVersionDtoToDomain,
  mapSoapContentDtoToDomain,
} from '@/domain/mappers'
import type { Note } from '@/domain/models/note'
import type { NoteVersion } from '@/domain/models/note-version'
import {
  buildNoteDetailDto,
  buildNoteListItemDto,
  buildNoteVersion,
  buildSoapContent,
} from '@/test/fixtures'

describe('DTO-to-domain mappers', () => {
  it('maps SOAP S/O/A/P sections to descriptive domain fields', () => {
    const content = mapSoapContentDtoToDomain({
      sections: {
        S: 'subjective-text',
        O: 'objective-text',
        A: 'assessment-text',
        P: 'plan-text',
      },
    })

    expect(content).toEqual({
      subjective: 'subjective-text',
      objective: 'objective-text',
      assessment: 'assessment-text',
      plan: 'plan-text',
    })
    expect(Object.isFrozen(content)).toBe(true)
  })

  it('preserves identity relationships when mapping note detail', () => {
    const dto = buildNoteDetailDto()
    const aggregate = mapNoteDetailDtoToDomain(dto, {
      sessionId: parseSessionId('sess_123'),
    })

    expect(aggregate.note.id).toBe(dto.id)
    expect(aggregate.note.patientId).toBe(aggregate.patient.id)
    expect(aggregate.note.currentVersionId).toBe(aggregate.currentVersion.id)
    expect(aggregate.currentVersion.noteId).toBe(aggregate.note.id)
    expect(aggregate.note.assignedReviewerId).toBe(aggregate.assignedReviewer?.id ?? null)
    expect(aggregate.versions.every((version) => version.noteId === aggregate.note.id)).toBe(true)
    expect(aggregate.reviewEvents.every((event) => event.noteId === aggregate.note.id)).toBe(true)
    expect(aggregate.reviewEvents[0]?.versionId).toBe(aggregate.currentVersion.id)
    expect(aggregate.note.sessionId).toBe('sess_123')
    expect(aggregate.currentVersion.content.subjective).toBe(dto.currentVersion.content.sections.S)
  })

  it('maps null assigned reviewer to null on note and summary', () => {
    const detail = mapNoteDetailDtoToDomain(buildNoteDetailDto({ assignedReviewer: null }), {
      sessionId: parseSessionId('sess_123'),
    })
    const summary = mapNoteListItemDtoToNoteSummary(
      buildNoteListItemDto({ assignedReviewer: null }),
    )

    expect(detail.assignedReviewer).toBeNull()
    expect(detail.note.assignedReviewerId).toBeNull()
    expect(summary.assignedReviewer).toBeNull()
  })

  it('maps list items to summaries without embedding SOAP content', () => {
    const summary = mapNoteListItemDtoToNoteSummary(
      buildNoteListItemDto({
        assignedReviewer: {
          id: parseUserId('usr_123'),
          displayName: 'Dr. Chen',
          role: 'REVIEWER',
        },
      }),
    )

    expect(summary.patientDisplayName).toBe('Riley A.')
    expect(summary.currentRevision).toBe(3)
    expect(summary.assignedReviewer).toEqual({
      id: 'usr_123',
      displayName: 'Dr. Chen',
    })
    expect(summary).not.toHaveProperty('content')
    expect(summary).not.toHaveProperty('subjective')
  })

  it('ensures Note does not contain SOAP content', () => {
    const aggregate = mapNoteDetailDtoToDomain(buildNoteDetailDto(), {
      sessionId: parseSessionId('sess_123'),
    })
    const note: Note = aggregate.note

    expect(note).not.toHaveProperty('content')
    expect(Object.keys(note).sort()).toEqual(
      [
        'assignedReviewerId',
        'createdAt',
        'currentVersionId',
        'id',
        'patientId',
        'sessionId',
        'status',
        'updatedAt',
      ].sort(),
    )
  })

  it('ensures NoteVersion contains frozen SOAP content', () => {
    const dto = buildNoteDetailDto()
    const version: NoteVersion = mapNoteVersionDtoToDomain(dto.currentVersion, dto.id)

    expect(Object.isFrozen(version.content)).toBe(true)
    expect(version.content.subjective).toBe(dto.currentVersion.content.sections.S)
    expect(version.content.objective).toBe(dto.currentVersion.content.sections.O)
    expect(version.content.assessment).toBe(dto.currentVersion.content.sections.A)
    expect(version.content.plan).toBe(dto.currentVersion.content.sections.P)
    expect(version.noteId).toBe(dto.id)
  })
})

describe('fixture builders', () => {
  it('does not share mutable nested references across calls', () => {
    const shared = buildSoapContent({ subjective: 'shared-seed' })
    const first = buildNoteVersion({ content: shared })
    const second = buildNoteVersion({ content: shared })
    const third = buildNoteVersion()
    const detail = buildNoteDetailDto()

    expect(first.content).not.toBe(shared)
    expect(second.content).not.toBe(shared)
    expect(first.content).not.toBe(second.content)
    expect(first.content).not.toBe(third.content)
    expect(Object.isFrozen(first.content)).toBe(true)
    expect(detail.versions[0]?.authoredBy).not.toBe(detail.currentVersion.authoredBy)

    expect(() => {
      ;(first.content as { subjective: string }).subjective = 'mutated'
    }).toThrow()

    expect(second.content.subjective).toBe('shared-seed')
    expect(shared.subjective).toBe('shared-seed')
  })
})
