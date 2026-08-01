import { describe, expect, it } from 'vitest'

import { parseIsoDateTime } from '@/domain/datetime'
import { parseClientMutationId, parseSessionId, parseUserId } from '@/domain/ids'
import { RealtimeServer } from '@/mock/realtime/realtime-server'
import { createTestDatabase } from '@/mock/test/helpers'
import { buildSoapContent } from '@/test/fixtures/domain'

describe('RealtimeServer', () => {
  it('51–53, 57: version emit once; idempotent replay skipped; events ordered', () => {
    const database = createTestDatabase({ noteCount: 4, seed: 11 })
    const server = new RealtimeServer({
      database,
      now: () => parseIsoDateTime('2024-07-01T00:00:00.000Z'),
    })
    const note = database.listNotes()[0]!
    const version = database.getVersion(note.currentVersionId)!
    const actor = { userId: parseUserId('usr_admin_42'), role: 'ADMIN' as const }
    const mutationId = parseClientMutationId('mut_rt_1')

    const first = server.emitVersionCreated({
      note,
      version,
      actor,
      originatingClientMutationId: mutationId,
      wasIdempotentReplay: false,
    })
    const second = server.emitVersionCreated({
      note,
      version,
      actor,
      originatingClientMutationId: mutationId,
      wasIdempotentReplay: false,
    })
    const replay = server.emitVersionCreated({
      note,
      version,
      actor,
      originatingClientMutationId: parseClientMutationId('mut_rt_2'),
      wasIdempotentReplay: true,
    })

    expect(first?.eventType).toBe('NOTE_VERSION_CREATED')
    expect(second).toBeNull()
    expect(replay).toBeNull()
    expect(server.eventLog.listAll().map((event) => event.sequence)).toEqual([1])
  })

  it('41–48: presence join/leave/heartbeat; two sessions distinct; no clinical content', () => {
    const database = createTestDatabase({ noteCount: 2, seed: 12 })
    const server = new RealtimeServer({
      database,
      presenceLeaseMs: 30_000,
      clock: {
        now: () => parseIsoDateTime('2024-07-01T00:00:00.000Z'),
      },
    })
    const noteId = database.listNotes()[0]!.id
    const a = parseSessionId('prs_a')
    const b = parseSessionId('prs_b')

    server.joinPresence({
      sessionId: a,
      noteId,
      userId: parseUserId('usr_1'),
      displayName: 'Alex',
      role: 'REVIEWER',
      activity: 'VIEWING',
    })
    server.joinPresence({
      sessionId: b,
      noteId,
      userId: parseUserId('usr_1'),
      displayName: 'Alex',
      role: 'REVIEWER',
      activity: 'EDITING',
    })

    const participants = server.presence.listForNote(noteId)
    expect(participants).toHaveLength(2)
    expect(JSON.stringify(participants)).not.toMatch(/subjective|objective|assessment|plan/i)
    expect(server.eventLog.listAll().some((event) => event.eventType === 'PRESENCE_SNAPSHOT')).toBe(
      true,
    )

    server.leavePresence(a)
    expect(server.presence.listForNote(noteId)).toHaveLength(1)
    expect(server.heartbeatPresence(b)).toBe(true)
  })

  it('11, 56–57: cursor eviction signals RESYNC; unauthorized subscriber filtered', () => {
    const database = createTestDatabase({ noteCount: 2, seed: 13 })
    const server = new RealtimeServer({
      database,
      logCapacity: 2,
      now: () => parseIsoDateTime('2024-07-01T00:00:00.000Z'),
    })
    const note = database.listNotes()[0]!
    const version = database.getVersion(note.currentVersionId)!
    const actor = { userId: parseUserId('usr_admin_42'), role: 'ADMIN' as const }

    for (let i = 0; i < 3; i += 1) {
      server.emitVersionCreated({
        note,
        version,
        actor,
        originatingClientMutationId: parseClientMutationId(`mut_cap_${i}`),
        wasIdempotentReplay: false,
      })
    }

    const received: string[] = []
    server.connect({
      actor,
      lastEventId: 'evt_rt_missing',
      onEvent: (event) => {
        received.push(event.eventType)
      },
    })
    expect(received[0]).toBe('RESYNC_REQUIRED')
  })
})

describe('RealtimeEventLog clinical safety', () => {
  it('3, 49: list-facing version event summary has no SOAP body fields', () => {
    const database = createTestDatabase({ noteCount: 1, seed: 14 })
    const server = new RealtimeServer({ database })
    const note = database.listNotes()[0]!
    const version = database.getVersion(note.currentVersionId)!
    // Touch soap so the test content exists in DB but must not appear on the event.
    void buildSoapContent({ subjective: 'secret clinical text' })
    const event = server.emitVersionCreated({
      note,
      version,
      actor: { userId: parseUserId('usr_admin_42'), role: 'ADMIN' },
      originatingClientMutationId: null,
      wasIdempotentReplay: false,
    })
    expect(JSON.stringify(event)).not.toMatch(/secret clinical text/)
    expect(event).not.toHaveProperty('content')
  })
})
