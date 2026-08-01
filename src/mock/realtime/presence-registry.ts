import type { IsoDateTime } from '@/domain/datetime'
import { parseIsoDateTime } from '@/domain/datetime'
import type { NoteId, SessionId, UserId } from '@/domain/ids'
import type { UserRole } from '@/domain/roles'
import type { PresenceActivity, PresenceParticipantDto } from '@/domain/schemas/realtime'

export const DEFAULT_PRESENCE_LEASE_MS = 30_000
export const DEFAULT_PRESENCE_HEARTBEAT_MS = 10_000

export type PresenceClock = {
  now(): IsoDateTime
}

export type PresenceLease = {
  sessionId: SessionId
  noteId: NoteId
  userId: UserId
  displayName: string
  role: UserRole
  activity: PresenceActivity
  lastSeenAt: IsoDateTime
  expiresAtMs: number
}

function toMs(iso: IsoDateTime): number {
  return Date.parse(iso)
}

/**
 * Server-side presence leases. Heartbeat refreshes expiry; sweep removes stale sessions.
 */
export class PresenceRegistry {
  readonly #leaseMs: number
  readonly #clock: PresenceClock
  readonly #bySession = new Map<SessionId, PresenceLease>()

  constructor(
    options: {
      readonly leaseMs?: number
      readonly clock?: PresenceClock
    } = {},
  ) {
    this.#leaseMs = options.leaseMs ?? DEFAULT_PRESENCE_LEASE_MS
    this.#clock = options.clock ?? {
      now: () => parseIsoDateTime(new Date().toISOString()),
    }
  }

  get leaseMs(): number {
    return this.#leaseMs
  }

  upsert(input: {
    readonly sessionId: SessionId
    readonly noteId: NoteId
    readonly userId: UserId
    readonly displayName: string
    readonly role: UserRole
    readonly activity: PresenceActivity
  }): {
    readonly lease: PresenceLease
    readonly created: boolean
    readonly activityChanged: boolean
  } {
    this.sweep()
    const now = this.#clock.now()
    const existing = this.#bySession.get(input.sessionId)
    const expiresAtMs = toMs(now) + this.#leaseMs
    if (!existing) {
      const lease: PresenceLease = {
        sessionId: input.sessionId,
        noteId: input.noteId,
        userId: input.userId,
        displayName: input.displayName,
        role: input.role,
        activity: input.activity,
        lastSeenAt: now,
        expiresAtMs,
      }
      this.#bySession.set(input.sessionId, lease)
      return { lease, created: true, activityChanged: false }
    }

    const noteChanged = existing.noteId !== input.noteId
    const activityChanged = existing.activity !== input.activity
    if (noteChanged) {
      // Moving notes: treat as leave+join at call site; overwrite lease here.
      existing.noteId = input.noteId as PresenceLease['noteId']
    }
    existing.activity = input.activity
    existing.displayName = input.displayName
    existing.role = input.role
    existing.lastSeenAt = now
    existing.expiresAtMs = expiresAtMs
    return { lease: existing, created: false, activityChanged: activityChanged || noteChanged }
  }

  heartbeat(sessionId: SessionId): PresenceLease | null {
    this.sweep()
    const existing = this.#bySession.get(sessionId)
    if (!existing) {
      return null
    }
    const now = this.#clock.now()
    existing.lastSeenAt = now
    existing.expiresAtMs = toMs(now) + this.#leaseMs
    return existing
  }

  leave(sessionId: SessionId): PresenceLease | null {
    const existing = this.#bySession.get(sessionId) ?? null
    if (existing) {
      this.#bySession.delete(sessionId)
    }
    return existing
  }

  listForNote(noteId: NoteId): readonly PresenceParticipantDto[] {
    this.sweep()
    const out: PresenceParticipantDto[] = []
    for (const lease of this.#bySession.values()) {
      if (lease.noteId !== noteId) {
        continue
      }
      out.push(Object.freeze(toParticipant(lease)))
    }
    return out
  }

  /**
   * Remove expired leases. Returns removed leases for event emission.
   */
  sweep(): readonly PresenceLease[] {
    const nowMs = toMs(this.#clock.now())
    const removed: PresenceLease[] = []
    for (const [sessionId, lease] of this.#bySession) {
      if (lease.expiresAtMs <= nowMs) {
        this.#bySession.delete(sessionId)
        removed.push(lease)
      }
    }
    return removed
  }

  clear(): void {
    this.#bySession.clear()
  }
}

function toParticipant(lease: PresenceLease): PresenceParticipantDto {
  return {
    sessionId: lease.sessionId,
    userId: lease.userId,
    displayName: lease.displayName,
    role: lease.role,
    activity: lease.activity,
    lastSeenAt: lease.lastSeenAt,
  }
}
