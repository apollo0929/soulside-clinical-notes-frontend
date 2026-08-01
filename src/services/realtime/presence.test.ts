import { describe, expect, it } from 'vitest'

import { parseIsoDateTime } from '@/domain/datetime'
import { parseNoteId, parseSessionId, parseUserId } from '@/domain/ids'
import {
  createPresenceHeartbeatController,
  PresenceStore,
  summarizePresence,
} from '@/services/realtime/presence'

describe('PresenceStore', () => {
  const ownSession = parseSessionId('ses_own')
  const noteId = parseNoteId('note_presence')

  it('24–28: excludes own session and summarizes viewers/editors', () => {
    const store = new PresenceStore(ownSession)
    store.applyPresenceEvent({
      eventType: 'PRESENCE_JOINED',
      eventId: 'evt_rt_p1' as never,
      sequence: 1,
      occurredAt: parseIsoDateTime('2025-11-04T14:41:02Z'),
      noteId,
      participant: {
        sessionId: ownSession,
        userId: parseUserId('usr_me'),
        displayName: 'Me',
        role: 'CLINICIAN',
        activity: 'EDITING',
        lastSeenAt: parseIsoDateTime('2025-11-04T14:41:02Z'),
      },
    })
    store.applyPresenceEvent({
      eventType: 'PRESENCE_JOINED',
      eventId: 'evt_rt_p2' as never,
      sequence: 2,
      occurredAt: parseIsoDateTime('2025-11-04T14:41:02Z'),
      noteId,
      participant: {
        sessionId: parseSessionId('ses_peer'),
        userId: parseUserId('usr_peer'),
        displayName: 'Alex',
        role: 'REVIEWER',
        activity: 'VIEWING',
        lastSeenAt: parseIsoDateTime('2025-11-04T14:41:02Z'),
      },
    })

    const participants = store.listParticipants(noteId)
    expect(participants).toHaveLength(1)
    expect(summarizePresence(participants)).toBe('Alex is viewing')

    store.applyPresenceEvent({
      eventType: 'PRESENCE_UPDATED',
      eventId: 'evt_rt_p3' as never,
      sequence: 3,
      occurredAt: parseIsoDateTime('2025-11-04T14:41:02Z'),
      noteId,
      participant: {
        sessionId: parseSessionId('ses_peer'),
        userId: parseUserId('usr_peer'),
        displayName: 'Alex',
        role: 'REVIEWER',
        activity: 'EDITING',
        lastSeenAt: parseIsoDateTime('2025-11-04T14:41:02Z'),
      },
    })
    expect(summarizePresence(store.listParticipants(noteId))).toBe('Alex is editing')
  })

  it('29: snapshot replaces note participants', () => {
    const store = new PresenceStore(ownSession)
    store.applyPresenceEvent({
      eventType: 'PRESENCE_SNAPSHOT',
      eventId: 'evt_rt_p4' as never,
      sequence: 4,
      occurredAt: parseIsoDateTime('2025-11-04T14:41:02Z'),
      noteId,
      participants: [
        {
          sessionId: parseSessionId('ses_a'),
          userId: parseUserId('usr_a'),
          displayName: 'A',
          role: 'REVIEWER',
          activity: 'VIEWING',
          lastSeenAt: parseIsoDateTime('2025-11-04T14:41:02Z'),
        },
        {
          sessionId: parseSessionId('ses_b'),
          userId: parseUserId('usr_b'),
          displayName: 'B',
          role: 'REVIEWER',
          activity: 'VIEWING',
          lastSeenAt: parseIsoDateTime('2025-11-04T14:41:02Z'),
        },
      ],
    })
    expect(summarizePresence(store.listParticipants(noteId))).toBe('2 other people are viewing')
  })

  it('30: heartbeat controller uses injectable scheduler', () => {
    const runs: number[] = []
    const scheduled: Array<() => void> = []
    const controller = createPresenceHeartbeatController({
      heartbeatMs: 10,
      scheduler: {
        schedule(_delay, work) {
          scheduled.push(work)
          return () => undefined
        },
      },
    })

    controller.start({
      noteId,
      sendHeartbeat: () => {
        runs.push(Date.now())
      },
    })

    expect(scheduled).toHaveLength(1)
    scheduled[0]?.()
    expect(runs).toHaveLength(1)
    controller.stop()
  })
})
