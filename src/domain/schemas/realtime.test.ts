import { describe, expect, it } from 'vitest'

import { realtimeEventDtoSchema } from '@/domain/schemas'
import {
  buildPresenceRealtimeEventDto,
  buildResyncRequiredRealtimeEventDto,
  buildStatusChangedRealtimeEventDto,
  buildVersionAddedRealtimeEventDto,
} from '@/test/fixtures'

describe('realtime event schemas', () => {
  it('parses NOTE_STATUS_CHANGED with status and actor fields', () => {
    const parsed = realtimeEventDtoSchema.parse(buildStatusChangedRealtimeEventDto())

    expect(parsed).toMatchObject({
      eventType: 'NOTE_STATUS_CHANGED',
      noteId: 'note_123',
      fromStatus: 'READY_FOR_REVIEW',
      toStatus: 'IN_REVIEW',
      actor: {
        id: 'usr_123',
        displayName: 'Dr. Chen',
      },
      eventId: 'evt_rt_1',
      sequence: 1,
      occurredAt: expect.any(String),
    })
  })

  it('parses NOTE_VERSION_CREATED with version identity', () => {
    const parsed = realtimeEventDtoSchema.parse(buildVersionAddedRealtimeEventDto())

    expect(parsed).toMatchObject({
      eventType: 'NOTE_VERSION_CREATED',
      noteId: 'note_123',
      versionId: 'ver_6',
      revision: 6,
      eventId: 'evt_rt_2',
      sequence: 2,
    })
  })

  it('parses PRESENCE_SNAPSHOT with participants', () => {
    const parsed = realtimeEventDtoSchema.parse(buildPresenceRealtimeEventDto())

    expect(parsed).toMatchObject({
      eventType: 'PRESENCE_SNAPSHOT',
      noteId: 'note_123',
      participants: [
        expect.objectContaining({
          userId: 'usr_a',
          role: 'REVIEWER',
          activity: 'VIEWING',
        }),
      ],
      eventId: 'evt_rt_3',
    })
  })

  it('parses RESYNC_REQUIRED', () => {
    const parsed = realtimeEventDtoSchema.parse(buildResyncRequiredRealtimeEventDto())
    expect(parsed.eventType).toBe('RESYNC_REQUIRED')
    expect(parsed.noteId).toBeNull()
  })

  it('rejects unknown real-time event types', () => {
    expect(() =>
      realtimeEventDtoSchema.parse({
        eventType: 'NOTE_UNKNOWN',
        noteId: 'note_123',
        eventId: 'evt_rt_x',
        sequence: 1,
        occurredAt: '2025-11-04T14:41:02Z',
      }),
    ).toThrow()
  })
})
