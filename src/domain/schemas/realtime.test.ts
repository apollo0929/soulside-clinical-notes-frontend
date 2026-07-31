import { describe, expect, it } from 'vitest'

import { realtimeEventDtoSchema } from '@/domain/schemas'
import {
  buildPresenceRealtimeEventDto,
  buildStatusChangedRealtimeEventDto,
  buildVersionAddedRealtimeEventDto,
} from '@/test/fixtures'

describe('realtime event schemas', () => {
  it('parses note.status_changed with status and actor fields', () => {
    const parsed = realtimeEventDtoSchema.parse(buildStatusChangedRealtimeEventDto())

    expect(parsed).toMatchObject({
      type: 'note.status_changed',
      noteId: 'note_123',
      fromStatus: 'READY_FOR_REVIEW',
      toStatus: 'IN_REVIEW',
      actor: {
        id: 'usr_123',
        displayName: 'Dr. Chen',
      },
      eventId: 'evt_rt_1',
    })
  })

  it('parses note.version_added with version identity', () => {
    const parsed = realtimeEventDtoSchema.parse(buildVersionAddedRealtimeEventDto())

    expect(parsed).toMatchObject({
      type: 'note.version_added',
      noteId: 'note_123',
      version: {
        id: 'ver_6',
        revision: 6,
      },
      eventId: 'evt_rt_2',
    })
  })

  it('parses note.presence with viewers', () => {
    const parsed = realtimeEventDtoSchema.parse(buildPresenceRealtimeEventDto())

    expect(parsed).toMatchObject({
      type: 'note.presence',
      noteId: 'note_123',
      viewers: [{ id: 'usr_a', role: 'REVIEWER' }],
      eventId: 'evt_rt_3',
    })
  })

  it('rejects unknown real-time event types', () => {
    expect(() =>
      realtimeEventDtoSchema.parse({
        type: 'note.unknown',
        noteId: 'note_123',
        eventId: 'evt_rt_x',
      }),
    ).toThrow()
  })
})
