import type { NoteId, SessionId } from '@/domain/ids'
import type {
  PresenceJoinedEventDto,
  PresenceLeftEventDto,
  PresenceParticipantDto,
  PresenceSnapshotEventDto,
  PresenceUpdatedEventDto,
  RealtimeEventDto,
} from '@/domain/schemas/realtime'

export const PRESENCE_HEARTBEAT_MS = 10_000
export const PRESENCE_LEASE_MS = 30_000

const EMPTY_PARTICIPANTS: readonly PresenceParticipantDto[] = Object.freeze([])

export type PresenceScheduler = {
  schedule(delayMs: number, work: () => void): () => void
}

export type PresenceSummary =
  | 'No other viewers'
  | `${string} is viewing`
  | `${string} is editing`
  | `${number} other people are viewing`

type PresenceEvent =
  PresenceJoinedEventDto | PresenceUpdatedEventDto | PresenceLeftEventDto | PresenceSnapshotEventDto

function defaultScheduler(): PresenceScheduler {
  return {
    schedule(delayMs, work) {
      const handle = globalThis.setTimeout(work, delayMs)
      return () => globalThis.clearTimeout(handle)
    },
  }
}

/**
 * Client-side presence projection. Excludes the local tab session.
 * Snapshots are referentially stable until the note's presence changes (for useSyncExternalStore).
 */
export class PresenceStore {
  readonly #ownSessionId: SessionId
  readonly #byNote = new Map<NoteId, Map<SessionId, PresenceParticipantDto>>()
  readonly #snapshots = new Map<NoteId, readonly PresenceParticipantDto[]>()
  readonly #listeners = new Set<() => void>()
  #revision = 0

  constructor(ownSessionId: SessionId) {
    this.#ownSessionId = ownSessionId
  }

  get ownSessionId(): SessionId {
    return this.#ownSessionId
  }

  /** Monotonic revision for useSyncExternalStore getSnapshot stability. */
  getRevision(): number {
    return this.#revision
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  applyPresenceEvent(event: PresenceEvent): void {
    switch (event.eventType) {
      case 'PRESENCE_JOINED':
      case 'PRESENCE_UPDATED':
        this.#upsertParticipant(event.noteId, event.participant)
        this.#refreshSnapshot(event.noteId)
        this.#emit()
        return
      case 'PRESENCE_LEFT':
        this.#removeParticipant(event.noteId, event.sessionId)
        this.#refreshSnapshot(event.noteId)
        this.#emit()
        return
      case 'PRESENCE_SNAPSHOT':
        this.#replaceSnapshot(event.noteId, event.participants)
        this.#refreshSnapshot(event.noteId)
        this.#emit()
        return
      default:
        return
    }
  }

  listParticipants(noteId: NoteId): readonly PresenceParticipantDto[] {
    return this.#snapshots.get(noteId) ?? EMPTY_PARTICIPANTS
  }

  clear(): void {
    this.#byNote.clear()
    this.#snapshots.clear()
    this.#emit()
  }

  #emit(): void {
    this.#revision += 1
    for (const listener of this.#listeners) {
      listener()
    }
  }

  #refreshSnapshot(noteId: NoteId): void {
    const sessions = this.#byNote.get(noteId)
    if (!sessions || sessions.size === 0) {
      this.#snapshots.set(noteId, EMPTY_PARTICIPANTS)
      return
    }
    const others = [...sessions.values()].filter(
      (participant) => participant.sessionId !== this.#ownSessionId,
    )
    this.#snapshots.set(noteId, others.length === 0 ? EMPTY_PARTICIPANTS : Object.freeze(others))
  }

  #upsertParticipant(noteId: NoteId, participant: PresenceParticipantDto): void {
    let sessions = this.#byNote.get(noteId)
    if (!sessions) {
      sessions = new Map()
      this.#byNote.set(noteId, sessions)
    }
    sessions.set(participant.sessionId, Object.freeze({ ...participant }))
  }

  #removeParticipant(noteId: NoteId, sessionId: SessionId): void {
    const sessions = this.#byNote.get(noteId)
    if (!sessions) {
      return
    }
    sessions.delete(sessionId)
    if (sessions.size === 0) {
      this.#byNote.delete(noteId)
    }
  }

  #replaceSnapshot(noteId: NoteId, participants: readonly PresenceParticipantDto[]): void {
    const sessions = new Map<SessionId, PresenceParticipantDto>()
    for (const participant of participants) {
      sessions.set(participant.sessionId, Object.freeze({ ...participant }))
    }
    this.#byNote.set(noteId, sessions)
  }
}

export function summarizePresence(
  participants: readonly PresenceParticipantDto[],
): PresenceSummary {
  const others = participants.filter((participant) => participant.activity !== undefined)
  if (others.length === 0) {
    return 'No other viewers'
  }

  const editing = others.find((participant) => participant.activity === 'EDITING')
  if (editing) {
    return `${editing.displayName} is editing`
  }

  if (others.length === 1) {
    return `${others[0]!.displayName} is viewing`
  }

  return `${others.length} other people are viewing`
}

export type PresenceHeartbeatController = {
  start(input: {
    readonly noteId: NoteId
    readonly sendHeartbeat: () => void | Promise<void>
  }): void
  stop(): void
}

export function createPresenceHeartbeatController(
  input: {
    readonly scheduler?: PresenceScheduler
    readonly heartbeatMs?: number
  } = {},
): PresenceHeartbeatController {
  const scheduler = input.scheduler ?? defaultScheduler()
  const heartbeatMs = input.heartbeatMs ?? PRESENCE_HEARTBEAT_MS
  let cancel: (() => void) | null = null

  return {
    start({ sendHeartbeat }) {
      cancel?.()
      const tick = () => {
        void sendHeartbeat()
        cancel = scheduler.schedule(heartbeatMs, tick)
      }
      cancel = scheduler.schedule(heartbeatMs, tick)
    },
    stop() {
      cancel?.()
      cancel = null
    },
  }
}

export function isPresenceEvent(event: RealtimeEventDto): event is PresenceEvent {
  return (
    event.eventType === 'PRESENCE_JOINED' ||
    event.eventType === 'PRESENCE_UPDATED' ||
    event.eventType === 'PRESENCE_LEFT' ||
    event.eventType === 'PRESENCE_SNAPSHOT'
  )
}
