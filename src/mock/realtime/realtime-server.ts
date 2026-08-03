import { authorize } from '@/domain/authorization'
import type { IsoDateTime } from '@/domain/datetime'
import { parseIsoDateTime } from '@/domain/datetime'
import type {
  ClientMutationId,
  NoteId,
  RealtimeEventId,
  SessionId,
  UserId,
  VersionId,
} from '@/domain/ids'
import { parseRealtimeEventId } from '@/domain/ids'
import type { Note } from '@/domain/models/note'
import type { NoteVersion } from '@/domain/models/note-version'
import type { UserRole } from '@/domain/roles'
import type {
  NoteSummaryRealtimeDto,
  PresenceActivity,
  RealtimeEventDto,
} from '@/domain/schemas/realtime'
import { realtimeEventDtoSchema } from '@/domain/schemas/realtime'
import type { NoteStatus } from '@/domain/statuses'
import type { MockDatabase } from '@/mock/database/repository'
import {
  DEFAULT_PRESENCE_HEARTBEAT_MS,
  DEFAULT_PRESENCE_LEASE_MS,
  type PresenceClock,
  PresenceRegistry,
} from '@/mock/realtime/presence-registry'
import {
  DEFAULT_REALTIME_EVENT_LOG_CAPACITY,
  type RealtimeEventDraft,
  RealtimeEventLog,
} from '@/mock/realtime/realtime-event-log'
import type { ActorContext } from '@/mock/services/seed-service'

export type RealtimeSubscriber = {
  readonly id: string
  readonly actor: ActorContext
  readonly onEvent: (event: RealtimeEventDto) => void
}

export type RealtimeServerOptions = {
  readonly database: MockDatabase
  readonly logCapacity?: number
  readonly presenceLeaseMs?: number
  readonly presenceHeartbeatMs?: number
  readonly clock?: PresenceClock
  readonly now?: () => IsoDateTime
}

function newEventId(sequence: number): RealtimeEventId {
  return parseRealtimeEventId(`evt_rt_${sequence}`)
}

function actorDisplayName(actor: ActorContext): string {
  return `${actor.role.toLowerCase()}_${String(actor.userId).slice(-4)}`
}

/**
 * Mock realtime server: event log, presence leases, actor-filtered fan-out.
 * Does not import React. Wired from MockBackendService after REST commits.
 */
export class RealtimeServer {
  readonly eventLog: RealtimeEventLog
  readonly presence: PresenceRegistry
  readonly presenceHeartbeatMs: number
  readonly #database: MockDatabase
  readonly #now: () => IsoDateTime
  readonly #subscribers = new Map<string, RealtimeSubscriber>()
  #subscriberSeq = 0
  /** Dedupes logical emission when the same mutation id already emitted. */
  readonly #emittedMutationIds = new Set<string>()

  constructor(options: RealtimeServerOptions) {
    this.#database = options.database
    this.#now =
      options.now ?? options.clock?.now ?? (() => parseIsoDateTime(new Date().toISOString()))
    this.eventLog = new RealtimeEventLog(options.logCapacity ?? DEFAULT_REALTIME_EVENT_LOG_CAPACITY)
    this.presence = new PresenceRegistry({
      leaseMs: options.presenceLeaseMs ?? DEFAULT_PRESENCE_LEASE_MS,
      clock: options.clock ?? { now: this.#now },
    })
    this.presenceHeartbeatMs = options.presenceHeartbeatMs ?? DEFAULT_PRESENCE_HEARTBEAT_MS
  }

  subscribe(actor: ActorContext, onEvent: (event: RealtimeEventDto) => void): () => void {
    const id = `sub_${++this.#subscriberSeq}`
    this.#subscribers.set(id, { id, actor, onEvent })
    return () => {
      this.#subscribers.delete(id)
    }
  }

  /**
   * Replay retained events after lastEventId, then live delivery via returned unsubscribe.
   * When the cursor was evicted, emits a single RESYNC_REQUIRED then live delivery continues.
   */
  connect(input: {
    readonly actor: ActorContext
    readonly lastEventId: string | null
    readonly onEvent: (event: RealtimeEventDto) => void
  }): () => void {
    this.sweepPresenceAndEmit()
    const replay = this.eventLog.replayAfter(input.lastEventId)
    if (!replay.ok) {
      input.onEvent(
        this.#appendAndValidate({
          eventType: 'RESYNC_REQUIRED',
          eventId: newEventId(this.eventLog.nextSequence),
          occurredAt: this.#now(),
          noteId: null,
          reason: 'Missed-event cursor is no longer retained; full resync required.',
        }),
      )
    } else {
      for (const event of replay.events) {
        if (this.#mayDeliver(input.actor, event)) {
          input.onEvent(event)
        }
      }
    }
    return this.subscribe(input.actor, (event) => {
      if (this.#mayDeliver(input.actor, event)) {
        input.onEvent(event)
      }
    })
  }

  emitVersionCreated(input: {
    readonly note: Note
    readonly version: NoteVersion
    readonly actor: ActorContext
    readonly originatingClientMutationId: ClientMutationId | null
    readonly wasIdempotentReplay: boolean
  }): RealtimeEventDto | null {
    if (input.wasIdempotentReplay) {
      return null
    }
    if (input.originatingClientMutationId) {
      const key = String(input.originatingClientMutationId)
      if (this.#emittedMutationIds.has(key)) {
        return null
      }
      this.#emittedMutationIds.add(key)
    }
    const event = this.#appendAndValidate({
      eventType: 'NOTE_VERSION_CREATED',
      eventId: newEventId(this.eventLog.nextSequence),
      occurredAt: this.#now(),
      noteId: input.note.id,
      versionId: input.version.id,
      revision: input.version.revisionNumber,
      parentVersionId: input.version.parentVersionId ?? input.version.id,
      updatedAt: input.note.updatedAt,
      author: {
        id: input.version.authorId,
        displayName: actorDisplayName({
          userId: input.version.authorId,
          role: input.version.authorRole,
        }),
        role: input.version.authorRole,
      },
      originatingClientMutationId: input.originatingClientMutationId,
      summary: this.#summaryForNote(input.note, {
        versionId: input.version.id,
        revision: input.version.revisionNumber,
      }),
    })
    this.#fanOut(event)
    return event
  }

  emitStatusChanged(input: {
    readonly note: Note
    readonly fromStatus: NoteStatus
    readonly toStatus: NoteStatus
    readonly actor: ActorContext
  }): RealtimeEventDto {
    const event = this.#appendAndValidate({
      eventType: 'NOTE_STATUS_CHANGED',
      eventId: newEventId(this.eventLog.nextSequence),
      occurredAt: this.#now(),
      noteId: input.note.id,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      actor: {
        id: input.actor.userId,
        displayName: actorDisplayName(input.actor),
      },
      summary: this.#summaryForNote(input.note),
    })
    this.#fanOut(event)
    return event
  }

  emitReviewerChanged(input: {
    readonly note: Note
    readonly actor: ActorContext
  }): RealtimeEventDto {
    const reviewer = input.note.assignedReviewerId
      ? this.#database.getUser(input.note.assignedReviewerId)
      : null
    const event = this.#appendAndValidate({
      eventType: 'NOTE_REVIEWER_CHANGED',
      eventId: newEventId(this.eventLog.nextSequence),
      occurredAt: this.#now(),
      noteId: input.note.id,
      assignedReviewer: reviewer
        ? { id: reviewer.id, displayName: reviewer.displayName, role: reviewer.role }
        : null,
      actor: {
        id: input.actor.userId,
        displayName: actorDisplayName(input.actor),
      },
      summary: this.#summaryForNote(input.note),
    })
    this.#fanOut(event)
    return event
  }

  joinPresence(input: {
    readonly sessionId: SessionId
    readonly noteId: NoteId
    readonly userId: UserId
    readonly displayName: string
    readonly role: UserRole
    readonly activity: PresenceActivity
  }): RealtimeEventDto {
    this.sweepPresenceAndEmit()
    const { lease, created, activityChanged } = this.presence.upsert(input)
    const participant = {
      sessionId: lease.sessionId,
      userId: lease.userId,
      displayName: lease.displayName,
      role: lease.role,
      activity: lease.activity,
      lastSeenAt: lease.lastSeenAt,
    }
    const event = this.#appendAndValidate(
      created
        ? {
            eventType: 'PRESENCE_JOINED',
            eventId: newEventId(this.eventLog.nextSequence),
            occurredAt: this.#now(),
            noteId: input.noteId,
            participant,
          }
        : {
            eventType: 'PRESENCE_UPDATED',
            eventId: newEventId(this.eventLog.nextSequence),
            occurredAt: this.#now(),
            noteId: input.noteId,
            participant,
          },
    )
    // Skip fan-out when only a heartbeat-equivalent upsert with no activity change —
    // callers should use heartbeat() for silent refresh. joinPresence always emits.
    void activityChanged
    this.#fanOut(event)
    // Joiner needs peers already on the note (JOINED alone does not snapshot them).
    if (created) {
      this.snapshotPresence(input.noteId)
    }
    return event
  }

  heartbeatPresence(sessionId: SessionId): boolean {
    this.sweepPresenceAndEmit()
    return this.presence.heartbeat(sessionId) !== null
  }

  leavePresence(sessionId: SessionId): RealtimeEventDto | null {
    const lease = this.presence.leave(sessionId)
    if (!lease) {
      return null
    }
    const event = this.#appendAndValidate({
      eventType: 'PRESENCE_LEFT',
      eventId: newEventId(this.eventLog.nextSequence),
      occurredAt: this.#now(),
      noteId: lease.noteId,
      sessionId: lease.sessionId,
      userId: lease.userId,
    })
    this.#fanOut(event)
    return event
  }

  snapshotPresence(noteId: NoteId): RealtimeEventDto {
    this.sweepPresenceAndEmit()
    const event = this.#appendAndValidate({
      eventType: 'PRESENCE_SNAPSHOT',
      eventId: newEventId(this.eventLog.nextSequence),
      occurredAt: this.#now(),
      noteId,
      participants: [...this.presence.listForNote(noteId)],
    })
    this.#fanOut(event)
    return event
  }

  sweepPresenceAndEmit(): void {
    const expired = this.presence.sweep()
    for (const lease of expired) {
      const event = this.#appendAndValidate({
        eventType: 'PRESENCE_LEFT',
        eventId: newEventId(this.eventLog.nextSequence),
        occurredAt: this.#now(),
        noteId: lease.noteId,
        sessionId: lease.sessionId,
        userId: lease.userId,
      })
      this.#fanOut(event)
    }
  }

  clearForTests(): void {
    this.eventLog.clear()
    this.presence.clear()
    this.#emittedMutationIds.clear()
    this.#subscribers.clear()
  }

  /** Test helper: live SSE/in-process subscriber count. */
  getSubscriberCount(): number {
    return this.#subscribers.size
  }

  /** Test helper: active presence lease count. */
  getPresenceSessionCount(): number {
    return this.presence.size
  }

  #summaryForNote(
    note: Note,
    head?: { readonly versionId: VersionId; readonly revision: number },
  ): NoteSummaryRealtimeDto {
    const reviewer = note.assignedReviewerId
      ? this.#database.getUser(note.assignedReviewerId)
      : null
    const versions = this.#database.listVersionsForNote(note.id)
    const current =
      head !== undefined ? null : versions.find((version) => version.id === note.currentVersionId)
    const currentVersionId = head?.versionId ?? note.currentVersionId
    const currentRevision = head?.revision ?? current?.revisionNumber
    if (currentRevision === undefined || currentRevision < 1) {
      throw new Error(`Unable to resolve currentRevision for note ${note.id}`)
    }
    return {
      id: note.id,
      status: note.status,
      currentVersionId,
      currentRevision,
      assignedReviewer: reviewer
        ? { id: reviewer.id, displayName: reviewer.displayName, role: reviewer.role }
        : null,
      updatedAt: note.updatedAt,
    }
  }

  #appendAndValidate(event: RealtimeEventDraft): RealtimeEventDto {
    const withSequence = this.eventLog.append(event)
    return realtimeEventDtoSchema.parse(withSequence)
  }

  #fanOut(event: RealtimeEventDto): void {
    for (const subscriber of this.#subscribers.values()) {
      if (!this.#mayDeliver(subscriber.actor, event)) {
        continue
      }
      try {
        subscriber.onEvent(event)
      } catch {
        // Drop dead SSE/stream subscribers without failing emission.
      }
    }
  }

  #mayDeliver(actor: ActorContext, event: RealtimeEventDto): boolean {
    if (event.eventType === 'RESYNC_REQUIRED') {
      return true
    }
    const noteId = 'noteId' in event ? event.noteId : null
    if (noteId === null) {
      return true
    }
    const note = this.#database.getNote(noteId)
    if (!note) {
      return false
    }
    const versions = this.#database.listVersionsForNote(note.id)
    const firstVersion = [...versions].sort((a, b) => a.revisionNumber - b.revisionNumber)[0]
    if (!firstVersion) {
      return false
    }
    const auth = authorize({
      permission: 'NOTE_CONTENT_VIEW',
      actor: { userId: actor.userId, role: actor.role },
      resource: {
        kind: 'NOTE',
        noteId: note.id,
        clinicianId: firstVersion.authorId,
        assignedReviewerId: note.assignedReviewerId,
      },
    })
    return auth.allowed
  }
}

export {
  DEFAULT_PRESENCE_HEARTBEAT_MS,
  DEFAULT_PRESENCE_LEASE_MS,
  DEFAULT_REALTIME_EVENT_LOG_CAPACITY,
}
